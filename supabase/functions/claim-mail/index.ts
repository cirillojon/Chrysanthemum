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

interface InventoryItem  { speciesId: string; quantity: number; mutation?: string; isSeed?: boolean; }
interface FertilizerItem { type: string; quantity: number; }
interface GearItem       { gearType: string; quantity: number; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    let userId: string;
    try {
      const p = JSON.parse(atob(b64url(token.split(".")[1])));
      userId = p.sub;
    } catch {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { mailId } = await req.json() as { mailId: string };
    if (!mailId) {
      return new Response(JSON.stringify({ error: "mailId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Load auth + mail + save in parallel ───────────────────────────────────
    const [authResult, mailResult, saveResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin.from("mailbox").select("*").eq("id", mailId).single(),
      supabaseAdmin
        .from("game_saves")
        .select("coins, inventory, fertilizers, gear_inventory, discovered")
        .eq("user_id", userId)
        .single(),
    ]);

    if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (mailResult.error || !mailResult.data) {
      return new Response(JSON.stringify({ error: "Mail not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (saveResult.error || !saveResult.data) {
      return new Response(JSON.stringify({ error: "Save not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mail = mailResult.data;
    if (mail.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Not your mail" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotent: already claimed — return current save state
    if (mail.claimed) {
      const save = saveResult.data;
      return new Response(
        JSON.stringify({
          ok:            true,
          kind:          mail.kind,
          alreadyClaimed: true,
          coins:         save.coins,
          inventory:     save.inventory     ?? [],
          fertilizers:   save.fertilizers   ?? [],
          gearInventory: save.gear_inventory ?? [],
          discovered:    save.discovered    ?? [],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Deliver item ──────────────────────────────────────────────────────────
    const save       = saveResult.data;
    let coins        = save.coins as number;
    let inventory    = [...(save.inventory     ?? []) as InventoryItem[]];
    let fertilizers  = [...(save.fertilizers   ?? []) as FertilizerItem[]];
    let gearInventory = [...(save.gear_inventory ?? []) as GearItem[]];
    const discovered = [...(save.discovered    ?? []) as string[]];

    const kind      = mail.kind      as string;
    const speciesId = mail.species_id as string | null;
    const mutation  = mail.mutation  as string | null;
    const isSeed    = (mail.is_seed  as boolean) ?? false;
    const amount    = mail.amount    as number   | null;

    if (kind === "coins") {
      // ── Coins: credit buyer's wallet ─────────────────────────────────────
      coins += amount ?? 0;

    } else if (kind === "fertilizer" && speciesId) {
      // ── Fertilizer: strip prefix, add to fertilizers array ───────────────
      const fertType = speciesId.startsWith("fert:") ? speciesId.replace("fert:", "") : speciesId;
      const existing = fertilizers.find((f) => f.type === fertType);
      fertilizers = existing
        ? fertilizers.map((f) => f.type === fertType ? { ...f, quantity: f.quantity + 1 } : f)
        : [...fertilizers, { type: fertType, quantity: 1 }];

    } else if (kind === "gear" && speciesId) {
      // ── Gear: strip prefix, add to gear inventory ─────────────────────────
      const gearType = speciesId.startsWith("gear:") ? speciesId.replace("gear:", "") : speciesId;
      const existing = gearInventory.find((g) => g.gearType === gearType);
      gearInventory = existing
        ? gearInventory.map((g) => g.gearType === gearType ? { ...g, quantity: g.quantity + 1 } : g)
        : [...gearInventory, { gearType, quantity: 1 }];

    } else if ((kind === "flower" || kind === "seed") && speciesId) {
      // ── Flower / seed: add to inventory ──────────────────────────────────
      const mutNorm = mutation ?? null;
      const existing = inventory.find(
        (i) => i.speciesId === speciesId &&
               (i.mutation ?? null) === mutNorm &&
               (i.isSeed ?? false) === isSeed
      );
      inventory = existing
        ? inventory.map((i) =>
            i.speciesId === speciesId &&
            (i.mutation ?? null) === mutNorm &&
            (i.isSeed ?? false) === isSeed
              ? { ...i, quantity: i.quantity + 1 }
              : i
          )
        : [...inventory, { speciesId, quantity: 1, mutation: mutation ?? undefined, isSeed }];

      // Update codex
      if (!discovered.includes(speciesId)) discovered.push(speciesId);
      if (mutation) {
        const mutKey = `${speciesId}:${mutation}`;
        if (!discovered.includes(mutKey)) discovered.push(mutKey);
      }
    }

    // ── Mark claimed + persist save in parallel ───────────────────────────────
    const [claimResult, updateResult] = await Promise.all([
      supabaseAdmin.from("mailbox").update({ claimed: true }).eq("id", mailId),
      supabaseAdmin.from("game_saves").update({
        coins,
        inventory,
        fertilizers,
        gear_inventory: gearInventory,
        discovered,
        updated_at:     new Date().toISOString(),
      }).eq("user_id", userId),
    ]);

    if (claimResult.error) {
      console.error("claim-mail: mark claimed failed", claimResult.error);
      return new Response(JSON.stringify({ error: "Failed to claim mail" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (updateResult.error) {
      console.error("claim-mail: save update failed", updateResult.error);
      return new Response(JSON.stringify({ error: "Failed to update save" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    void supabaseAdmin.from("action_log").insert({
      user_id: userId, action: "claim_mail",
      payload: { mailId, kind, speciesId, mutation, amount },
    });

    return new Response(
      JSON.stringify({ ok: true, kind, coins, inventory, fertilizers, gearInventory, discovered }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("claim-mail error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
