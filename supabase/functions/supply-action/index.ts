import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function b64url(s: string): string {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  return t + "=".repeat((4 - t.length % 4) % 4);
}

// ── Types (mirror src/store/gameStore.ts + src/data/gear.ts) ─────────────────

type ShopSlot = {
  speciesId:      string;
  price:          number;
  quantity:       number;
  isFertilizer?:  boolean;
  fertilizerType?: string;
  isGear?:        boolean;
  gearType?:      string;
  isConsumable?:  boolean;
  consumableId?:  string;
  isEmpty?:       boolean;
};

type GearInvItem    = { gearType: string; quantity: number };
type FertItem       = { type: string;     quantity: number };
type ConsumableItem = { id: string;       quantity: number };

// ── Response helpers ─────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const err = (msg: string, status = 400) => json({ error: msg }, status);

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return err("Unauthorized", 401);

    const token = authHeader.replace("Bearer ", "");
    let userId: string;
    try {
      const p = JSON.parse(atob(b64url(token.split(".")[1])));
      userId = p.sub;
    } catch {
      return err("Unauthorized", 401);
    }

    const body = await req.json() as {
      action:          "buy" | "sync";
      slotId?:         string;
      supplyShop?:     ShopSlot[];
      lastSupplyReset?: number;
    };

    const { action } = body;
    if (!["buy", "sync"].includes(action)) {
      return err("Invalid action — use buy | sync");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── sync: push the restocked supply shop to DB ────────────────────────────
    if (action === "sync") {
      const authResult = await supabaseAdmin.auth.getUser(token);
      if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
        return err("Unauthorized", 401);
      }
      if (!body.supplyShop || typeof body.lastSupplyReset !== "number") {
        return err("supplyShop and lastSupplyReset required for sync");
      }

      const { error: ue } = await supabaseAdmin
        .from("game_saves")
        .update({
          supply_shop:        body.supplyShop,
          last_supply_reset:  body.lastSupplyReset,
          updated_at:         new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (ue) return err("Failed to sync supply shop", 500);
      return json({ ok: true });
    }

    // ── buy ───────────────────────────────────────────────────────────────────
    if (action === "buy") {
      if (!body.slotId) return err("slotId required");

      const [authResult, saveResult] = await Promise.all([
        supabaseAdmin.auth.getUser(token),
        supabaseAdmin
          .from("game_saves")
          .select("coins, supply_shop, fertilizers, gear_inventory, consumables, updated_at")
          .eq("user_id", userId)
          .single(),
      ]);

      if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
        return err("Unauthorized", 401);
      }
      if (saveResult.error || !saveResult.data) {
        return err("Save not found", 404);
      }

      const save = saveResult.data;
      const priorUpdatedAt = save.updated_at as string;
      let coins         = save.coins as number;
      let supplyShop    = [...(save.supply_shop   ?? []) as ShopSlot[]];
      let fertilizers   = [...(save.fertilizers   ?? []) as FertItem[]];
      let gearInventory = [...(save.gear_inventory ?? []) as GearInvItem[]];
      let consumables   = [...(save.consumables   ?? []) as ConsumableItem[]];

      const slot = supplyShop.find((s) => s.speciesId === body.slotId);
      if (!slot || slot.isEmpty)      return err("Slot not found");
      if (slot.quantity < 1)          return err("Out of stock");
      if (coins < slot.price)         return err("Not enough coins");

      coins -= slot.price;
      supplyShop = supplyShop.map((s) =>
        s.speciesId === body.slotId ? { ...s, quantity: s.quantity - 1 } : s
      );

      if (slot.isFertilizer && slot.fertilizerType) {
        const fert = fertilizers.find((f) => f.type === slot.fertilizerType);
        fertilizers = fert
          ? fertilizers.map((f) => f.type === slot.fertilizerType ? { ...f, quantity: f.quantity + 1 } : f)
          : [...fertilizers, { type: slot.fertilizerType, quantity: 1 }];

      } else if (slot.isGear && slot.gearType) {
        const existing = gearInventory.find((g) => g.gearType === slot.gearType);
        gearInventory = existing
          ? gearInventory.map((g) => g.gearType === slot.gearType ? { ...g, quantity: g.quantity + 1 } : g)
          : [...gearInventory, { gearType: slot.gearType, quantity: 1 }];

      } else if (slot.isConsumable && slot.consumableId) {
        const existing = consumables.find((c) => c.id === slot.consumableId);
        consumables = existing
          ? consumables.map((c) => c.id === slot.consumableId ? { ...c, quantity: c.quantity + 1 } : c)
          : [...consumables, { id: slot.consumableId, quantity: 1 }];

      } else {
        return err("Slot has invalid type — not fertilizer, gear, or consumable");
      }

      const { data: ud, error: ue } = await supabaseAdmin
        .from("game_saves")
        .update({
          coins,
          supply_shop:    supplyShop,
          fertilizers,
          gear_inventory: gearInventory,
          consumables,
          updated_at:     new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("updated_at", priorUpdatedAt)
        .select("updated_at")
        .single();

      if (ue || !ud) return err("Save was modified by another action", 409);

      void supabaseAdmin.from("action_log").insert({
        user_id: userId, action: "supply_buy",
        payload: { slotId: body.slotId },
        result:  { coins, type: slot.isFertilizer ? "fertilizer" : slot.isGear ? "gear" : "consumable" },
      });

      return json({ ok: true, coins, supplyShop, fertilizers, gearInventory, consumables, serverUpdatedAt: ud.updated_at });
    }

    return err("Unhandled action");

  } catch (e) {
    console.error("supply-action error:", e);
    return err("Internal server error", 500);
  }
});
