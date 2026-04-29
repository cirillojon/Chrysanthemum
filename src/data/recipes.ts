import type { FlowerSpecies, FlowerType, Rarity } from "./flowers";

// ── Rarity ordering ───────────────────────────────────────────────────────────

export const RARITY_ORDER: Rarity[] = [
  "common", "uncommon", "rare", "legendary", "mythic", "exalted", "prismatic",
];

export function rarityIndex(r: Rarity): number {
  return RARITY_ORDER.indexOf(r);
}

// ── Recipe definition ─────────────────────────────────────────────────────────

export interface CrossBreedRecipe {
  /** Stable key stored in discoveredRecipes[] */
  id:              string;
  tier:            1 | 2 | 3 | 4;
  typeA:           FlowerType;
  typeB:           FlowerType;
  /** Both inputs must be at or above this rarity */
  minRarity:       Rarity;
  outputSpeciesId: string;
}

// ── Recipe table ──────────────────────────────────────────────────────────────
//
// Tier 1 — Rare+     inputs → Legendary output
// Tier 2 — Legendary+ inputs → Mythic    output
// Tier 3 — Mythic+   inputs → Exalted   output  (arcane & stellar paths)
// Tier 4 — Exalted+  inputs → Prismatic output  (The First Bloom)

export const CROSS_BREED_RECIPES: CrossBreedRecipe[] = [

  // ── Tier 1 ─────────────────────────────────────────────────────────────────
  { id: "blaze+frost",     tier: 1, typeA: "blaze",  typeB: "frost",   minRarity: "rare",      outputSpeciesId: "phoenix_lily"   },
  { id: "lunar+solar",     tier: 1, typeA: "lunar",  typeB: "solar",   minRarity: "rare",      outputSpeciesId: "eclipse_bloom"  },
  { id: "tide+storm",      tier: 1, typeA: "tide",   typeB: "storm",   minRarity: "rare",      outputSpeciesId: "tempest_orchid" },
  { id: "grove+shadow",    tier: 1, typeA: "grove",  typeB: "shadow",  minRarity: "rare",      outputSpeciesId: "blightmantle"   },
  { id: "arcane+stellar",  tier: 1, typeA: "arcane", typeB: "stellar", minRarity: "rare",      outputSpeciesId: "cosmosbloom"    },
  { id: "fairy+zephyr",    tier: 1, typeA: "fairy",  typeB: "zephyr",  minRarity: "rare",      outputSpeciesId: "dreamgust"      },

  // ── Tier 2 ─────────────────────────────────────────────────────────────────
  { id: "blaze+solar",     tier: 2, typeA: "blaze",  typeB: "solar",   minRarity: "legendary", outputSpeciesId: "solarburst"     },
  { id: "lunar+tide",      tier: 2, typeA: "lunar",  typeB: "tide",    minRarity: "legendary", outputSpeciesId: "tidalune"       },
  { id: "grove+zephyr",    tier: 2, typeA: "grove",  typeB: "zephyr",  minRarity: "legendary", outputSpeciesId: "whisperleaf"    },
  { id: "frost+arcane",    tier: 2, typeA: "frost",  typeB: "arcane",  minRarity: "legendary", outputSpeciesId: "crystalmind"    },

  // ── Tier 3 ─────────────────────────────────────────────────────────────────
  // arcane path — void_chrysalis is Exalted arcane, needed for Tier 4
  { id: "arcane+shadow-t3",  tier: 3, typeA: "arcane",  typeB: "shadow", minRarity: "mythic", outputSpeciesId: "void_chrysalis" },
  // stellar path — starloom is Exalted stellar, needed for Tier 4
  { id: "stellar+zephyr-t3", tier: 3, typeA: "stellar", typeB: "zephyr", minRarity: "mythic", outputSpeciesId: "starloom"       },

  // ── Tier 4 — The First Bloom ─────────────────────────────────────────────
  // Requires the two Tier-3 recipe-only Exalted species (arcane + stellar)
  { id: "arcane+stellar-t4", tier: 4, typeA: "arcane", typeB: "stellar", minRarity: "exalted", outputSpeciesId: "the_first_bloom" },
];

// ── Helper: best matching recipe for two flowers ──────────────────────────────
//
// Returns the highest-tier recipe where both inputs meet the minimum rarity
// and their types satisfy the type pair (in either orientation).
// Returns null if no recipe matches.

export function findRecipe(
  flowerA: FlowerSpecies,
  flowerB: FlowerSpecies,
): CrossBreedRecipe | null {
  const matching = CROSS_BREED_RECIPES.filter((recipe) => {
    if (rarityIndex(flowerA.rarity) < rarityIndex(recipe.minRarity)) return false;
    if (rarityIndex(flowerB.rarity) < rarityIndex(recipe.minRarity)) return false;

    const fwd = flowerA.types.includes(recipe.typeA) && flowerB.types.includes(recipe.typeB);
    const rev = flowerA.types.includes(recipe.typeB) && flowerB.types.includes(recipe.typeA);
    return fwd || rev;
  });

  if (matching.length === 0) return null;
  return [...matching].sort((a, b) => b.tier - a.tier)[0];
}

// ── Helper: "almost there" hint ───────────────────────────────────────────────
//
// True when exactly one side of a type pair is satisfied by the combination —
// i.e. the player is on the right track but using the wrong partner.

export function isAlmostThere(
  flowerA: FlowerSpecies,
  flowerB: FlowerSpecies,
): boolean {
  return CROSS_BREED_RECIPES.some((recipe) => {
    const aHasA = flowerA.types.includes(recipe.typeA);
    const aHasB = flowerA.types.includes(recipe.typeB);
    const bHasA = flowerB.types.includes(recipe.typeA);
    const bHasB = flowerB.types.includes(recipe.typeB);

    // Forward partial: A covers typeA XOR B covers typeB
    const fwdPartial = aHasA !== bHasB;
    // Reverse partial: A covers typeB XOR B covers typeA
    const revPartial = aHasB !== bHasA;
    return fwdPartial || revPartial;
  });
}

// ── Output count bonus ────────────────────────────────────────────────────────
//
// Yield 2 seeds instead of 1 when both inputs exceed the minimum rarity.

export function getOutputCount(
  flowerA: FlowerSpecies,
  flowerB: FlowerSpecies,
  recipe:  CrossBreedRecipe,
): 1 | 2 {
  const aboveA = rarityIndex(flowerA.rarity) > rarityIndex(recipe.minRarity);
  const aboveB = rarityIndex(flowerB.rarity) > rarityIndex(recipe.minRarity);
  return aboveA && aboveB ? 2 : 1;
}

// ── Essence cost ──────────────────────────────────────────────────────────────
//
// Each breed attempt costs N essence of typeA + N essence of typeB.
// Amount scales with tier — higher-tier recipes require more essence investment.

export const ESSENCE_COST_BY_TIER: Record<1 | 2 | 3 | 4, number> = {
  1: 10,
  2: 20,
  3: 50,
  4: 100,
};

export interface EssenceCost {
  typeA:  FlowerType;
  typeB:  FlowerType;
  /** Units required of each type (same for both). */
  amount: number;
}

export function getEssenceCost(recipe: CrossBreedRecipe): EssenceCost {
  return {
    typeA:  recipe.typeA,
    typeB:  recipe.typeB,
    amount: ESSENCE_COST_BY_TIER[recipe.tier],
  };
}
