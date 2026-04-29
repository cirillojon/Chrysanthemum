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

// ── Mirrored recipe data ──────────────────────────────────────────────────────
// Edge functions cannot import from src/ — data is hardcoded here.
// Ingredients are needed to compute refunds on cancel.

type GearIngredient =
  | { kind: "essence";    essenceType: string; amount: number }
  | { kind: "gear";       gearType:    string; quantity: number }
  | { kind: "consumable"; consumableId: string; quantity: number };

interface GearRecipe {
  outputGearType: string;
  ingredients:    GearIngredient[];
  coinCost:       number;
  durationMs:     number;
}

const DU = 5  * 60_000;
const DR = 20 * 60_000;
const DL = 90 * 60_000;
const DM = 5  * 60 * 60_000;
const DE = 12 * 60 * 60_000;
const DP = 24 * 60 * 60_000;

const E = (essenceType: string, amount: number): GearIngredient => ({ kind: "essence", essenceType, amount });
const G = (gearType: string, quantity = 2): GearIngredient => ({ kind: "gear", gearType, quantity });
const C = (consumableId: string, quantity: number): GearIngredient => ({ kind: "consumable", consumableId, quantity });

const GEAR_RECIPES: GearRecipe[] = [
  { outputGearType: "sprinkler_rare",       ingredients: [E("grove", 5), E("zephyr", 5)],                             coinCost: 400,     durationMs: DR },
  { outputGearType: "sprinkler_legendary",  ingredients: [G("sprinkler_rare")],                                        coinCost: 5_500,   durationMs: DL },
  { outputGearType: "sprinkler_mythic",     ingredients: [G("sprinkler_legendary")],                                   coinCost: 60_000,  durationMs: DM },
  { outputGearType: "sprinkler_exalted",    ingredients: [G("sprinkler_mythic")],                                      coinCost: 200_000, durationMs: DE },
  { outputGearType: "sprinkler_prismatic",  ingredients: [G("sprinkler_exalted")],                                     coinCost: 800_000, durationMs: DP },
  { outputGearType: "sprinkler_flame",      ingredients: [G("sprinkler_legendary", 1), C("ember_vial_2", 2)],          coinCost: 6_000,   durationMs: DL },
  { outputGearType: "sprinkler_frost",      ingredients: [G("sprinkler_legendary", 1), C("frost_vial_2", 2)],          coinCost: 6_000,   durationMs: DL },
  { outputGearType: "sprinkler_lightning",  ingredients: [G("sprinkler_mythic", 1), C("storm_vial_3", 2)],             coinCost: 50_000,  durationMs: DM },
  { outputGearType: "sprinkler_lunar",      ingredients: [G("sprinkler_mythic", 1), C("moon_vial_3", 2)],              coinCost: 50_000,  durationMs: DM },
  { outputGearType: "sprinkler_midas",      ingredients: [G("sprinkler_exalted", 1), C("golden_vial_4", 2)],           coinCost: 200_000, durationMs: DE },
  { outputGearType: "sprinkler_prism",      ingredients: [G("sprinkler_prismatic", 1), C("rainbow_vial_5", 2)],        coinCost: 800_000, durationMs: DP },
  { outputGearType: "grow_lamp_uncommon",   ingredients: [E("solar", 4), E("grove", 4)],                              coinCost: 200,     durationMs: DU },
  { outputGearType: "grow_lamp_rare",       ingredients: [G("grow_lamp_uncommon")],                                    coinCost: 1_500,   durationMs: DR },
  { outputGearType: "scarecrow_rare",       ingredients: [E("arcane", 5), E("storm", 5)],                             coinCost: 500,     durationMs: DR },
  { outputGearType: "scarecrow_legendary",  ingredients: [G("scarecrow_rare")],                                        coinCost: 7_000,   durationMs: DL },
  { outputGearType: "scarecrow_mythic",     ingredients: [G("scarecrow_legendary")],                                   coinCost: 65_000,  durationMs: DM },
  { outputGearType: "composter_uncommon",   ingredients: [E("grove", 4), E("solar", 4)],                              coinCost: 200,     durationMs: DU },
  { outputGearType: "composter_rare",       ingredients: [G("composter_uncommon")],                                    coinCost: 1_500,   durationMs: DR },
  { outputGearType: "composter_legendary",  ingredients: [G("composter_rare")],                                        coinCost: 7_000,   durationMs: DL },
  { outputGearType: "fan_uncommon",         ingredients: [E("zephyr", 4), E("storm", 4)],                             coinCost: 200,     durationMs: DU },
  { outputGearType: "fan_rare",             ingredients: [G("fan_uncommon")],                                          coinCost: 1_500,   durationMs: DR },
  { outputGearType: "fan_legendary",        ingredients: [G("fan_rare")],                                              coinCost: 7_000,   durationMs: DL },
  { outputGearType: "harvest_bell_uncommon",ingredients: [E("stellar", 4), E("fairy", 4)],                            coinCost: 300,     durationMs: DU },
  { outputGearType: "harvest_bell_rare",    ingredients: [G("harvest_bell_uncommon")],                                 coinCost: 1_500,   durationMs: DR },
  { outputGearType: "harvest_bell_legendary",ingredients:[G("harvest_bell_rare")],                                     coinCost: 7_000,   durationMs: DL },
  { outputGearType: "aegis_uncommon",       ingredients: [E("zephyr", 5), E("shadow", 3)],                            coinCost: 500,     durationMs: DU },
  { outputGearType: "aegis_rare",           ingredients: [G("aegis_uncommon")],                                        coinCost: 2_000,   durationMs: DR },
  { outputGearType: "aegis_legendary",      ingredients: [G("aegis_rare")],                                            coinCost: 15_000,  durationMs: DL },
  { outputGearType: "garden_pin",           ingredients: [E("arcane", 3), E("fairy", 3)],                             coinCost: 200,     durationMs: DU },
  { outputGearType: "cropsticks",           ingredients: [E("arcane", 4), E("stellar", 4), E("grove", 4)],            coinCost: 20_000,  durationMs: DL },
  { outputGearType: "auto_planter_prismatic",ingredients:[G("sprinkler_prismatic", 1), G("harvest_bell_legendary", 1), E("universal", 10)], coinCost: 500_000, durationMs: DP },
];

