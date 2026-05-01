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

// ── Mirrored gear recipe data ──────────────────────────────────────────────────
// Edge functions cannot import from src/ — data is hardcoded here.
// Only used for gear crafts (server-authoritative).

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

const DU = 1.5 * 60_000;           //  1m 30s
const DR = 5   * 60_000;           //  5 min
const DL = 25  * 60_000;           // 25 min
const DM = 1   * 60 * 60_000;      //  1 hr
const DE = 3   * 60 * 60_000;      //  3 hr
const DP = 6   * 60 * 60_000;      //  6 hr

const E = (essenceType: string, amount: number): GearIngredient => ({ kind: "essence", essenceType, amount });
const G = (gearType: string, quantity = 2): GearIngredient => ({ kind: "gear", gearType, quantity });
const C = (consumableId: string, quantity: number): GearIngredient => ({ kind: "consumable", consumableId, quantity });

const GEAR_RECIPES: GearRecipe[] = [
  { outputGearType: "sprinkler_rare",        ingredients: [E("grove", 2), E("zephyr", 2), E("tide", 4)],                                             coinCost: 400,     durationMs: DR },
  { outputGearType: "sprinkler_legendary",   ingredients: [G("sprinkler_rare")],                                                                      coinCost: 5_500,   durationMs: DL },
  { outputGearType: "sprinkler_mythic",      ingredients: [G("sprinkler_legendary")],                                                                  coinCost: 60_000,  durationMs: DM },
  { outputGearType: "sprinkler_exalted",     ingredients: [G("sprinkler_mythic")],                                                                     coinCost: 200_000, durationMs: DE },
  { outputGearType: "sprinkler_prismatic",   ingredients: [G("sprinkler_exalted")],                                                                    coinCost: 800_000, durationMs: DP },
  { outputGearType: "sprinkler_flame",       ingredients: [G("sprinkler_legendary", 1), C("ember_vial_2", 2)],                                         coinCost: 6_000,   durationMs: DL },
  { outputGearType: "sprinkler_frost",       ingredients: [G("sprinkler_legendary", 1), C("frost_vial_2", 2)],                                         coinCost: 6_000,   durationMs: DL },
  { outputGearType: "sprinkler_lightning",   ingredients: [G("sprinkler_mythic", 1), C("storm_vial_3", 2)],                                            coinCost: 50_000,  durationMs: DM },
  { outputGearType: "sprinkler_lunar",       ingredients: [G("sprinkler_mythic", 1), C("moon_vial_3", 2)],                                             coinCost: 50_000,  durationMs: DM },
  { outputGearType: "sprinkler_midas",       ingredients: [G("sprinkler_exalted", 1), C("golden_vial_4", 2)],                                          coinCost: 200_000, durationMs: DE },
  { outputGearType: "sprinkler_prism",       ingredients: [G("sprinkler_prismatic", 1), C("rainbow_vial_5", 2), C("magnifying_glass", 1)],            coinCost: 800_000, durationMs: DP },
  { outputGearType: "grow_lamp_uncommon",    ingredients: [E("solar", 4), E("grove", 4)],                                                             coinCost: 200,     durationMs: DU },
  { outputGearType: "grow_lamp_rare",        ingredients: [G("grow_lamp_uncommon")],                                                                   coinCost: 1_500,   durationMs: DR },
  { outputGearType: "scarecrow_rare",        ingredients: [E("arcane", 2), E("storm", 2), E("shadow", 4)],                                           coinCost: 500,     durationMs: DR },
  { outputGearType: "scarecrow_legendary",   ingredients: [G("scarecrow_rare")],                                                                       coinCost: 7_000,   durationMs: DL },
  { outputGearType: "scarecrow_mythic",      ingredients: [G("scarecrow_legendary")],                                                                  coinCost: 65_000,  durationMs: DM },
  { outputGearType: "composter_uncommon",    ingredients: [E("grove", 4), E("solar", 4)],                                                             coinCost: 200,     durationMs: DU },
  { outputGearType: "composter_rare",        ingredients: [G("composter_uncommon")],                                                                   coinCost: 1_500,   durationMs: DR },
  { outputGearType: "composter_legendary",   ingredients: [G("composter_rare")],                                                                       coinCost: 7_000,   durationMs: DL },
  { outputGearType: "fan_uncommon",          ingredients: [E("zephyr", 4), E("storm", 4)],                                                            coinCost: 200,     durationMs: DU },
  { outputGearType: "fan_rare",              ingredients: [G("fan_uncommon")],                                                                         coinCost: 1_500,   durationMs: DR },
  { outputGearType: "fan_legendary",         ingredients: [G("fan_rare")],                                                                             coinCost: 7_000,   durationMs: DL },
  { outputGearType: "harvest_bell_uncommon", ingredients: [E("stellar", 4), E("fairy", 4)],                                                           coinCost: 300,     durationMs: DU },
  { outputGearType: "harvest_bell_rare",     ingredients: [G("harvest_bell_uncommon")],                                                                coinCost: 1_500,   durationMs: DR },
  { outputGearType: "harvest_bell_legendary",ingredients: [G("harvest_bell_rare")],                                                                    coinCost: 7_000,   durationMs: DL },
  { outputGearType: "aegis_uncommon",        ingredients: [E("solar", 6), E("stellar", 2)],                                                          coinCost: 500,     durationMs: DU },
  { outputGearType: "aegis_rare",            ingredients: [G("aegis_uncommon")],                                                                       coinCost: 2_000,   durationMs: DR },
  { outputGearType: "aegis_legendary",       ingredients: [G("aegis_rare")],                                                                           coinCost: 15_000,  durationMs: DL },
  { outputGearType: "cropsticks",            ingredients: [E("grove", 4), E("tide", 4), E("arcane", 4), E("solar", 4)],                              coinCost: 20_000,  durationMs: DL },
  { outputGearType: "auto_planter_prismatic",ingredients: [G("sprinkler_prismatic", 1), G("harvest_bell_legendary", 1), E("universal", 10)],          coinCost: 500_000, durationMs: DP },
];

