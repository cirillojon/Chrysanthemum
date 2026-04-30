import type { GearType } from "./gear";

// ── Gear recipe types ──────────────────────────────────────────────────────

export type GearIngredient =
  | { kind: "essence";    essenceType: string; amount: number }
  | { kind: "gear";       gearType: GearType;  quantity: number }
  | { kind: "consumable"; consumableId: string; quantity: number };

export interface GearRecipe {
  outputGearType: GearType;
  /** All items and essences required to craft this gear */
  ingredients: GearIngredient[];
  /** Coin cost in addition to ingredient cost */
  coinCost: number;
  /** How long the craft takes in milliseconds (Phase 3 time-gated queue) */
  durationMs: number;
}

// ── Craft duration tiers (ms) ──────────────────────────────────────────────

export const CRAFT_DURATION_MS = {
  uncommon:  5  * 60_000,           //  5 min
  rare:      20 * 60_000,           // 20 min
  legendary: 90 * 60_000,           //  1.5 hr
  mythic:    5  * 60 * 60_000,      //  5 hr
  exalted:   12 * 60 * 60_000,      // 12 hr
  prismatic: 24 * 60 * 60_000,      // 24 hr
} as const;

const DU = CRAFT_DURATION_MS.uncommon;
const DR = CRAFT_DURATION_MS.rare;
const DL = CRAFT_DURATION_MS.legendary;
const DM = CRAFT_DURATION_MS.mythic;
const DE = CRAFT_DURATION_MS.exalted;
const DP = CRAFT_DURATION_MS.prismatic;

// ── Ingredient shorthand helpers ───────────────────────────────────────────

const E = (essenceType: string, amount: number): GearIngredient =>
  ({ kind: "essence", essenceType, amount });
const G = (gearType: GearType, quantity = 2): GearIngredient =>
  ({ kind: "gear", gearType, quantity });
const C = (consumableId: string, quantity: number): GearIngredient =>
  ({ kind: "consumable", consumableId, quantity });

// ── Gear recipes ───────────────────────────────────────────────────────────

