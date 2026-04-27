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

    const { receiverId, speciesId, mutation, message } = await req.json() as {
      receiverId: string;
      speciesId:  string;
      mutation?:  string;
      message?:   string;
    };

    if (!receiverId || !speciesId) {
      return new Response(JSON.stringify({ error: "receiverId and speciesId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (receiverId === userId) {
      return new Response(JSON.stringify({ error: "Cannot gift to yourself" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify JWT + load sender's save in parallel ───────────────────────────
    const [authResult, saveResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin
        .from("game_saves")
        .select("inventory")
        .eq("user_id", userId)
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

    let inventory = (saveResult.data.inventory ?? []) as InventoryItem[];

    // ── Validate item in sender's inventory (blooms only, not seeds) ──────────
    // Normalise mutation to null so null and undefined compare equal
    const mutNorm = mutation ?? null;
    const itemIdx = inventory.findIndex(
      (i) => i.speciesId === speciesId &&
             (i.mutation ?? null) === mutNorm &&
             !i.isSeed
    );
    if (itemIdx === -1 || inventory[itemIdx].quantity < 1) {
      return new Response(JSON.stringify({ error: "Item not in inventory" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Deduct from inventory ─────────────────────────────────────────────────
    inventory = inventory
      .map((i, idx) => idx === itemIdx ? { ...i, quantity: i.quantity - 1 } : i)
      .filter((i) => i.quantity > 0);

    // ── Insert gift row + save inventory atomically ───────────────────────────
    const [giftResult, updateResult] = await Promise.all([
      supabaseAdmin.from("gifts").insert({
        sender_id:   userId,
        receiver_id: receiverId,
        species_id:  speciesId,
        mutation:    mutation ?? null,
        message:     message  ?? null,
      }),
      supabaseAdmin
        .from("game_saves")
        .update({ inventory, updated_at: new Date().toISOString() })
        .eq("user_id", userId),
    ]);

    if (giftResult.error) {
      console.error("gift insert failed:", giftResult.error);
      return new Response(JSON.stringify({ error: "Failed to send gift" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (updateResult.error) {
      console.error("inventory update failed:", updateResult.error);
      return new Response(JSON.stringify({ error: "Failed to update inventory" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    void supabaseAdmin.from("action_log").insert({
      user_id: userId, action: "send_gift",
      payload: { receiverId, speciesId, mutation },
    });

    return new Response(
      JSON.stringify({ ok: true, inventory }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("send-gift error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
