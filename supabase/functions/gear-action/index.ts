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

// ── Types (mirror src/data/gear.ts + src/store/gameStore.ts) ─────────────────

type PlacedGear = {
  gearType:           string;
  placedAt:           number;
  direction?:         string;
  storedFertilizers?: string[];
};

type GridCell = {
  id:     string;
  plant:  unknown;
  gear?:  PlacedGear | null;
};

type GearInvItem   = { gearType: string; quantity: number };
type FertItem      = { type: string;     quantity: number };

// Composter gear types (mirrors src/data/gear.ts)
const COMPOSTER_TYPES = new Set(["composter_uncommon", "composter_rare"]);

// ── Response helpers ─────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const err = (msg: string, status = 400) => json({ error: msg }, status);

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return err("Unauthorized", 401);

    const token = authHeader.replace("Bearer ", "");
    let userId: string;
    try {
      const p = JSON.parse(atob(b64url(token.split(".")[1])));
      userId = p.sub;
    } catch {
      return err("Unauthorized", 401);
    }

    const body = await req.json() as {
      action:     "place" | "remove" | "collect" | "set_direction";
      row:        number;
      col:        number;
      gearType?:  string;
      direction?: string;
    };

    const { action, row, col } = body;
    if (!["place", "remove", "collect", "set_direction"].includes(action)) {
      return err("Invalid action — use place | remove | collect | set_direction");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Select only the columns each action needs
    const selectCols =
      action === "collect" ? "grid, fertilizers, updated_at"       :
      action === "remove"  ? "grid, gear_inventory, fertilizers, updated_at" :
                             "grid, gear_inventory, updated_at";

    const [authResult, saveResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin.from("game_saves").select(selectCols).eq("user_id", userId).single(),
    ]);

    if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
      return err("Unauthorized", 401);
    }
    if (saveResult.error || !saveResult.data) {
      return err("Save not found", 404);
    }

    const save = saveResult.data;
    const priorUpdatedAt = save.updated_at as string;
    let grid          = (save.grid          ?? []) as GridCell[][];
    let gearInventory = (save.gear_inventory ?? []) as GearInvItem[];
    let fertilizers   = (save.fertilizers   ?? []) as FertItem[];

    const cell = grid[row]?.[col];
    if (!cell) return err("Invalid cell coordinates");

    // ── place ─────────────────────────────────────────────────────────────────
    if (action === "place") {
      const { gearType, direction } = body;
      if (!gearType)              return err("gearType required");
      if (cell.plant)             return err("Cell has a plant");
      if (cell.gear)              return err("Cell already has gear");

      const invItem = gearInventory.find((g) => g.gearType === gearType);
      if (!invItem || invItem.quantity < 1) return err("Gear not in inventory");

      const placedAt = Date.now();
      const placedGear: PlacedGear = direction
        ? { gearType, placedAt, direction }
        : { gearType, placedAt };
      grid = grid.map((r, ri) =>
        r.map((p, ci) =>
          ri === row && ci === col
            ? { ...p, gear: placedGear }
            : p
        )
      );
      gearInventory = gearInventory
        .map((g) => g.gearType === gearType ? { ...g, quantity: g.quantity - 1 } : g)
        .filter((g) => g.quantity > 0);

      const { data: ud, error: ue } = await supabaseAdmin
        .from("game_saves")
        .update({ grid, gear_inventory: gearInventory, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("updated_at", priorUpdatedAt)
        .select("updated_at")
        .single();

      if (ue || !ud) return err("Save was modified by another action", 409);

      void supabaseAdmin.from("action_log").insert({
        user_id: userId, action: "gear_place",
        payload: { gearType, row, col }, result: { placedAt },
      });

      return json({ ok: true, grid, gearInventory });
    }

    // ── remove ────────────────────────────────────────────────────────────────
    // Removal destroys the gear (no refund) — closes the duration-reset exploit
    // where players could remove near-expiry gear and re-place it fresh.
    // Stored fertilizers from composters are still returned since the player earned them.
    if (action === "remove") {
      if (!cell.gear) return err("No gear at this cell");

      const { gearType } = cell.gear;
      const stored      = cell.gear.storedFertilizers ?? [];

      grid = grid.map((r, ri) =>
        r.map((p, ci) => ri === row && ci === col ? { ...p, gear: null } : p)
      );

      // Return any stored fertilizers (composter)
      for (const fertType of stored) {
        const fert = fertilizers.find((f) => f.type === fertType);
        fertilizers = fert
          ? fertilizers.map((f) => f.type === fertType ? { ...f, quantity: f.quantity + 1 } : f)
          : [...fertilizers, { type: fertType, quantity: 1 }];
      }

      const { data: ud, error: ue } = await supabaseAdmin
        .from("game_saves")
        .update({ grid, fertilizers, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("updated_at", priorUpdatedAt)
        .select("updated_at")
        .single();

      if (ue || !ud) return err("Save was modified by another action", 409);

      void supabaseAdmin.from("action_log").insert({
        user_id: userId, action: "gear_remove",
        payload: { gearType, row, col }, result: { storedReturned: stored.length, gearDestroyed: true },
      });

      return json({ ok: true, grid, gearInventory, fertilizers });
    }

    // ── collect (composter) ───────────────────────────────────────────────────
    if (action === "collect") {
      if (!cell.gear)                                   return err("No gear at this cell");
      if (!COMPOSTER_TYPES.has(cell.gear.gearType))     return err("Not a composter");

      const stored = cell.gear.storedFertilizers ?? [];
      if (stored.length === 0)                          return err("Nothing to collect");

      grid = grid.map((r, ri) =>
        r.map((p, ci) =>
          ri === row && ci === col
            ? { ...p, gear: { ...p.gear!, storedFertilizers: [] } }
            : p
        )
      );

      for (const fertType of stored) {
        const fert = fertilizers.find((f) => f.type === fertType);
        fertilizers = fert
          ? fertilizers.map((f) => f.type === fertType ? { ...f, quantity: f.quantity + 1 } : f)
          : [...fertilizers, { type: fertType, quantity: 1 }];
      }

      const { data: ud, error: ue } = await supabaseAdmin
        .from("game_saves")
        .update({ grid, fertilizers, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("updated_at", priorUpdatedAt)
        .select("updated_at")
        .single();

      if (ue || !ud) return err("Save was modified by another action", 409);

      void supabaseAdmin.from("action_log").insert({
        user_id: userId, action: "gear_collect",
        payload: { row, col }, result: { collected: stored.length },
      });

      return json({ ok: true, grid, fertilizers });
    }

    // ── set_direction (fan) ───────────────────────────────────────────────────
    if (action === "set_direction") {
      const { direction } = body;
      if (!direction) return err("direction required");
      if (!cell.gear)  return err("No gear at this cell");

      grid = grid.map((r, ri) =>
        r.map((p, ci) =>
          ri === row && ci === col
            ? { ...p, gear: { ...p.gear!, direction } }
            : p
        )
      );

      const { data: ud, error: ue } = await supabaseAdmin
        .from("game_saves")
        .update({ grid, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("updated_at", priorUpdatedAt)
        .select("updated_at")
        .single();

      if (ue || !ud) return err("Save was modified by another action", 409);

      return json({ ok: true, grid });
    }

    return err("Unhandled action");

  } catch (e) {
    console.error("gear-action error:", e);
    return err("Internal server error", 500);
  }
});
