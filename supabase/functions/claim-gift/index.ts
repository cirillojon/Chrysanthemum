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

interface InventoryItem {
  speciesId: string;
  quantity:  number;
  mutation?: string;
  isSeed?:   boolean;
}

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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { giftId } = await req.json() as { giftId: string };

    if (!giftId) {
      return new Response(JSON.stringify({ error: "giftId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify JWT + load receiver's save + load gift in parallel ─────────────
    const [authResult, saveResult, giftResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin
        .from("game_saves")
        .select("inventory, discovered, updated_at")
        .eq("user_id", userId)
        .single(),
      supabaseAdmin
        .from("gifts")
        .select("*")
        .eq("id", giftId)
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
    if (giftResult.error || !giftResult.data) {
      return new Response(JSON.stringify({ error: "Gift not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gift = giftResult.data;
    const priorUpdatedAt = saveResult.data.updated_at as string;

    // ── Validate ownership ────────────────────────────────────────────────────
    if (gift.receiver_id !== userId) {
      return new Response(JSON.stringify({ error: "Not your gift" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Idempotent: already claimed ───────────────────────────────────────────
    if (gift.claimed) {
      const inventory  = (saveResult.data.inventory  ?? []) as InventoryItem[];
      const discovered = (saveResult.data.discovered ?? []) as string[];
      return new Response(
        JSON.stringify({ ok: true, inventory, discovered }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const speciesId = gift.species_id as string;
    const mutation  = (gift.mutation ?? undefined) as string | undefined;

    // ── Add item to receiver's inventory ─────────────────────────────────────
    // Normalise mutation to null so null and undefined compare equal
    const mutNorm = mutation ?? null;
    let inventory = (saveResult.data.inventory ?? []) as InventoryItem[];
    const existing = inventory.find(
      (i) => i.speciesId === speciesId && (i.mutation ?? null) === mutNorm && !i.isSeed
    );
    inventory = existing
      ? inventory.map((i) =>
          i.speciesId === speciesId && (i.mutation ?? null) === mutNorm && !i.isSeed
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      : [...inventory, { speciesId, quantity: 1, mutation, isSeed: false }];

    // ── Update discovered (codex) ─────────────────────────────────────────────
    const discovered = [...((saveResult.data.discovered ?? []) as string[])];
    if (!discovered.includes(speciesId)) discovered.push(speciesId);
    if (mutation) {
      const mutKey = `${speciesId}:${mutation}`;
      if (!discovered.includes(mutKey)) discovered.push(mutKey);
    }

    // ── Mark claimed + save inventory in parallel ─────────────────────────────
    const [claimResult, updateResult] = await Promise.all([
      supabaseAdmin.from("gifts").update({ claimed: true }).eq("id", giftId),
      supabaseAdmin
        .from("game_saves")
        .update({ inventory, discovered, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("updated_at", priorUpdatedAt)
        .select("updated_at")
        .single(),
    ]);

    if (claimResult.error) {
      console.error("claim failed:", claimResult.error);
      return new Response(JSON.stringify({ error: "Failed to claim gift" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (updateResult.error || !updateResult.data) {
      console.error("inventory update failed:", updateResult.error);
      return new Response(JSON.stringify({ error: "Save was modified by another action" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    void supabaseAdmin.from("action_log").insert({
      user_id: userId, action: "claim_gift",
      payload: { giftId, speciesId, mutation },
    });

    return new Response(
      JSON.stringify({ ok: true, inventory, discovered, serverUpdatedAt: updateResult.data.updated_at }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("claim-gift error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
