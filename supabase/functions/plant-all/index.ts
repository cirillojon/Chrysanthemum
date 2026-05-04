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

const ALL_MUTATIONS = [
  "golden", "rainbow", "giant", "moonlit", "frozen",
  "scorched", "wet", "windstruck", "shocked",
];

function isSpeciesMastered(discovered: string[], speciesId: string): boolean {
  const total = 1 + ALL_MUTATIONS.length;
  let found = 0;
  if (discovered.includes(speciesId)) found++;
  for (const mut of ALL_MUTATIONS) {
    if (discovered.includes(`${speciesId}:${mut}`)) found++;
  }
  return found === total;
}

Deno.serve(async (req: Request) => {
  initSentry();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    const { plots } = await req.json() as { plots: { row: number; col: number; speciesId: string }[] };
    if (!Array.isArray(plots) || plots.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid input: plots array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Verify JWT once, then retry read→process→write on 409 conflict ──────────
    const authResult = await supabaseAdmin.auth.getUser(token);
    if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const MAX_ATTEMPTS = 3;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const saveResult = await supabaseAdmin
        .from("game_saves").select("grid, inventory, discovered, updated_at").eq("user_id", userId).single();

      if (saveResult.error || !saveResult.data) {
        return new Response(JSON.stringify({ error: "Save not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const save = saveResult.data;
      const priorUpdatedAt = save.updated_at as string;
      const discovered = (save.discovered ?? []) as string[];

      const grid = save.grid as { id: string; plant: unknown }[][];
      let inventory = (save.inventory ?? []) as { speciesId: string; quantity: number; mutation?: string; isSeed?: boolean }[];

      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const plantedTimings: { user_id: string; row: number; col: number; planted_at: string; timePlanted: number }[] = [];

      // ── Process each plot in order ──────────────────────────────────────────
      // Running inventory is updated as each seed is consumed so subsequent plots
      // see the correct remaining count.
      for (const { row, col, speciesId } of plots) {
        const plot = grid[row]?.[col];
        if (!plot) continue;

        if (plot.plant) continue;

        const seedItem = inventory.find((i) => i.speciesId === speciesId && i.isSeed);
        if (!seedItem || seedItem.quantity < 1) continue;

        const mastered = isSpeciesMastered(discovered, speciesId);
        const timePlanted = now;

        const newPlant = {
          speciesId,
          timePlanted,
          fertilizer: null,
          ...(mastered ? { masteredBonus: 1.25 } : {}),
        };

        grid[row][col] = { ...plot, plant: newPlant };
        inventory = inventory
          .map((i) => i.speciesId === speciesId && i.isSeed ? { ...i, quantity: i.quantity - 1 } : i)
          .filter((i) => i.quantity > 0);

        plantedTimings.push({ user_id: userId, row, col, planted_at: nowIso, timePlanted });
      }

      if (plantedTimings.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, inventory, serverUpdatedAt: priorUpdatedAt }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ── DB write ────────────────────────────────────────────────────────────
      const { data: updateData, error: updateError } = await supabaseAdmin
        .from("game_saves")
        .update({ grid, inventory, updated_at: nowIso })
        .eq("user_id", userId)
        .eq("updated_at", priorUpdatedAt)
        .select("updated_at")
        .single();

      if (updateError || !updateData) {
        if (attempt < MAX_ATTEMPTS - 1) continue;
        return new Response(JSON.stringify({ error: "Save was modified by another action" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Batch upsert plant_timings ──────────────────────────────────────────
      void supabaseAdmin.from("plant_timings").upsert(
        plantedTimings.map(({ user_id, row, col, planted_at }) => ({ user_id, row, col, planted_at })),
        { onConflict: "user_id,row,col" }
      );

      void supabaseAdmin.from("action_log").insert({
        user_id: userId, action: "plant_all",
        payload: { plots: plantedTimings.map(({ row, col, timePlanted }) => ({ row, col, timePlanted })) },
        result:  { count: plantedTimings.length },
      });

      return new Response(
        JSON.stringify({ ok: true, inventory, serverUpdatedAt: updateData.updated_at }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Save was modified by another action" }), {
      status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("plant-all error:", err);
    Sentry.captureException(err);
    await Sentry.flush(2000);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
