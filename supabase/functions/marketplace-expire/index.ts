import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// This function is called by GitHub Actions cron (not by the client).
// It expects a secret Bearer token in the Authorization header matching
// CRON_SECRET env var to prevent unauthorized invocations.

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InventoryItem { speciesId: string; quantity: number; mutation?: string; isSeed?: boolean; }

interface ExpiredListing {
  id: string;
  seller_id: string;
  species_id: string;
  mutation: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Verify cron secret ────────────────────────────────────────────────────
    const cronSecret = Deno.env.get("CRON_SECRET");
    const cronHeader = req.headers.get("x-cron-secret");
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
      .select("id, seller_id, species_id, mutation")
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
        .select("inventory")
        .eq("user_id", sellerId)
        .single();

      if (!saveData) return;

      let inventory = [...(saveData.inventory ?? []) as InventoryItem[]];

      for (const listing of listings) {
        const mutation = listing.mutation ?? undefined;
        const existing = inventory.find(
          (i) => i.speciesId === listing.species_id && i.mutation === mutation && !i.isSeed
        );
        inventory = existing
          ? inventory.map((i) =>
              i.speciesId === listing.species_id && i.mutation === mutation && !i.isSeed
                ? { ...i, quantity: i.quantity + 1 }
                : i
            )
          : [...inventory, { speciesId: listing.species_id, quantity: 1, mutation, isSeed: false }];
      }

      await supabaseAdmin
        .from("game_saves")
        .update({ inventory, updated_at: new Date().toISOString() })
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
