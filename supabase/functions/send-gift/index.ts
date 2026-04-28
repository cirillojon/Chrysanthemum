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

    const GIFT_RATE_LIMIT    = 5;
    const GIFT_WINDOW_MS     = 60 * 60 * 1_000; // 1 hour
    const windowStart        = new Date(Date.now() - GIFT_WINDOW_MS).toISOString();

    // ── Verify JWT + load sender's save + username + rate-limit count in parallel
    const [authResult, saveResult, senderProfileResult, rateLimitResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin
        .from("game_saves")
        .select("inventory, updated_at")
        .eq("user_id", userId)
        .single(),
      supabaseAdmin
        .from("users")
        .select("username")
        .eq("id", userId)
        .single(),
      supabaseAdmin
        .from("mailbox")
        .select("id", { count: "exact", head: true })
        .eq("from_user_id", userId)
        .eq("user_id", receiverId)
        .gt("created_at", windowStart),
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

    if ((rateLimitResult.count ?? 0) >= GIFT_RATE_LIMIT) {
      return new Response(JSON.stringify({ error: "Gift limit reached — max 5 gifts per recipient per hour" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const senderUsername = senderProfileResult.data?.username ?? "Someone";
    const priorUpdatedAt = saveResult.data.updated_at as string;
    let inventory = (saveResult.data.inventory ?? []) as InventoryItem[];

    // ── Validate item in sender's inventory (blooms only, not seeds) ──────────
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

    // ── Deduct from sender's inventory ────────────────────────────────────────
    inventory = inventory
      .map((i, idx) => idx === itemIdx ? { ...i, quantity: i.quantity - 1 } : i)
      .filter((i) => i.quantity > 0);

    const now = new Date().toISOString();

    // ── Insert mailbox entry for receiver + update sender's save ─────────────
    const [mailResult, updateResult] = await Promise.all([
      supabaseAdmin.from("mailbox").insert({
        user_id:      receiverId,
        from_user_id: userId,
        subject:      `Gift from ${senderUsername} 🎁`,
        kind:         "flower",
        species_id:   speciesId,
        mutation:     mutation ?? null,
        is_seed:      false,
        message:      message ?? "",
        created_at:   now,
      }),
      supabaseAdmin
        .from("game_saves")
        .update({ inventory, updated_at: now })
        .eq("user_id", userId)
        .eq("updated_at", priorUpdatedAt)
        .select("updated_at")
        .single(),
    ]);

    if (mailResult.error) {
      console.error("send-gift: mailbox insert failed:", mailResult.error);
      return new Response(JSON.stringify({ error: "Failed to send gift" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (updateResult.error || !updateResult.data) {
      console.error("send-gift: inventory update failed:", updateResult.error);
      return new Response(JSON.stringify({ error: "Save was modified by another action" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
