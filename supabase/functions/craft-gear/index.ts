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

// ── Mirrored recipe data (mirrors src/data/gear-recipes.ts) ──────────────────
// Edge functions cannot import from src/ — ingredient lists are hardcoded here.

type GearIngredient =
  | { kind: "essence";    essenceType: string; amount: number }
  | { kind: "gear";       gearType:    string; quantity: number }
  | { kind: "consumable"; consumableId: string; quantity: number };

interface GearRecipe {
  outputGearType: string;
  ingredients:    GearIngredient[];
}

const E = (essenceType: string, amount: number): GearIngredient =>
  ({ kind: "essence", essenceType, amount });
const G = (gearType: string, quantity = 2): GearIngredient =>
  ({ kind: "gear", gearType, quantity });
const C = (consumableId: string, quantity: number): GearIngredient =>
  ({ kind: "consumable", consumableId, quantity });

const GEAR_RECIPES: GearRecipe[] = [

  // ── Regular Sprinklers (I–V) ──────────────────────────────────────────────
  { outputGearType: "sprinkler_rare",      ingredients: [E("grove", 5), E("zephyr", 5)] },
  { outputGearType: "sprinkler_legendary", ingredients: [G("sprinkler_rare")] },
  { outputGearType: "sprinkler_mythic",    ingredients: [G("sprinkler_legendary")] },
  { outputGearType: "sprinkler_exalted",   ingredients: [G("sprinkler_mythic")] },
  { outputGearType: "sprinkler_prismatic", ingredients: [G("sprinkler_exalted")] },

  // ── Mutation Sprinklers ───────────────────────────────────────────────────
  { outputGearType: "sprinkler_flame",     ingredients: [G("sprinkler_legendary", 1), C("ember_vial_2", 2)] },
  { outputGearType: "sprinkler_frost",     ingredients: [G("sprinkler_legendary", 1), C("frost_vial_2", 2)] },
  { outputGearType: "sprinkler_lightning", ingredients: [G("sprinkler_mythic", 1), C("storm_vial_3", 2)] },
  { outputGearType: "sprinkler_lunar",     ingredients: [G("sprinkler_mythic", 1), C("moon_vial_3", 2)] },
  { outputGearType: "sprinkler_midas",     ingredients: [G("sprinkler_exalted", 1), C("golden_vial_4", 2)] },
  { outputGearType: "sprinkler_prism",     ingredients: [G("sprinkler_prismatic", 1), C("rainbow_vial_5", 2)] },

  // ── Grow Lamp (I–II) ──────────────────────────────────────────────────────
  { outputGearType: "grow_lamp_uncommon",  ingredients: [E("solar", 4), E("grove", 4)] },
  { outputGearType: "grow_lamp_rare",      ingredients: [G("grow_lamp_uncommon")] },

  // ── Scarecrow (I–III) ─────────────────────────────────────────────────────
  { outputGearType: "scarecrow_rare",      ingredients: [E("arcane", 5), E("storm", 5)] },
  { outputGearType: "scarecrow_legendary", ingredients: [G("scarecrow_rare")] },
  { outputGearType: "scarecrow_mythic",    ingredients: [G("scarecrow_legendary")] },

  // ── Composter (I–III) ─────────────────────────────────────────────────────
  { outputGearType: "composter_uncommon",  ingredients: [E("grove", 4), E("solar", 4)] },
  { outputGearType: "composter_rare",      ingredients: [G("composter_uncommon")] },
  { outputGearType: "composter_legendary", ingredients: [G("composter_rare")] },

  // ── Fan (I–III) ───────────────────────────────────────────────────────────
  { outputGearType: "fan_uncommon",        ingredients: [E("zephyr", 4), E("storm", 4)] },
  { outputGearType: "fan_rare",            ingredients: [G("fan_uncommon")] },
  { outputGearType: "fan_legendary",       ingredients: [G("fan_rare")] },

  // ── Harvest Bell (I–III) ──────────────────────────────────────────────────
  { outputGearType: "harvest_bell_uncommon",  ingredients: [E("stellar", 4), E("fairy", 4)] },
  { outputGearType: "harvest_bell_rare",      ingredients: [G("harvest_bell_uncommon")] },
  { outputGearType: "harvest_bell_legendary", ingredients: [G("harvest_bell_rare")] },

  // ── Aegis (I–III) ────────────────────────────────────────────────────────
  { outputGearType: "aegis_uncommon",      ingredients: [E("frost", 5), E("shadow", 5)] },
  { outputGearType: "aegis_rare",          ingredients: [G("aegis_uncommon")] },
  { outputGearType: "aegis_legendary",     ingredients: [G("aegis_rare")] },

  // ── Garden Pin ────────────────────────────────────────────────────────────
  { outputGearType: "garden_pin",          ingredients: [E("arcane", 3), E("fairy", 3)] },

  // ── Cropsticks (legendary) ────────────────────────────────────────────────
  { outputGearType: "cropsticks",          ingredients: [E("arcane", 4), E("stellar", 4), E("grove", 4)] },

  // ── Auto-Planter (prismatic) ──────────────────────────────────────────────
  {
    outputGearType: "auto_planter_prismatic",
    ingredients: [
      G("sprinkler_prismatic", 1),
      G("harvest_bell_legendary", 1),
      E("universal", 10),
    ],
  },
];

