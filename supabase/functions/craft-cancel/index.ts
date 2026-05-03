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

// ── Legacy gear recipe lookup (fallback for pre-Phase-3 queue entries) ────────
// New queue entries store ingredient costs directly; these recipes are only
// needed for entries created before the craft-start rewrite.

type GearIngredient =
  | { kind: "essence";    essenceType: string; amount: number }
  | { kind: "gear";       gearType:    string; quantity: number }
  | { kind: "consumable"; consumableId: string; quantity: number };

interface GearRecipe { outputGearType: string; ingredients: GearIngredient[] }

const E = (essenceType: string, amount: number): GearIngredient => ({ kind: "essence", essenceType, amount });
const G = (gearType: string, quantity = 2): GearIngredient => ({ kind: "gear", gearType, quantity });
const C = (consumableId: string, quantity: number): GearIngredient => ({ kind: "consumable", consumableId, quantity });

const GEAR_RECIPES: GearRecipe[] = [
  { outputGearType: "sprinkler_rare",        ingredients: [E("grove", 5), E("zephyr", 5)] },
  { outputGearType: "sprinkler_legendary",   ingredients: [G("sprinkler_rare")] },
  { outputGearType: "sprinkler_mythic",      ingredients: [G("sprinkler_legendary")] },
  { outputGearType: "sprinkler_exalted",     ingredients: [G("sprinkler_mythic")] },
  { outputGearType: "sprinkler_prismatic",   ingredients: [G("sprinkler_exalted")] },
  { outputGearType: "sprinkler_flame",       ingredients: [G("sprinkler_legendary", 1), C("ember_vial_2", 2)] },
  { outputGearType: "sprinkler_frost",       ingredients: [G("sprinkler_legendary", 1), C("frost_vial_2", 2)] },
  { outputGearType: "sprinkler_lightning",   ingredients: [G("sprinkler_mythic", 1), C("storm_vial_3", 2)] },
  { outputGearType: "sprinkler_lunar",       ingredients: [G("sprinkler_mythic", 1), C("moon_vial_3", 2)] },
  { outputGearType: "sprinkler_midas",       ingredients: [G("sprinkler_exalted", 1), C("golden_vial_4", 2)] },
  { outputGearType: "sprinkler_prism",       ingredients: [G("sprinkler_prismatic", 1), C("rainbow_vial_5", 2)] },
  { outputGearType: "grow_lamp_uncommon",    ingredients: [E("solar", 4), E("grove", 4)] },
  { outputGearType: "grow_lamp_rare",        ingredients: [G("grow_lamp_uncommon")] },
  { outputGearType: "scarecrow_rare",        ingredients: [E("arcane", 5), E("storm", 5)] },
  { outputGearType: "scarecrow_legendary",   ingredients: [G("scarecrow_rare")] },
  { outputGearType: "scarecrow_mythic",      ingredients: [G("scarecrow_legendary")] },
  { outputGearType: "composter_uncommon",    ingredients: [E("grove", 4), E("solar", 4)] },
  { outputGearType: "composter_rare",        ingredients: [G("composter_uncommon")] },
  { outputGearType: "composter_legendary",   ingredients: [G("composter_rare")] },
  { outputGearType: "fan_uncommon",          ingredients: [E("zephyr", 4), E("storm", 4)] },
  { outputGearType: "fan_rare",              ingredients: [G("fan_uncommon")] },
  { outputGearType: "fan_legendary",         ingredients: [G("fan_rare")] },
  { outputGearType: "harvest_bell_uncommon", ingredients: [E("stellar", 4), E("fairy", 4)] },
  { outputGearType: "harvest_bell_rare",     ingredients: [G("harvest_bell_uncommon")] },
  { outputGearType: "harvest_bell_legendary",ingredients: [G("harvest_bell_rare")] },
  { outputGearType: "aegis_uncommon",        ingredients: [E("zephyr", 5), E("shadow", 3)] },
  { outputGearType: "aegis_rare",            ingredients: [G("aegis_uncommon")] },
  { outputGearType: "aegis_legendary",       ingredients: [G("aegis_rare")] },
  { outputGearType: "cropsticks",            ingredients: [E("arcane", 4), E("stellar", 4), E("grove", 4)] },
  { outputGearType: "auto_planter_prismatic",ingredients: [G("sprinkler_prismatic", 1), G("harvest_bell_legendary", 1), E("universal", 10)] },
  { outputGearType: "lawnmower_uncommon",    ingredients: [E("grove", 2), E("solar", 2)] },
  { outputGearType: "lawnmower_rare",        ingredients: [G("lawnmower_uncommon")] },
  { outputGearType: "lawnmower_legendary",   ingredients: [G("lawnmower_rare")] },
  { outputGearType: "aqueduct_uncommon",     ingredients: [E("tide", 4), E("zephyr", 2)] },
  { outputGearType: "aqueduct_rare",         ingredients: [G("aqueduct_uncommon")] },
  { outputGearType: "aqueduct_legendary",    ingredients: [G("aqueduct_rare")] },
  { outputGearType: "balance_scale_legendary",ingredients: [E("arcane", 8), E("solar", 4), E("shadow", 4)] },
  { outputGearType: "balance_scale_mythic",  ingredients: [G("balance_scale_legendary")] },
  { outputGearType: "balance_scale_exalted", ingredients: [G("balance_scale_mythic")] },
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
        .select("coins, essences, gear_inventory, consumables, infusers, fertilizers, crafting_queue, updated_at")
        .eq("user_id", userId)
        .single(),
    ]);

    if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
      return err("Unauthorized", 401);
    }
    if (saveResult.error || !saveResult.data) return err("Save not found", 404);

    const save           = saveResult.data;
    const priorUpdatedAt = save.updated_at as string;

    // Support both new format (kind + outputId + stored costs) and legacy (gearType)
    const craftingQueue = (save.crafting_queue ?? []) as {
      id:               string;
      kind?:            string;
      outputId?:        string;
      gearType?:        string;   // legacy field
      startedAt:        string;
      durationMs:       number;
      quantity?:        number;
      coinCost?:        number;
      essenceCosts?:    { type: string; amount: number }[];
      gearCosts?:       { gearType: string; quantity: number }[];
      consumableCosts?: { id: string; quantity: number }[];
      attunementCosts?: { rarity: string; quantity: number }[];
    }[];

    let coins         = (save.coins          ?? 0) as number;
    let essences      = (save.essences       ?? []) as { type: string; amount: number }[];
    let gearInventory = (save.gear_inventory ?? []) as { gearType: string; quantity: number }[];
    let consumables   = (save.consumables    ?? []) as { id: string; quantity: number }[];
    let infusers      = (save.infusers       ?? []) as { rarity: string; quantity: number }[];
    let fertilizers   = (save.fertilizers   ?? []) as { type: string; quantity: number }[];

    // ── Find entry ────────────────────────────────────────────────────────────
    const entry = craftingQueue.find((e) => e.id === craftId);
    if (!entry) return err("Craft not found", 404);

    // ── Remove from queue ─────────────────────────────────────────────────────
    const newQueue = craftingQueue.filter((e) => e.id !== craftId);

    // ── Determine refund source ───────────────────────────────────────────────
    // New entries: stored ingredient costs → use directly.
    // Legacy gear entries: no stored costs → fall back to recipe lookup.
    const hasStoredCosts = entry.essenceCosts || entry.gearCosts || entry.consumableCosts || entry.attunementCosts;

    // Refund stored coin cost (new entries store this; legacy/no-cost entries skip).
    if (typeof entry.coinCost === "number" && entry.coinCost > 0) {
      coins += entry.coinCost;
    }

    if (hasStoredCosts) {
      // ── New-format refund: use stored costs ──────────────────────────────────
      for (const { type, amount } of (entry.essenceCosts ?? [])) {
        const idx = essences.findIndex((e) => e.type === type);
        essences = idx >= 0
          ? essences.map((e, i) => i === idx ? { ...e, amount: e.amount + amount } : e)
          : [...essences, { type, amount }];
      }
      for (const { gearType, quantity } of (entry.gearCosts ?? [])) {
        const idx = gearInventory.findIndex((g) => g.gearType === gearType);
        gearInventory = idx >= 0
          ? gearInventory.map((g, i) => i === idx ? { ...g, quantity: g.quantity + quantity } : g)
          : [...gearInventory, { gearType, quantity }];
      }
      for (const { id, quantity } of (entry.consumableCosts ?? [])) {
        if (id.startsWith("fertilizer_")) {
          // Fertilizer ingredient costs live in the fertilizers array
          const fertType = id.replace("fertilizer_", "");
          const idx = fertilizers.findIndex((f) => f.type === fertType);
          fertilizers = idx >= 0
            ? fertilizers.map((f, i) => i === idx ? { ...f, quantity: f.quantity + quantity } : f)
            : [...fertilizers, { type: fertType, quantity }];
        } else {
          const idx = consumables.findIndex((c) => c.id === id);
          consumables = idx >= 0
            ? consumables.map((c, i) => i === idx ? { ...c, quantity: c.quantity + quantity } : c)
            : [...consumables, { id, quantity }];
        }
      }
      for (const { rarity, quantity } of (entry.attunementCosts ?? [])) {
        const idx = infusers.findIndex((inf) => inf.rarity === rarity);
        infusers = idx >= 0
          ? infusers.map((inf, i) => i === idx ? { ...inf, quantity: inf.quantity + quantity } : inf)
          : [...infusers, { rarity, quantity }];
      }

    } else {
      // ── Legacy-format refund: look up gear recipe ────────────────────────────
      const legacyGearType = entry.gearType ?? entry.outputId;
      const recipe = legacyGearType ? (GEAR_RECIPE_MAP[legacyGearType] as GearRecipe | undefined) : undefined;
      if (!recipe) return err(`Cannot refund: missing cost data for craft ${craftId}`);

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
    }

    // ── CAS write ─────────────────────────────────────────────────────────────
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from("game_saves")
      .update({
        coins,
        essences,
        gear_inventory: gearInventory,
        consumables,
        infusers,
        fertilizers,
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
      payload: { craftId },
      result:  { refundedFromStoredCosts: hasStoredCosts },
    });

    return json({
      ok:              true,
      coins,
      craftingQueue:   newQueue,
      essences,
      gearInventory,
      consumables,
      infusers,
      fertilizers,
      serverUpdatedAt: updateData.updated_at,
    });

  } catch (e) {
    console.error("craft-cancel error:", e);
    return err("Internal server error", 500);
  }
});
