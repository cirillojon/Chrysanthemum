import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// This function is called by GitHub Actions cron (not by the client).
// It expects the CRON_SECRET env var in the x-cron-secret header.
// The Authorization header must carry the Supabase service role key (required by the gateway).

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InventoryItem  { speciesId: string; quantity: number; mutation?: string; isSeed?: boolean; }
interface FertilizerItem { type: string; quantity: number; }
interface GearItem       { gearType: string; quantity: number; }
interface ConsumableItem { id: string; quantity: number; }

interface ExpiredListing {
  id:         string;
  seller_id:  string;
  species_id: string;
  mutation:   string | null;
  is_seed:    boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Verify cron secret ────────────────────────────────────────────────────
    const cronSecret   = Deno.env.get("CRON_SECRET");
    const cronHeader   = req.headers.get("x-cron-secret");
    if (!cronSecret || cronHeader !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Fetch all expired active listings ─────────────────────────────────────
    const { data: expired, error: fetchError } = await supabaseAdmin
      .from("marketplace_listings")
      .select("id, seller_id, species_id, mutation, is_seed")
      .eq("status", "active")
      .lt("expires_at", new Date().toISOString());

    if (fetchError) {
      return new Response(JSON.stringify({ error: "Failed to fetch expired listings" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!expired || expired.length === 0) {
      return new Response(JSON.stringify({ ok: true, expired: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Mark all as expired ───────────────────────────────────────────────────
    const expiredIds = expired.map((l: ExpiredListing) => l.id);
    await supabaseAdmin
      .from("marketplace_listings")
      .update({ status: "expired" })
      .in("id", expiredIds);

    // ── Group items by seller and return to inventories ───────────────────────
    const byseller: Record<string, ExpiredListing[]> = {};
    for (const listing of expired as ExpiredListing[]) {
      if (!byseller[listing.seller_id]) byseller[listing.seller_id] = [];
      byseller[listing.seller_id].push(listing);
    }

    // Process each seller's returns
    const returns = Object.entries(byseller).map(async ([sellerId, listings]) => {
      const { data: saveData } = await supabaseAdmin
        .from("game_saves")
        .select("inventory, fertilizers, gear_inventory, consumables")
        .eq("user_id", sellerId)
        .single();

      if (!saveData) return;

      let inventory     = [...(saveData.inventory     ?? []) as InventoryItem[]];
      let fertilizers   = [...(saveData.fertilizers   ?? []) as FertilizerItem[]];
      let gearInventory = [...(saveData.gear_inventory ?? []) as GearItem[]];
      let consumables   = [...(saveData.consumables   ?? []) as ConsumableItem[]];

      for (const listing of listings) {
        const speciesId    = listing.species_id;
        const isFertilizer = speciesId.startsWith("fert:");
        const isGear       = speciesId.startsWith("gear:");
        const isConsumable = speciesId.startsWith("consumable:");

        if (isFertilizer) {
          const fertType = speciesId.replace("fert:", "");
          const existing = fertilizers.find((f) => f.type === fertType);
          fertilizers = existing
            ? fertilizers.map((f) => f.type === fertType ? { ...f, quantity: f.quantity + 1 } : f)
            : [...fertilizers, { type: fertType, quantity: 1 }];
        } else if (isGear) {
          const gearType = speciesId.replace("gear:", "");
          const existing = gearInventory.find((g) => g.gearType === gearType);
          gearInventory = existing
            ? gearInventory.map((g) => g.gearType === gearType ? { ...g, quantity: g.quantity + 1 } : g)
            : [...gearInventory, { gearType, quantity: 1 }];
        } else if (isConsumable) {
          const consumableId = speciesId.replace("consumable:", "");
          const existing = consumables.find((c) => c.id === consumableId);
          consumables = existing
            ? consumables.map((c) => c.id === consumableId ? { ...c, quantity: c.quantity + 1 } : c)
            : [...consumables, { id: consumableId, quantity: 1 }];
        } else {
          const mutation = listing.mutation ?? undefined;
          const isSeed   = listing.is_seed ?? false;
          const existing = inventory.find(
            (i) => i.speciesId === speciesId && i.mutation === mutation && (i.isSeed ?? false) === isSeed
          );
          inventory = existing
            ? inventory.map((i) =>
                i.speciesId === speciesId && i.mutation === mutation && (i.isSeed ?? false) === isSeed
                  ? { ...i, quantity: i.quantity + 1 }
                  : i
              )
            : [...inventory, { speciesId, quantity: 1, mutation, isSeed }];
        }
      }

      await supabaseAdmin
        .from("game_saves")
        .update({ inventory, fertilizers, gear_inventory: gearInventory, consumables, updated_at: new Date().toISOString() })
        .eq("user_id", sellerId);
    });

    await Promise.allSettled(returns);

    return new Response(
      JSON.stringify({ ok: true, expired: expired.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("marketplace-expire error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
