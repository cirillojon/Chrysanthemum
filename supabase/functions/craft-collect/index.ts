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
        .select("gear_inventory, consumables, infusers, crafting_queue, updated_at")
        .eq("user_id", userId)
        .single(),
    ]);

    if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
      return err("Unauthorized", 401);
    }
    if (saveResult.error || !saveResult.data) return err("Save not found", 404);

    const save           = saveResult.data;
    const priorUpdatedAt = save.updated_at as string;

    // Support both new format (kind + outputId) and legacy format (gearType)
    const craftingQueue = (save.crafting_queue ?? []) as {
      id:         string;
      kind?:      string;
      outputId?:  string;
      gearType?:  string;   // legacy field
      startedAt:  string;
      durationMs: number;
    }[];

    let gearInventory = (save.gear_inventory ?? []) as { gearType: string; quantity: number }[];
    let consumables   = (save.consumables    ?? []) as { id: string; quantity: number }[];
    let infusers      = (save.infusers       ?? []) as { rarity: string; quantity: number }[];

    // ── Find entry ────────────────────────────────────────────────────────────
    const entry = craftingQueue.find((e) => e.id === craftId);
    if (!entry) return err("Craft not found", 404);

    // ── Validate completion ───────────────────────────────────────────────────
    const finishedAt  = new Date(entry.startedAt).getTime() + entry.durationMs;
    if (Date.now() < finishedAt) {
      const remainingMs = finishedAt - Date.now();
      return err(`Craft not finished yet (${Math.ceil(remainingMs / 1000)}s remaining)`);
    }

    // ── Determine kind + outputId (support legacy gear-only entries) ──────────
    const kind     = (entry.kind     ?? "gear") as string;
    const outputId = (entry.outputId ?? entry.gearType ?? "") as string;

    if (!outputId) return err("Malformed queue entry: missing outputId/gearType");

    // ── Remove from queue ─────────────────────────────────────────────────────
    const newQueue = craftingQueue.filter((e) => e.id !== craftId);

    // ── Deliver to the correct inventory ─────────────────────────────────────
    if (kind === "gear") {
      const idx = gearInventory.findIndex((g) => g.gearType === outputId);
      gearInventory = idx >= 0
        ? gearInventory.map((g, i) => i === idx ? { ...g, quantity: g.quantity + 1 } : g)
        : [...gearInventory, { gearType: outputId, quantity: 1 }];

    } else if (kind === "consumable") {
      const idx = consumables.findIndex((c) => c.id === outputId);
      consumables = idx >= 0
        ? consumables.map((c, i) => i === idx ? { ...c, quantity: c.quantity + 1 } : c)
        : [...consumables, { id: outputId, quantity: 1 }];

    } else if (kind === "attunement") {
      // outputId is a rarity string (e.g. "rare", "legendary", …)
      const idx = infusers.findIndex((inf) => inf.rarity === outputId);
      infusers = idx >= 0
        ? infusers.map((inf, i) => i === idx ? { ...inf, quantity: inf.quantity + 1 } : inf)
        : [...infusers, { rarity: outputId, quantity: 1 }];

    } else {
      return err(`Unknown craft kind: ${kind}`);
    }

    // ── CAS write ─────────────────────────────────────────────────────────────
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from("game_saves")
      .update({
        gear_inventory: gearInventory,
        consumables,
        infusers,
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
      payload: { craftId, kind, outputId },
      result:  { kind, outputId },
    });

    return json({
      ok:              true,
      craftingQueue:   newQueue,
      gearInventory,
      consumables,
      infusers,
      serverUpdatedAt: updateData.updated_at,
    });

  } catch (e) {
    console.error("craft-collect error:", e);
    return err("Internal server error", 500);
  }
});
