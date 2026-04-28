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

interface PlantedFlower {
  speciesId:    string;
  timePlanted:  number;
  fertilizer:   string | null;
  bloomedAt?:   number;
  masteredBonus?: number;
}

interface PlotCell {
  id:    string;
  plant: PlantedFlower | null;
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

    // ── Parse input ───────────────────────────────────────────────────────────
    const { row, col } = await req.json() as { row: number; col: number };

    if (typeof row !== "number" || typeof col !== "number") {
      return new Response(JSON.stringify({ error: "row and col required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify JWT + load save in parallel ────────────────────────────────────
    const [authResult, saveResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin
        .from("game_saves")
        .select("grid, inventory")
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

    const grid      = saveResult.data.grid as PlotCell[][];
    const inventory = (saveResult.data.inventory ?? []) as InventoryItem[];

    // ── Validate plot ─────────────────────────────────────────────────────────
    const plot = grid[row]?.[col];
    if (!plot) {
      return new Response(JSON.stringify({ error: "Plot does not exist" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!plot.plant) {
      // Idempotent — plot already empty, nothing to do
      return new Response(
        JSON.stringify({ ok: true, grid, inventory }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Guard: bloomed plants must be harvested, not removed
    if (plot.plant.bloomedAt) {
      return new Response(JSON.stringify({ error: "Plant is bloomed — harvest it instead" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { speciesId } = plot.plant;

    // ── Clear plot ────────────────────────────────────────────────────────────
    const newGrid = grid.map((r, ri) =>
      r.map((p, ci) =>
        ri === row && ci === col ? { ...p, plant: null } : p
      )
    );

    // ── Return seed to inventory ──────────────────────────────────────────────
    const existingSeed = inventory.find((i) => i.speciesId === speciesId && i.isSeed);
    const newInventory: InventoryItem[] = existingSeed
      ? inventory.map((i) =>
          i.speciesId === speciesId && i.isSeed
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      : [...inventory, { speciesId, quantity: 1, isSeed: true }];

    // ── Write to DB ───────────────────────────────────────────────────────────
    const { error: updateError } = await supabaseAdmin
      .from("game_saves")
      .update({ grid: newGrid, inventory: newInventory, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (updateError) {
      return new Response(JSON.stringify({ error: "Failed to save" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Drop the server-authoritative timing for this plot. If we leave the row
    // in place, a future plant-seed at the same (row,col) is protected by the
    // upsert + species_id check, but cleaning up keeps the table tight.
    void supabaseAdmin.from("plant_timings")
      .delete()
      .eq("user_id", userId).eq("row", row).eq("col", col);

    void supabaseAdmin.from("action_log").insert({
      user_id: userId, action: "remove_plant",
      payload: { row, col, speciesId },
    });

    return new Response(
      JSON.stringify({ ok: true, grid: newGrid, inventory: newInventory }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("remove-plant error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
