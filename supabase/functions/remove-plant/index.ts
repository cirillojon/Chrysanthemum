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
  pinned?:      boolean;
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

interface ConsumableItem {
  id:       string;
  quantity: number;
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
    const { row, col } = await req.json() as { row: number; col: number; consumableId?: string };

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
        .select("grid, inventory, consumables")
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

    const grid        = saveResult.data.grid as PlotCell[][];
    const inventory   = (saveResult.data.inventory   ?? []) as InventoryItem[];
    const consumables = (saveResult.data.consumables ?? []) as ConsumableItem[];

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
        JSON.stringify({ ok: true, grid, inventory, consumables }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Guard: bloomed plants must be harvested, not removed
    if (plot.plant.bloomedAt) {
      return new Response(JSON.stringify({ error: "Plant is bloomed — harvest it instead" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Guard: pinned plants are protected — pin must be removed first
    if (plot.plant.pinned) {
      return new Response(JSON.stringify({ error: "Plant is pinned — remove the pin first" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Guard: require a shovel (deduct 1 from consumables)
    const shovelIdx = consumables.findIndex((c) => c.id === "shovel" && c.quantity > 0);
    if (shovelIdx === -1) {
      return new Response(JSON.stringify({ error: "A Shovel is required to dig up a plant" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const newConsumables: ConsumableItem[] = consumables
      .map((c, i) => i === shovelIdx ? { ...c, quantity: c.quantity - 1 } : c)
      .filter((c) => c.quantity > 0);

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
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from("game_saves")
      .update({ grid: newGrid, inventory: newInventory, consumables: newConsumables, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .select("updated_at")
      .single();

    if (updateError || !updateData) {
      return new Response(JSON.stringify({ error: "Failed to save" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clear the authoritative planting time — if a new seed is planted here
    // immediately after, the stale entry would make harvest think it's too early.
    void supabaseAdmin.from("plant_timings").delete()
      .eq("user_id", userId).eq("row", row).eq("col", col);

    void supabaseAdmin.from("action_log").insert({
      user_id: userId, action: "remove_plant",
      payload: { row, col, speciesId },
    });

    return new Response(
      JSON.stringify({ ok: true, grid: newGrid, inventory: newInventory, consumables: newConsumables, serverUpdatedAt: updateData.updated_at }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("remove-plant error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