const GEAR_RECIPE_MAP = Object.fromEntries(GEAR_RECIPES.map((r) => [r.outputGearType, r]));

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

    const body = await req.json() as { outputGearType?: string };
    const { outputGearType } = body;

    if (!outputGearType) return err("outputGearType is required");

    const recipe = GEAR_RECIPE_MAP[outputGearType];
    if (!recipe) return err(`Unknown gear type: ${outputGearType}`);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [authResult, saveResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin
        .from("game_saves")
        .select("essences, gear_inventory, consumables, updated_at")
        .eq("user_id", userId)
        .single(),
    ]);

    if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
      return err("Unauthorized", 401);
    }
    if (saveResult.error || !saveResult.data) {
      return err("Save not found", 404);
    }

    const save           = saveResult.data;
    const priorUpdatedAt = save.updated_at as string;

    let essences:      { type: string; amount: number }[]     = (save.essences      ?? []) as { type: string; amount: number }[];
    let gearInventory: { gearType: string; quantity: number }[]= (save.gear_inventory ?? []) as { gearType: string; quantity: number }[];
    let consumables:   { id: string; quantity: number }[]      = (save.consumables   ?? []) as { id: string; quantity: number }[];

    // ── Validate all ingredients ─────────────────────────────────────────────
    for (const ing of recipe.ingredients) {
      if (ing.kind === "essence") {
        const have = essences.find((e) => e.type === ing.essenceType)?.amount ?? 0;
        if (have < ing.amount) {
          return err(`Not enough ${ing.essenceType} essence (need ${ing.amount}, have ${have})`);
        }
      } else if (ing.kind === "gear") {
        const have = gearInventory.find((g) => g.gearType === ing.gearType)?.quantity ?? 0;
        if (have < ing.quantity) {
          return err(`Not enough ${ing.gearType} (need ${ing.quantity}, have ${have})`);
        }
      } else {
        const have = consumables.find((c) => c.id === ing.consumableId)?.quantity ?? 0;
        if (have < ing.quantity) {
          return err(`Not enough ${ing.consumableId} (need ${ing.quantity}, have ${have})`);
        }
      }
    }

    // ── Deduct ingredients ───────────────────────────────────────────────────
    for (const ing of recipe.ingredients) {
      if (ing.kind === "essence") {
        essences = essences
          .map((e) => e.type === ing.essenceType ? { ...e, amount: e.amount - ing.amount } : e)
          .filter((e) => e.amount > 0);
      } else if (ing.kind === "gear") {
        gearInventory = gearInventory
          .map((g) => g.gearType === ing.gearType ? { ...g, quantity: g.quantity - ing.quantity } : g)
          .filter((g) => g.quantity > 0);
      } else {
        consumables = consumables
          .map((c) => c.id === ing.consumableId ? { ...c, quantity: c.quantity - ing.quantity } : c)
          .filter((c) => c.quantity > 0);
      }
    }

    // ── Add crafted gear ─────────────────────────────────────────────────────
    const existingIdx = gearInventory.findIndex((g) => g.gearType === outputGearType);
    gearInventory = existingIdx >= 0
      ? gearInventory.map((g, i) => i === existingIdx ? { ...g, quantity: g.quantity + 1 } : g)
      : [...gearInventory, { gearType: outputGearType, quantity: 1 }];

    // ── CAS write ────────────────────────────────────────────────────────────
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from("game_saves")
      .update({
        essences,
        gear_inventory: gearInventory,
        consumables,
        updated_at: new Date().toISOString(),
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
      action:  "craft_gear",
      payload: { outputGearType },
      result:  { essences, gearInventory, consumables },
    });

    return json({
      ok:              true,
      essences,
      gearInventory,
      consumables,
      serverUpdatedAt: updateData.updated_at,
    });

  } catch (e) {
    console.error("craft-gear error:", e);
    return err("Internal server error", 500);
  }
});