const GEAR_RECIPE_MAP = Object.fromEntries(GEAR_RECIPES.map((r) => [r.outputGearType, r]));

// ── Response helpers ──────────────────────────────────────────────────────────

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
        .select("essences, gear_inventory, consumables, crafting_queue, updated_at")
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
    let essences      = (save.essences       ?? []) as { type: string; amount: number }[];
    let gearInventory = (save.gear_inventory ?? []) as { gearType: string; quantity: number }[];
    let consumables   = (save.consumables    ?? []) as { id: string; quantity: number }[];

    // ── Find entry ────────────────────────────────────────────────────────────
    const entry = craftingQueue.find((e) => e.id === craftId);
    if (!entry) return err("Craft not found", 404);

    // ── Look up recipe (needed for ingredient refund) ─────────────────────────
    const recipe = GEAR_RECIPE_MAP[entry.gearType] as GearRecipe | undefined;
    if (!recipe) return err(`Unknown gear type in queue: ${entry.gearType}`);

    // ── Remove from queue ─────────────────────────────────────────────────────
    const newQueue = craftingQueue.filter((e) => e.id !== craftId);

    // ── Refund ingredients only — coin cost is NOT refunded ───────────────────
    for (const ing of recipe.ingredients) {
      if (ing.kind === "essence") {
        const idx = essences.findIndex((e) => e.type === ing.essenceType);
        essences = idx >= 0
          ? essences.map((e, i) => i === idx ? { ...e, amount: e.amount + ing.amount } : e)
          : [...essences, { type: ing.essenceType, amount: ing.amount }];
      } else if (ing.kind === "gear") {
        const idx = gearInventory.findIndex((g) => g.gearType === ing.gearType);
        gearInventory = idx >= 0
          ? gearInventory.map((g, i) => i === idx ? { ...g, quantity: g.quantity + ing.quantity } : g)
          : [...gearInventory, { gearType: ing.gearType, quantity: ing.quantity }];
      } else {
        const idx = consumables.findIndex((c) => c.id === ing.consumableId);
        consumables = idx >= 0
          ? consumables.map((c, i) => i === idx ? { ...c, quantity: c.quantity + ing.quantity } : c)
          : [...consumables, { id: ing.consumableId, quantity: ing.quantity }];
      }
    }

    // ── CAS write ─────────────────────────────────────────────────────────────
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from("game_saves")
      .update({
        essences,
        gear_inventory: gearInventory,
        consumables,
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
      action:  "craft_cancel",
      payload: { craftId, gearType: entry.gearType },
      result:  { refundedIngredients: recipe.ingredients },
    });

    return json({
      ok:              true,
      craftingQueue:   newQueue,
      essences,
      gearInventory,
      consumables,
      serverUpdatedAt: updateData.updated_at,
    });

  } catch (e) {
    console.error("craft-cancel error:", e);
    return err("Internal server error", 500);
  }
});
