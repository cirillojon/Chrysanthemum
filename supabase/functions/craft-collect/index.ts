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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const err = (msg: string, status = 400) => json({ error: msg }, status);

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return err("Unauthorized", 401);

    const token = authHeader.replace("Bearer ", "");
    let userId: string;
    try {
      userId = JSON.parse(atob(b64url(token.split(".")[1]))).sub;
    } catch {
      return err("Unauthorized", 401);
    }

    const { craftId } = await req.json() as { craftId?: string };
    if (!craftId) return err("craftId is required");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [authResult, saveResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin
        .from("game_saves")
        .select("gear_inventory, crafting_queue, updated_at")
        .eq("user_id", userId)
        .single(),
    ]);

    if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
      return err("Unauthorized", 401);
    }
    if (saveResult.error || !saveResult.data) return err("Save not found", 404);

    const save           = saveResult.data;
    const priorUpdatedAt = save.updated_at as string;

    const craftingQueue = (save.crafting_queue ?? []) as {
      id: string; gearType: string; startedAt: string; durationMs: number; coinCost: number;
    }[];
    let gearInventory = (save.gear_inventory ?? []) as { gearType: string; quantity: number }[];

    // ── Find entry ────────────────────────────────────────────────────────────
    const entry = craftingQueue.find((e) => e.id === craftId);
    if (!entry) return err("Craft not found", 404);

    // ── Validate completion ───────────────────────────────────────────────────
    const finishedAt = new Date(entry.startedAt).getTime() + entry.durationMs;
    if (Date.now() < finishedAt) {
      const remainingMs = finishedAt - Date.now();
      return err(`Craft not finished yet (${Math.ceil(remainingMs / 1000)}s remaining)`);
    }

    // ── Remove from queue + add gear to inventory ─────────────────────────────
    const newQueue = craftingQueue.filter((e) => e.id !== craftId);

    const idx = gearInventory.findIndex((g) => g.gearType === entry.gearType);
    gearInventory = idx >= 0
      ? gearInventory.map((g, i) => i === idx ? { ...g, quantity: g.quantity + 1 } : g)
      : [...gearInventory, { gearType: entry.gearType, quantity: 1 }];

    // ── CAS write ─────────────────────────────────────────────────────────────
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from("game_saves")
      .update({
        gear_inventory: gearInventory,
        crafting_queue: newQueue,
        updated_at:     new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("updated_at", priorUpdatedAt)
      .select("updated_at")
      .single();

    if (updateError || !updateData) {
      return err("Save was modified by another action — please retry", 409);
    }

    void supabaseAdmin.from("action_log").insert({
      user_id: userId,
      action:  "craft_collect",
      payload: { craftId, gearType: entry.gearType },
      result:  { gearType: entry.gearType },
    });

    return json({
      ok:              true,
      craftingQueue:   newQueue,
      gearInventory,
      serverUpdatedAt: updateData.updated_at,
    });

  } catch (e) {
    console.error("craft-collect error:", e);
    return err("Internal server error", 500);
  }
});
