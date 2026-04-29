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
  /** Optional coin cost (reserved for Phase 3 time-gated crafting) */
  coinCost?: number;
}

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
    ingredients: [E("grove", 5), E("zephyr", 5)],
  },
  {
    outputGearType: "sprinkler_legendary",
    ingredients: [G("sprinkler_rare")],
  },
  {
    outputGearType: "sprinkler_mythic",
    ingredients: [G("sprinkler_legendary")],
  },
  {
    outputGearType: "sprinkler_exalted",
    ingredients: [G("sprinkler_mythic")],
  },
  {
    outputGearType: "sprinkler_prismatic",
    ingredients: [G("sprinkler_exalted")],
  },

  // ── Mutation Sprinklers ───────────────────────────────────────────────────
  // Recipe: Sprinkler of matching tier + 2× vial of matching type and tier

  { // Heater (Scorched) — legendary
    outputGearType: "sprinkler_flame",
    ingredients: [G("sprinkler_legendary", 1), C("ember_vial_2", 2)],
  },
  { // Cooler (Frozen) — legendary
    outputGearType: "sprinkler_frost",
    ingredients: [G("sprinkler_legendary", 1), C("frost_vial_2", 2)],
  },
  { // Generator (Shocked) — mythic
    outputGearType: "sprinkler_lightning",
    ingredients: [G("sprinkler_mythic", 1), C("storm_vial_3", 2)],
  },
  { // Crystal Ball (Moonlit) — mythic
    outputGearType: "sprinkler_lunar",
    ingredients: [G("sprinkler_mythic", 1), C("moon_vial_3", 2)],
  },
  { // Gold Vial (Golden) — exalted
    outputGearType: "sprinkler_midas",
    ingredients: [G("sprinkler_exalted", 1), C("golden_vial_4", 2)],
  },
  { // Kaleidoscope (Rainbow) — prismatic
    outputGearType: "sprinkler_prism",
    ingredients: [G("sprinkler_prismatic", 1), C("rainbow_vial_5", 2)],
  },

  // ── Grow Lamp (I–II) ──────────────────────────────────────────────────────
  {
    outputGearType: "grow_lamp_uncommon",
    ingredients: [E("solar", 4), E("grove", 4)],
  },
  {
    outputGearType: "grow_lamp_rare",
    ingredients: [G("grow_lamp_uncommon")],
  },

  // ── Scarecrow (I–III) ─────────────────────────────────────────────────────
  {
    outputGearType: "scarecrow_rare",
    ingredients: [E("arcane", 5), E("storm", 5)],
  },
  {
    outputGearType: "scarecrow_legendary",
    ingredients: [G("scarecrow_rare")],
  },
  {
    outputGearType: "scarecrow_mythic",
    ingredients: [G("scarecrow_legendary")],
  },

  // ── Composter (I–III) ─────────────────────────────────────────────────────
  {
    outputGearType: "composter_uncommon",
    ingredients: [E("grove", 4), E("solar", 4)],
  },
  {
    outputGearType: "composter_rare",
    ingredients: [G("composter_uncommon")],
  },
  {
    outputGearType: "composter_legendary",
    ingredients: [G("composter_rare")],
  },

  // ── Fan (I–III) ───────────────────────────────────────────────────────────
  {
    outputGearType: "fan_uncommon",
    ingredients: [E("zephyr", 4), E("storm", 4)],
  },
  {
    outputGearType: "fan_rare",
    ingredients: [G("fan_uncommon")],
  },
  {
    outputGearType: "fan_legendary",
    ingredients: [G("fan_rare")],
  },

  // ── Harvest Bell (I–III) ──────────────────────────────────────────────────
  {
    outputGearType: "harvest_bell_uncommon",
    ingredients: [E("stellar", 4), E("fairy", 4)],
  },
  {
    outputGearType: "harvest_bell_rare",
    ingredients: [G("harvest_bell_uncommon")],
  },
  {
    outputGearType: "harvest_bell_legendary",
    ingredients: [G("harvest_bell_rare")],
  },

  // ── Aegis (I–III) ────────────────────────────────────────────────────────
  {
    outputGearType: "aegis_uncommon",
    ingredients: [E("frost", 5), E("shadow", 5)],
  },
  {
    outputGearType: "aegis_rare",
    ingredients: [G("aegis_uncommon")],
  },
  {
    outputGearType: "aegis_legendary",
    ingredients: [G("aegis_rare")],
  },

  // ── Garden Pin ────────────────────────────────────────────────────────────
  {
    outputGearType: "garden_pin",
    ingredients: [E("arcane", 3), E("fairy", 3)],
  },

  // ── Cropsticks (legendary) ────────────────────────────────────────────────
  {
    outputGearType: "cropsticks",
    ingredients: [E("arcane", 4), E("stellar", 4), E("grove", 4)],
  },

  // ── Auto-Planter (prismatic) ──────────────────────────────────────────────
  // Requires a Sprinkler V and Harvest Bell III as core components
  {
    outputGearType: "auto_planter_prismatic",
    ingredients: [
      G("sprinkler_prismatic", 1),
      G("harvest_bell_legendary", 1),
      E("universal", 10),
    ],
  },
];

// ── Lookup map ────────────────────────────────────────────────────────────

export const GEAR_RECIPE_MAP = Object.fromEntries(
  GEAR_RECIPES.map((r) => [r.outputGearType, r])
) as Partial<Record<GearType, GearRecipe>>;

// ── Affordability helper ───────────────────────────────────────────────────

export function canCraftGear(
  recipe:      GearRecipe,
  essences:    { type: string; amount: number }[],
  gearInventory: { gearType: GearType; quantity: number }[],
  consumables: { id: string; quantity: number }[],
): boolean {
  return recipe.ingredients.every((ing) => {
    if (ing.kind === "essence") {
      return (essences.find((e) => e.type === ing.essenceType)?.amount ?? 0) >= ing.amount;
    }
    if (ing.kind === "gear") {
      return (gearInventory.find((g) => g.gearType === ing.gearType)?.quantity ?? 0) >= ing.quantity;
    }
    if (ing.kind === "consumable") {
      return (consumables.find((c) => c.id === ing.consumableId)?.quantity ?? 0) >= ing.quantity;
    }
    return false;
  });
}