export const GEAR_RECIPES: GearRecipe[] = [

  // ── Regular Sprinklers (I–V) ──────────────────────────────────────────────
  {
    outputGearType: "sprinkler_rare",
    ingredients:    [E("grove", 5), E("zephyr", 5)],
    coinCost:       400,
    durationMs:     DR,
  },
  {
    outputGearType: "sprinkler_legendary",
    ingredients:    [G("sprinkler_rare")],
    coinCost:       5_500,
    durationMs:     DL,
  },
  {
    outputGearType: "sprinkler_mythic",
    ingredients:    [G("sprinkler_legendary")],
    coinCost:       60_000,
    durationMs:     DM,
  },
  {
    outputGearType: "sprinkler_exalted",
    ingredients:    [G("sprinkler_mythic")],
    coinCost:       200_000,
    durationMs:     DE,
  },
  {
    outputGearType: "sprinkler_prismatic",
    ingredients:    [G("sprinkler_exalted")],
    coinCost:       800_000,
    durationMs:     DP,
  },

  // ── Mutation Sprinklers ───────────────────────────────────────────────────
  { // Heater (Scorched) — legendary
    outputGearType: "sprinkler_flame",
    ingredients:    [G("sprinkler_legendary", 1), C("ember_vial_2", 2)],
    coinCost:       6_000,
    durationMs:     DL,
  },
  { // Cooler (Frozen) — legendary
    outputGearType: "sprinkler_frost",
    ingredients:    [G("sprinkler_legendary", 1), C("frost_vial_2", 2)],
    coinCost:       6_000,
    durationMs:     DL,
  },
  { // Generator (Shocked) — mythic
    outputGearType: "sprinkler_lightning",
    ingredients:    [G("sprinkler_mythic", 1), C("storm_vial_3", 2)],
    coinCost:       50_000,
    durationMs:     DM,
  },
  { // Crystal Ball (Moonlit) — mythic
    outputGearType: "sprinkler_lunar",
    ingredients:    [G("sprinkler_mythic", 1), C("moon_vial_3", 2)],
    coinCost:       50_000,
    durationMs:     DM,
  },
  { // Midas Sprinkler (Gilded) — exalted
    outputGearType: "sprinkler_midas",
    ingredients:    [G("sprinkler_exalted", 1), C("golden_vial_4", 2)],
    coinCost:       200_000,
    durationMs:     DE,
  },
  { // Kaleidoscope (Rainbow) — prismatic
    outputGearType: "sprinkler_prism",
    ingredients:    [G("sprinkler_prismatic", 1), C("rainbow_vial_5", 2)],
    coinCost:       800_000,
    durationMs:     DP,
  },

  // ── Grow Lamp (I–II) ──────────────────────────────────────────────────────
  {
    outputGearType: "grow_lamp_uncommon",
    ingredients:    [E("solar", 4), E("grove", 4)],
    coinCost:       200,
    durationMs:     DU,
  },
  {
    outputGearType: "grow_lamp_rare",
    ingredients:    [G("grow_lamp_uncommon")],
    coinCost:       1_500,
    durationMs:     DR,
  },

  // ── Scarecrow (I–III) ─────────────────────────────────────────────────────
  {
    outputGearType: "scarecrow_rare",
    ingredients:    [E("arcane", 5), E("storm", 5)],
    coinCost:       500,
    durationMs:     DR,
  },
  {
    outputGearType: "scarecrow_legendary",
    ingredients:    [G("scarecrow_rare")],
    coinCost:       7_000,
    durationMs:     DL,
  },
  {
    outputGearType: "scarecrow_mythic",
    ingredients:    [G("scarecrow_legendary")],
    coinCost:       65_000,
    durationMs:     DM,
  },

  // ── Composter (I–III) ─────────────────────────────────────────────────────
  {
    outputGearType: "composter_uncommon",
    ingredients:    [E("grove", 4), E("solar", 4)],
    coinCost:       200,
    durationMs:     DU,
  },
  {
    outputGearType: "composter_rare",
    ingredients:    [G("composter_uncommon")],
    coinCost:       1_500,
    durationMs:     DR,
  },
  {
    outputGearType: "composter_legendary",
    ingredients:    [G("composter_rare")],
    coinCost:       7_000,
    durationMs:     DL,
  },

  // ── Fan (I–III) ───────────────────────────────────────────────────────────
  {
    outputGearType: "fan_uncommon",
    ingredients:    [E("zephyr", 4), E("storm", 4)],
    coinCost:       200,
    durationMs:     DU,
  },
  {
    outputGearType: "fan_rare",
    ingredients:    [G("fan_uncommon")],
    coinCost:       1_500,
    durationMs:     DR,
  },
  {
    outputGearType: "fan_legendary",
    ingredients:    [G("fan_rare")],
    coinCost:       7_000,
    durationMs:     DL,
  },

  // ── Harvest Bell (I–III) ──────────────────────────────────────────────────
  {
    outputGearType: "harvest_bell_uncommon",
    ingredients:    [E("stellar", 4), E("fairy", 4)],
    coinCost:       300,
    durationMs:     DU,
  },
  {
    outputGearType: "harvest_bell_rare",
    ingredients:    [G("harvest_bell_uncommon")],
    coinCost:       1_500,
    durationMs:     DR,
  },
  {
    outputGearType: "harvest_bell_legendary",
    ingredients:    [G("harvest_bell_rare")],
    coinCost:       7_000,
    durationMs:     DL,
  },

  // ── Aegis (I–III) ────────────────────────────────────────────────────────
  {
    outputGearType: "aegis_uncommon",
    ingredients:    [E("zephyr", 5), E("shadow", 3)],
    coinCost:       500,
    durationMs:     DU,
  },
  {
    outputGearType: "aegis_rare",
    ingredients:    [G("aegis_uncommon")],
    coinCost:       2_000,
    durationMs:     DR,
  },
  {
    outputGearType: "aegis_legendary",
    ingredients:    [G("aegis_rare")],
    coinCost:       15_000,
    durationMs:     DL,
  },

  // ── Cropsticks (legendary) ────────────────────────────────────────────────
  {
    outputGearType: "cropsticks",
    ingredients:    [E("arcane", 4), E("stellar", 4), E("grove", 4)],
    coinCost:       20_000,
    durationMs:     DL,
  },

  // ── Auto-Planter (prismatic) ──────────────────────────────────────────────
  {
    outputGearType: "auto_planter_prismatic",
    ingredients:    [
      G("sprinkler_prismatic", 1),
      G("harvest_bell_legendary", 1),
      E("universal", 10),
    ],
    coinCost:       500_000,
    durationMs:     DP,
  },
];

// ── Lookup map ────────────────────────────────────────────────────────────

export const GEAR_RECIPE_MAP = Object.fromEntries(
  GEAR_RECIPES.map((r) => [r.outputGearType, r])
) as Partial<Record<GearType, GearRecipe>>;

// ── Crafting slot upgrade costs ───────────────────────────────────────────

export const CRAFTING_SLOT_UPGRADES = [
  { slots: 2, cost: 5_000   },
  { slots: 3, cost: 25_000  },
  { slots: 4, cost: 100_000 },
  { slots: 5, cost: 300_000 },
  { slots: 6, cost: 700_000 },
] as const;

// ── Duration from rarity ──────────────────────────────────────────────────────
// Used by CraftingTab to compute durationMs for consumable/attunement recipes.

import type { Rarity } from "./flowers";

export function craftDurationFromRarity(rarity: Rarity): number {
  return (CRAFT_DURATION_MS as Record<string, number>)[rarity] ?? CRAFT_DURATION_MS.rare;
}

// ── Affordability helper ───────────────────────────────────────────────────

export function canCraftGear(
  recipe:       GearRecipe,
  essences:     { type: string; amount: number }[],
  gearInventory: { gearType: GearType; quantity: number }[],
  consumables:  { id: string; quantity: number }[],
  coins         = Infinity,
): boolean {
  if (coins < recipe.coinCost) return false;
  return recipe.ingredients.every((ing) => {
    if (ing.kind === "essence")    return (essences.find((e) => e.type === ing.essenceType)?.amount ?? 0) >= ing.amount;
    if (ing.kind === "gear")       return (gearInventory.find((g) => g.gearType === ing.gearType)?.quantity ?? 0) >= ing.quantity;
    if (ing.kind === "consumable") return (consumables.find((c) => c.id === ing.consumableId)?.quantity ?? 0) >= ing.quantity;
    return false;
  });
}
