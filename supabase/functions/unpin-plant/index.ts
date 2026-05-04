import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { initSentry, Sentry } from "../_shared/sentry.ts";

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
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
const err = (msg: string, status = 400) => json({ error: msg }, status);

interface PlantData { pinned?: boolean; [key: string]: unknown }
interface GridCell  { id: string; plant: PlantData | null; gear?: unknown }

// ── Main handler ──────────────────────────────────────────────────────────────
// Removes the `pinned` flag from a plant. The Garden Pin consumable was already
// deducted at apply time; unpinning is permanent (no refund). After unpinning,
// auto-harvest (Harvest Bell, Auto-Planter) can target the plant again.

Deno.serve(async (req: Request) => {
  initSentry();
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

    const { row, col } = await req.json() as { row?: number; col?: number };
    if (typeof row !== "number" || typeof col !== "number") {
      return err("row and col are required");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [authResult, saveResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin.from("game_saves").select("grid, updated_at").eq("user_id", userId).single(),
    ]);

    if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
      return err("Unauthorized", 401);
    }
    if (saveResult.error || !saveResult.data) return err("Save not found", 404);

    const save           = saveResult.data;
    const priorUpdatedAt = save.updated_at as string;
    const grid           = (save.grid ?? []) as GridCell[][];

    const cell = grid[row]?.[col];
    if (!cell || !cell.plant) return err("No plant at this position");
    if (!cell.plant.pinned)   return err("This plant is not pinned");

    // Strip the pinned flag from the plant — leave all other fields intact.
    const newGrid = grid.map((r, ri) =>
      r.map((c, ci) => {
        if (ri !== row || ci !== col || !c.plant) return c;
        const { pinned: _drop, ...rest } = c.plant;
        return { ...c, plant: rest };
      }),
    );

    const { data: ud, error: ue } = await supabaseAdmin
      .from("game_saves")
      .update({ grid: newGrid, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("updated_at", priorUpdatedAt)
      .select("updated_at")
      .single();

    if (ue || !ud) return err("Save conflict — please retry", 409);

    void supabaseAdmin.from("action_log").insert({
      user_id: userId,
      action:  "unpin_plant",
      payload: { row, col },
    });

    return json({
      ok:              true,
      grid:            newGrid,
      serverUpdatedAt: ud.updated_at,
    });

  } catch (e) {
    console.error("unpin-plant error:", e);
    Sentry.captureException(e);
    await Sentry.flush(2000);
    return err("Internal server error", 500);
  }
});