const GEAR_RECIPE_MAP = Object.fromEntries(GEAR_RECIPES.map((r) => [r.outputGearType, r]));

// ── Essence crafting (Universal Essence) ─────────────────────────────────────
// Server-authoritative recipe for the time-gated Universal Essence craft. The
// only "essence" kind currently is "universal"; one craft consumes 1 of each of
// the 12 elemental essences and produces 1 Universal Essence after 60s.
const UNIVERSAL_ESSENCE_ELEMENTALS = [
  "blaze", "tide", "grove", "frost", "storm", "lunar",
  "solar", "fairy", "shadow", "arcane", "stellar", "zephyr",
] as const;
const UNIVERSAL_ESSENCE_COST_PER_TYPE = 1;
const UNIVERSAL_ESSENCE_BASE_DURATION_MS = 60_000; // 1 minute per essence

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

    const body = await req.json() as {
      kind:        "gear" | "consumable" | "attunement" | "essence";
      outputId:    string;
      quantity?:   number;
      durationMs?: number;
      costs?: {
        essenceCosts?:    { type: string; amount: number }[];
        consumableCosts?: { id: string; quantity: number }[];
        attunementCosts?: { rarity: string; quantity: number }[];
      };
    };

    const { kind, outputId } = body;
    if (!kind || !outputId)                                          return err("kind and outputId are required");
    if (kind !== "gear" && kind !== "consumable" && kind !== "attunement" && kind !== "essence") {
      return err("kind must be 'gear', 'consumable', 'attunement', or 'essence'");
    }

    // ── Bulk crafting — validate quantity (default 1, cap at 50) ──────────────
    const MAX_BULK_QUANTITY = 50;
    const rawQuantity = body.quantity ?? 1;
    if (!Number.isInteger(rawQuantity) || rawQuantity < 1 || rawQuantity > MAX_BULK_QUANTITY) {
      return err(`quantity must be an integer between 1 and ${MAX_BULK_QUANTITY}`);
    }
    const quantity = rawQuantity;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [authResult, saveResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin
        .from("game_saves")
        .select("coins, essences, gear_inventory, consumables, infusers, fertilizers, crafting_queue, crafting_slot_count, active_boosts, updated_at")
        .eq("user_id", userId)
        .single(),
    ]);

    if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
      return err("Unauthorized", 401);
    }
    if (saveResult.error || !saveResult.data) return err("Save not found", 404);

    const save           = saveResult.data;
    const priorUpdatedAt = save.updated_at as string;

    let coins         = save.coins as number;
    let essences      = (save.essences       ?? []) as { type: string; amount: number }[];
    let gearInventory = (save.gear_inventory ?? []) as { gearType: string; quantity: number }[];
    let consumables   = (save.consumables    ?? []) as { id: string; quantity: number }[];
    let infusers      = (save.infusers       ?? []) as { rarity: string; quantity: number }[];
    let fertilizers   = (save.fertilizers   ?? []) as { type: string; quantity: number }[];
    const craftingQueue     = (save.crafting_queue     ?? []) as Record<string, unknown>[];
    const craftingSlotCount = (save.crafting_slot_count ?? 1) as number;

    // ── Validate slot availability ─────────────────────────────────────────────
    if (craftingQueue.length >= craftingSlotCount) {
      return err("No crafting slots available");
    }

    // ── Resolve ingredients, costs, and duration ───────────────────────────────

    let durationMs = 0;
    let coinCost   = 0;

    // Stored ingredient costs — used by craft-cancel for refunds
    let newEntryEssenceCosts:    { type: string; amount: number }[]    | undefined;
    let newEntryGearCosts:       { gearType: string; quantity: number }[] | undefined;
    let newEntryConsumableCosts: { id: string; quantity: number }[]    | undefined;
    let newEntryAttunementCosts: { rarity: string; quantity: number }[] | undefined;

    if (kind === "gear") {
      // ── Server-authoritative: look up the recipe ────────────────────────────
      const recipe = GEAR_RECIPE_MAP[outputId] as GearRecipe | undefined;
      if (!recipe) return err(`Unknown gear type: ${outputId}`);

      // Multiply duration and costs by quantity (bulk crafting)
      durationMs = recipe.durationMs * quantity;
      coinCost   = recipe.coinCost   * quantity;

      if (coins < coinCost) {
        return err(`Not enough coins (need ${coinCost}, have ${coins})`);
      }

      for (const ing of recipe.ingredients) {
        if (ing.kind === "essence") {
          const need = ing.amount * quantity;
          const have = essences.find((e) => e.type === ing.essenceType)?.amount ?? 0;
          if (have < need) return err(`Not enough ${ing.essenceType} essence (need ${need}, have ${have})`);
        } else if (ing.kind === "gear") {
          const need = ing.quantity * quantity;
          const have = gearInventory.find((g) => g.gearType === ing.gearType)?.quantity ?? 0;
          if (have < need) return err(`Not enough ${ing.gearType} (need ${need}, have ${have})`);
        } else {
          const need = ing.quantity * quantity;
          const have = consumables.find((c) => c.id === ing.consumableId)?.quantity ?? 0;
          if (have < need) return err(`Not enough ${ing.consumableId} (need ${need}, have ${have})`);
        }
      }

      // Deduct
      coins -= coinCost;
      for (const ing of recipe.ingredients) {
        if (ing.kind === "essence") {
          const need = ing.amount * quantity;
          essences = essences
            .map((e) => e.type === ing.essenceType ? { ...e, amount: e.amount - need } : e)
            .filter((e) => e.amount > 0);
        } else if (ing.kind === "gear") {
          const need = ing.quantity * quantity;
          gearInventory = gearInventory
            .map((g) => g.gearType === ing.gearType ? { ...g, quantity: g.quantity - need } : g)
            .filter((g) => g.quantity > 0);
        } else {
          const need = ing.quantity * quantity;
          consumables = consumables
            .map((c) => c.id === ing.consumableId ? { ...c, quantity: c.quantity - need } : c)
            .filter((c) => c.quantity > 0);
        }
      }

      // Store costs for refund (already multiplied by quantity)
      const eCosts = recipe.ingredients
        .filter((i): i is { kind: "essence"; essenceType: string; amount: number } => i.kind === "essence")
        .map(({ essenceType: type, amount }) => ({ type, amount: amount * quantity }));
      const gCosts = recipe.ingredients
        .filter((i): i is { kind: "gear"; gearType: string; quantity: number } => i.kind === "gear")
        .map(({ gearType, quantity: q }) => ({ gearType, quantity: q * quantity }));
      const cCosts = recipe.ingredients
        .filter((i): i is { kind: "consumable"; consumableId: string; quantity: number } => i.kind === "consumable")
        .map(({ consumableId: id, quantity: q }) => ({ id, quantity: q * quantity }));

      if (eCosts.length) newEntryEssenceCosts    = eCosts;
      if (gCosts.length) newEntryGearCosts       = gCosts;
      if (cCosts.length) newEntryConsumableCosts = cCosts;

    } else if (kind === "essence") {
      // ── Server-authoritative essence craft (Universal Essence) ─────────────
      if (outputId !== "universal") return err(`Unknown essence type: ${outputId}`);

      durationMs = UNIVERSAL_ESSENCE_BASE_DURATION_MS * quantity;

      const need = UNIVERSAL_ESSENCE_COST_PER_TYPE * quantity;
      for (const type of UNIVERSAL_ESSENCE_ELEMENTALS) {
        const have = essences.find((e) => e.type === type)?.amount ?? 0;
        if (have < need) return err(`Not enough ${type} essence (need ${need}, have ${have})`);
      }

      // Deduct
      const map = new Map<string, number>(essences.map((e) => [e.type, e.amount]));
      for (const type of UNIVERSAL_ESSENCE_ELEMENTALS) {
        map.set(type, (map.get(type) ?? 0) - need);
      }
      essences = Array.from(map.entries())
        .map(([type, amount]) => ({ type, amount }))
        .filter((e) => e.amount > 0);

      // Store costs for refund (already × quantity)
      newEntryEssenceCosts = UNIVERSAL_ESSENCE_ELEMENTALS.map((type) => ({ type, amount: need }));

    } else {
      // ── Client-declared costs (consumable / attunement) ────────────────────
      // The server trusts the recipe structure from the client but validates
      // the player actually has the required amounts before deducting.
      // Client sends BASE durationMs + costs; server multiplies by quantity.
      const clientDurationMs = body.durationMs;
      if (!clientDurationMs || clientDurationMs <= 0) {
        return err("durationMs is required for consumable/attunement crafts");
      }
      durationMs = clientDurationMs * quantity;

      const costs              = body.costs ?? {};
      // Multiply each cost amount/quantity by the bulk quantity.
      const essenceCostList    = (costs.essenceCosts    ?? []).map((c) => ({ type: c.type, amount: c.amount * quantity }));
      const consumableCostList = (costs.consumableCosts ?? []).map((c) => ({ id: c.id,     quantity: c.quantity * quantity }));
      const attunementCostList = (costs.attunementCosts ?? []).map((c) => ({ rarity: c.rarity, quantity: c.quantity * quantity }));

      // Validate + deduct essence costs
      for (const { type, amount } of essenceCostList) {
        const have = essences.find((e) => e.type === type)?.amount ?? 0;
        if (have < amount) return err(`Not enough ${type} essence (need ${amount}, have ${have})`);
      }
      essences = essences.map((e) => {
        const cost = essenceCostList.find((c) => c.type === e.type);
        return cost ? { ...e, amount: e.amount - cost.amount } : e;
      }).filter((e) => e.amount > 0);

      // Split consumable costs: regular vs fertilizer (fertilizer_* IDs live in
      // the fertilizers array, not the consumables array).
      const regularConsumableCosts  = consumableCostList.filter((c) => !c.id.startsWith("fertilizer_"));
      const fertilizerIngredCosts   = consumableCostList.filter((c) =>  c.id.startsWith("fertilizer_"));

      // Validate + deduct regular consumable costs
      for (const { id, quantity: need } of regularConsumableCosts) {
        const have = consumables.find((c) => c.id === id)?.quantity ?? 0;
        if (have < need) return err(`Not enough ${id} (need ${need}, have ${have})`);
      }
      consumables = consumables.map((c) => {
        const cost = regularConsumableCosts.find((x) => x.id === c.id);
        return cost ? { ...c, quantity: c.quantity - cost.quantity } : c;
      }).filter((c) => c.quantity > 0);

      // Validate + deduct fertilizer ingredient costs
      for (const { id, quantity: need } of fertilizerIngredCosts) {
        const fertType = id.replace("fertilizer_", "");
        const have = fertilizers.find((f) => f.type === fertType)?.quantity ?? 0;
        if (have < need) return err(`Not enough ${id} (need ${need}, have ${have})`);
      }
      fertilizers = fertilizers.map((f) => {
        const cost = fertilizerIngredCosts.find((c) => c.id.replace("fertilizer_", "") === f.type);
        return cost ? { ...f, quantity: f.quantity - cost.quantity } : f;
      }).filter((f) => f.quantity > 0);

      // Validate + deduct attunement costs (infusers)
      for (const { rarity, quantity: need } of attunementCostList) {
        const have = infusers.find((i) => i.rarity === rarity)?.quantity ?? 0;
        if (have < need) return err(`Not enough ${rarity} attunement (need ${need}, have ${have})`);
      }
      infusers = infusers.map((inf) => {
        const cost = attunementCostList.find((x) => x.rarity === inf.rarity);
        return cost ? { ...inf, quantity: inf.quantity - cost.quantity } : inf;
      }).filter((inf) => inf.quantity > 0);

      // Store costs for refund (already multiplied by quantity)
      if (essenceCostList.length)    newEntryEssenceCosts    = essenceCostList;
      if (consumableCostList.length) newEntryConsumableCosts = consumableCostList;
      if (attunementCostList.length) newEntryAttunementCosts = attunementCostList;
    }

    // ── Apply Forge Haste / Resonance Draft (Phase 5a) ─────────────────────────
    // Halve durationMs for new crafts started while a matching boost is active.
    // Existing in-flight crafts are NOT retroactively boosted — keeps the math
    // simple and exploit-proof. Players are expected to activate boosts before
    // queueing crafts.
    type BoostType = "growth" | "craft" | "attunement";
    const activeBoosts = (save.active_boosts ?? []) as { type: BoostType; expiresAt: string }[];
    // v2.3: Forge Haste ("craft" boost) now applies to ALL crafting-queue work
    // — gear, consumables, infusers, and the universal essence. The "attunement"
    // boost (Resonance Draft) was always intended for the alchemy attunement
    // queue (separate system), not infuser crafting.
    const craftBoostType: BoostType | null =
      kind === "gear" || kind === "consumable" || kind === "essence" || kind === "attunement"
        ? "craft"
        : null;

    if (craftBoostType) {
      const nowMs = Date.now();
      const hasActive = activeBoosts.some(
        (b) => b.type === craftBoostType && new Date(b.expiresAt).getTime() > nowMs,
      );
      if (hasActive) durationMs = Math.max(1, Math.floor(durationMs / 2));
    }

    // ── Build queue entry ──────────────────────────────────────────────────────
    const newEntry: Record<string, unknown> = {
      id:        crypto.randomUUID(),
      kind,
      outputId,
      startedAt: new Date().toISOString(),
      durationMs,
    };
    if (quantity > 1)                    newEntry.quantity        = quantity;
    if (coinCost)                        newEntry.coinCost        = coinCost;
    if (newEntryEssenceCosts?.length)    newEntry.essenceCosts    = newEntryEssenceCosts;
    if (newEntryGearCosts?.length)       newEntry.gearCosts       = newEntryGearCosts;
    if (newEntryConsumableCosts?.length) newEntry.consumableCosts = newEntryConsumableCosts;
    if (newEntryAttunementCosts?.length) newEntry.attunementCosts = newEntryAttunementCosts;

    const newQueue = [...craftingQueue, newEntry];

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
      action:  "craft_start",
      payload: { kind, outputId, quantity },
      result:  { newEntry },
    });

    return json({
      ok:              true,
      coins,
      essences,
      gearInventory,
      consumables,
      infusers,
      fertilizers,
      craftingQueue:   newQueue,
      serverUpdatedAt: updateData.updated_at,
    });

  } catch (e) {
    console.error("craft-start error:", e);
    return err("Internal server error", 500);
  }
});
