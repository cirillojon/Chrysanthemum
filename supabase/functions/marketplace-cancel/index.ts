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
interface ConsumableItem { id: string; quantity: number; }

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

    const body = await req.json() as { listingId: string };
    if (!body.listingId) {
      return new Response(JSON.stringify({ error: "listingId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Verify JWT + load save + load listing in parallel ─────────────────────
    const [authResult, saveResult, listingResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin
        .from("game_saves")
        .select("inventory, fertilizers, gear_inventory, consumables")
        .eq("user_id", userId)
        .single(),
      supabaseAdmin
        .from("marketplace_listings")
        .select("id, seller_id, species_id, mutation, is_seed, status")
        .eq("id", body.listingId)
        .single(),
    ]);

    if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (saveResult.error || !saveResult.data) {
      return new Response(JSON.stringify({ error: "Save not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (listingResult.error || !listingResult.data) {
      return new Response(JSON.stringify({ error: "Listing not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const listing = listingResult.data;

    if (listing.seller_id !== userId) {
      return new Response(JSON.stringify({ error: "Not your listing" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (listing.status !== "active") {
      return new Response(JSON.stringify({ error: "Listing is not active" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let inventory     = [...(saveResult.data.inventory ?? []) as InventoryItem[]];
    let fertilizers   = [...(saveResult.data.fertilizers ?? []) as FertilizerItem[]];
    let gearInventory = [...(saveResult.data.gear_inventory ?? []) as GearItem[]];
    let consumables   = [...(saveResult.data.consumables ?? []) as ConsumableItem[]];

    const speciesId    = listing.species_id as string;
    const isFertilizer = speciesId.startsWith("fert:");
    const isGear       = speciesId.startsWith("gear:");
    const isConsumable = speciesId.startsWith("consumable:");

    if (isFertilizer) {
      // Return fertilizer to fertilizers array
      const fertType = speciesId.replace("fert:", "");
      const existing = fertilizers.find((f) => f.type === fertType);
      fertilizers = existing
        ? fertilizers.map((f) =>
            f.type === fertType ? { ...f, quantity: f.quantity + 1 } : f
          )
        : [...fertilizers, { type: fertType, quantity: 1 }];
    } else if (isGear) {
      // Return gear to gear inventory
      const gearType = speciesId.replace("gear:", "");
      const existing = gearInventory.find((g) => g.gearType === gearType);
      gearInventory = existing
        ? gearInventory.map((g) =>
            g.gearType === gearType ? { ...g, quantity: g.quantity + 1 } : g
          )
        : [...gearInventory, { gearType, quantity: 1 }];
    } else if (isConsumable) {
      // Return consumable to consumables array
      const consumableId = speciesId.replace("consumable:", "");
      const existing = consumables.find((c) => c.id === consumableId);
      consumables = existing
        ? consumables.map((c) =>
            c.id === consumableId ? { ...c, quantity: c.quantity + 1 } : c
          )
        : [...consumables, { id: consumableId, quantity: 1 }];
    } else {
      // Return flower/seed to inventory
      const mutation = listing.mutation ?? undefined;
      const isSeed   = (listing.is_seed as boolean) ?? false;
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

    // Mark listing cancelled (optimistic lock)
    const { error: cancelError } = await supabaseAdmin
      .from("marketplace_listings")
      .update({ status: "cancelled" })
      .eq("id", listing.id)
      .eq("status", "active");

    if (cancelError) {
      return new Response(JSON.stringify({ error: "Failed to cancel listing" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return item to save
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from("game_saves")
      .update({ inventory, fertilizers, gear_inventory: gearInventory, consumables, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .select("updated_at")
      .single();

    if (updateError || !updateData) {
      console.error("marketplace-cancel: save update failed after cancel", updateError);
      return new Response(JSON.stringify({ error: "Failed to update save" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, inventory, fertilizers, gearInventory, consumables, serverUpdatedAt: updateData.updated_at }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("marketplace-cancel error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
