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

interface InventoryItem { speciesId: string; quantity: number; mutation?: string; isSeed?: boolean; }

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

    // ── Verify JWT + load buyer save + load listing in parallel ───────────────
    const [authResult, buyerSaveResult, listingResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin
        .from("game_saves")
        .select("coins, inventory, discovered")
        .eq("user_id", userId)
        .single(),
      supabaseAdmin
        .from("marketplace_listings")
        .select("id, seller_id, species_id, mutation, is_seed, ask_price, status")
        .eq("id", body.listingId)
        .single(),
    ]);

    if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (buyerSaveResult.error || !buyerSaveResult.data) {
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

    if (listing.status !== "active") {
      return new Response(JSON.stringify({ error: "Listing is no longer available" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (listing.seller_id === userId) {
      return new Response(JSON.stringify({ error: "Cannot buy your own listing" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buyerSave = buyerSaveResult.data;
    let buyerCoins       = buyerSave.coins as number;
    let buyerInventory   = [...(buyerSave.inventory ?? []) as InventoryItem[]];
    let buyerDiscovered  = [...(buyerSave.discovered ?? []) as string[]];

    if (buyerCoins < listing.ask_price) {
      return new Response(JSON.stringify({ error: "Not enough coins" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    buyerCoins -= listing.ask_price;

    // Add item to buyer inventory (preserve isSeed flag from listing)
    const mutation = listing.mutation ?? undefined;
    const isSeed   = (listing.is_seed as boolean) ?? false;
    const existing = buyerInventory.find(
      (i) => i.speciesId === listing.species_id &&
             i.mutation === mutation &&
             (i.isSeed ?? false) === isSeed
    );
    buyerInventory = existing
      ? buyerInventory.map((i) =>
          i.speciesId === listing.species_id &&
          i.mutation === mutation &&
          (i.isSeed ?? false) === isSeed
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      : [...buyerInventory, { speciesId: listing.species_id, quantity: 1, mutation, isSeed }];

    // Register in buyer's codex
    const baseKey = listing.species_id;
    if (!buyerDiscovered.includes(baseKey)) buyerDiscovered.push(baseKey);
    if (mutation) {
      const mutKey = `${listing.species_id}:${mutation}`;
      if (!buyerDiscovered.includes(mutKey)) buyerDiscovered.push(mutKey);
    }

    // Mark listing sold
    const { error: listingUpdateError } = await supabaseAdmin
      .from("marketplace_listings")
      .update({ status: "sold", buyer_id: userId, sold_at: new Date().toISOString() })
      .eq("id", listing.id)
      .eq("status", "active"); // optimistic lock — prevents double-buy

    if (listingUpdateError) {
      return new Response(JSON.stringify({ error: "Listing no longer available" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Credit seller, update buyer save, record sale history — all in parallel
    const sellerCredit = supabaseAdmin.rpc("add_coins_to_user", {
      target_user_id: listing.seller_id,
      amount:         listing.ask_price,
    });

    const buyerUpdate = supabaseAdmin
      .from("game_saves")
      .update({ coins: buyerCoins, inventory: buyerInventory, discovered: buyerDiscovered, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    const saleRecord = supabaseAdmin.from("marketplace_sales").insert({
      species_id: listing.species_id,
      mutation:   listing.mutation ?? null,
      item_type:  isSeed ? "seed" : "flower",
      price:      listing.ask_price,
      sold_at:    new Date().toISOString(),
    });

    const [sellerResult, buyerResult, saleResult] = await Promise.all([sellerCredit, buyerUpdate, saleRecord]);

    if (saleResult.error) {
      console.error("marketplace-buy: sale record failed", saleResult.error);
    }

    if (buyerResult.error) {
      // This is bad — listing is sold but buyer save failed. Log it.
      console.error("marketplace-buy: buyer save failed after listing sold", buyerResult.error);
      return new Response(JSON.stringify({ error: "Failed to update save" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (sellerResult.error) {
      // Non-fatal: seller credit failed, but buyer got the item. Log for manual review.
      console.error("marketplace-buy: seller credit failed", sellerResult.error, "listing:", listing.id);
    }

    return new Response(
      JSON.stringify({ ok: true, coins: buyerCoins, inventory: buyerInventory, discovered: buyerDiscovered }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("marketplace-buy error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
