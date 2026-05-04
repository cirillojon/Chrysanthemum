import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { initSentry, Sentry } from "../_shared/sentry.ts";

// This function is called by GitHub Actions cron (not by the client).
// It expects the CRON_SECRET env var in the x-cron-secret header.
// The Authorization header must carry the Supabase service role key (required by the gateway).

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ExpiredListing {
  id:         string;
  seller_id:  string;
  species_id: string;
  mutation:   string | null;
  is_seed:    boolean;
}

function itemKindFor(speciesId: string, isSeed: boolean): string {
  if (speciesId.startsWith("fert:"))        return "fertilizer";
  if (speciesId.startsWith("gear:"))        return "gear";
  if (speciesId.startsWith("consumable:")) return "consumable";
  if (isSeed)                               return "seed";
  return "flower";
}

function itemLabelFor(speciesId: string, mutation: string | null, isSeed: boolean): string {
  if (speciesId.startsWith("fert:"))        return speciesId.replace("fert:", "") + " fertilizer";
  if (speciesId.startsWith("gear:"))        return speciesId.replace("gear:", "");
  if (speciesId.startsWith("consumable:")) return speciesId.replace("consumable:", "");
  const base = isSeed ? `${speciesId} seed` : speciesId;
  return mutation ? `${mutation} ${base}` : base;
}

Deno.serve(async (req: Request) => {
  initSentry();
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
    const expiredIds = (expired as ExpiredListing[]).map((l) => l.id);
    await supabaseAdmin
      .from("marketplace_listings")
      .update({ status: "expired" })
      .in("id", expiredIds);

    // ── Mail each item back to its seller ─────────────────────────────────────
    const now = new Date().toISOString();

    const mailInserts = (expired as ExpiredListing[]).map((listing) => {
      const isSeed = listing.is_seed ?? false;
      const kind   = itemKindFor(listing.species_id, isSeed);
      const label  = itemLabelFor(listing.species_id, listing.mutation, isSeed);

      return supabaseAdmin.from("mailbox").insert({
        user_id:    listing.seller_id,
        subject:    "Listing Expired",
        kind,
        species_id: listing.species_id,
        mutation:   listing.mutation ?? null,
        is_seed:    isSeed,
        message:    `Your ${label} listing has expired and been returned to you.`,
        created_at: now,
      });
    });

    await Promise.allSettled(mailInserts);

    return new Response(
      JSON.stringify({ ok: true, expired: expired.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("marketplace-expire error:", err);
    Sentry.captureException(err);
    await Sentry.flush(2000);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
