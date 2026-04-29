import type { EssenceType } from "./essences";
import type { Rarity } from "./flowers";

// ── Types ──────────────────────────────────────────────────────────────────

export type ConsumableId =
  | "bloom_burst_1"    | "bloom_burst_2"    | "bloom_burst_3"    | "bloom_burst_4"    | "bloom_burst_5"
  | "heirloom_charm_1" | "heirloom_charm_2" | "heirloom_charm_3" | "heirloom_charm_4" | "heirloom_charm_5"
  | "purity_vial_1"    | "purity_vial_2"    | "purity_vial_3"    | "purity_vial_4"    | "purity_vial_5"
  | "giant_vial_1"     | "giant_vial_2"     | "giant_vial_3"     | "giant_vial_4"     | "giant_vial_5"
  | "frost_vial_1"     | "frost_vial_2"     | "frost_vial_3"     | "frost_vial_4"     | "frost_vial_5"
  | "ember_vial_1"     | "ember_vial_2"     | "ember_vial_3"     | "ember_vial_4"     | "ember_vial_5"
  | "storm_vial_1"     | "storm_vial_2"     | "storm_vial_3"     | "storm_vial_4"     | "storm_vial_5"
  | "moon_vial_1"      | "moon_vial_2"      | "moon_vial_3"      | "moon_vial_4"      | "moon_vial_5"
  | "golden_vial_1"    | "golden_vial_2"    | "golden_vial_3"    | "golden_vial_4"    | "golden_vial_5"
  | "rainbow_vial_1"   | "rainbow_vial_2"   | "rainbow_vial_3"   | "rainbow_vial_4"   | "rainbow_vial_5"
  | "eclipse_tonic_1"  | "eclipse_tonic_2"  | "eclipse_tonic_3"  | "eclipse_tonic_4"  | "eclipse_tonic_5"
  | "wind_shear"
  | "slot_lock"
  | "seed_pouch_1"     | "seed_pouch_2"     | "seed_pouch_3"     | "seed_pouch_4"     | "seed_pouch_5"
  | `seed_pouch_${"blaze"|"tide"|"grove"|"frost"|"storm"|"lunar"|"solar"|"fairy"|"shadow"|"arcane"|"stellar"|"zephyr"}_${1|2|3|4|5}`
  | "magnifying_glass_1" | "magnifying_glass_2" | "magnifying_glass_3" | "magnifying_glass_4" | "magnifying_glass_5"
  | "verdant_rush_1"     | "verdant_rush_2"     | "verdant_rush_3"     | "verdant_rush_4"     | "verdant_rush_5"
  | "forge_haste_1"      | "forge_haste_2"      | "forge_haste_3"      | "forge_haste_4"      | "forge_haste_5"
  | "resonance_draft_1"  | "resonance_draft_2"  | "resonance_draft_3"  | "resonance_draft_4"  | "resonance_draft_5";

export interface ConsumableItem {
  id:       ConsumableId;
  quantity: number;
}

export type EssenceCostEntry = { type: EssenceType; amount: number };

/** Craft cost: spend essences (tier I / non-tiered) OR upgrade 2× of the previous tier */
export type CraftCost =
  | { kind: "essence";    amounts: EssenceCostEntry[] }
  | { kind: "consumable"; id: ConsumableId; quantity: number };

/** Attunement Crystal craft cost: spend essence (tier I) OR merge 2× previous tier */
export type AttunementCost =
  | { kind: "essence";    amounts: EssenceCostEntry[] }
  | { kind: "attunement"; tier: 1 | 2 | 3 | 4; quantity: number };

export type ConsumableCategory = "growth" | "mutation_boost" | "utility" | "seed_pouch" | "speed_boost";

export interface ConsumableRecipe {
  id:           ConsumableId;
  name:         string;
  description:  string;
  emoji:        string;
  /** null for non-tiered items (Wind Shear, Slot Lock) */
  tier:         1 | 2 | 3 | 4 | 5 | null;
  rarity:       Rarity;
  category:     ConsumableCategory;
  cost:         CraftCost;
  /** Eclipse Tonic: hours of simulated garden advancement per use */
  advanceHours?: number;
  /** Speed boost consumables: duration in ms the boost stays active */
  boostDurationMs?: number;
}

export interface AttunementRecipe {
  tier:        1 | 2 | 3 | 4 | 5;
  rarity:      Rarity;
  name:        string;
  description: string;
  cost:        AttunementCost;
}

// ── Tier ↔ rarity mapping ──────────────────────────────────────────────────

export const TIER_RARITIES: Record<1 | 2 | 3 | 4 | 5, Rarity> = {
  1: "rare",
  2: "legendary",
  3: "mythic",
  4: "exalted",
  5: "prismatic",
};

export const RARITY_TIER: Partial<Record<Rarity, 1 | 2 | 3 | 4 | 5>> = {
  rare:      1,
  legendary: 2,
  mythic:    3,
  exalted:   4,
  prismatic: 5,
};

export const ROMAN = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V" } as const;

// ── Description helpers ────────────────────────────────────────────────────

const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common", uncommon: "Uncommon", rare: "Rare",
  legendary: "Legendary", mythic: "Mythic", exalted: "Exalted", prismatic: "Prismatic",
};

function r(tier: 1 | 2 | 3 | 4 | 5) { return RARITY_LABEL[TIER_RARITIES[tier]]; }

// ── Attunement Crystal recipes ─────────────────────────────────────────────

export const ATTUNEMENT_RECIPES: AttunementRecipe[] = [
  { tier: 1, rarity: "rare",      name: "Attunement I",   description: "Apply to a Rare bloomed flower to mark it as a cross-breeding participant.",      cost: { kind: "essence",    amounts: [{ type: "universal", amount: 2 }] } },
  { tier: 2, rarity: "legendary", name: "Attunement II",  description: "Apply to a Legendary bloomed flower to mark it as a cross-breeding participant.", cost: { kind: "attunement", tier: 1, quantity: 2 } },
  { tier: 3, rarity: "mythic",    name: "Attunement III", description: "Apply to a Mythic bloomed flower to mark it as a cross-breeding participant.",    cost: { kind: "attunement", tier: 2, quantity: 2 } },
  { tier: 4, rarity: "exalted",   name: "Attunement IV",  description: "Apply to an Exalted bloomed flower to mark it as a cross-breeding participant.",  cost: { kind: "attunement", tier: 3, quantity: 2 } },
  { tier: 5, rarity: "prismatic", name: "Attunement V",   description: "Apply to a Prismatic bloomed flower to mark it as a cross-breeding participant.", cost: { kind: "attunement", tier: 4, quantity: 2 } },
];

// ── Consumable recipes ─────────────────────────────────────────────────────

export const CONSUMABLE_RECIPES: ConsumableRecipe[] = [

  // ── Bloom Burst (I–V) — growth ────────────────────────────────────────────
  { id: "bloom_burst_1", name: "Bloom Burst I",   emoji: "🌱", tier: 1, rarity: "rare",      category: "growth",
    description: `Advances a ${r(1)} plant. Seeds sprout; sprouts advance halfway to bloom.`,
    cost: { kind: "essence", amounts: [{ type: "solar", amount: 4 }, { type: "zephyr", amount: 4 }] } },
  { id: "bloom_burst_2", name: "Bloom Burst II",  emoji: "🌱", tier: 2, rarity: "legendary", category: "growth",
    description: `Advances a ${r(2)} plant. Seeds sprout; sprouts advance halfway to bloom.`,
    cost: { kind: "consumable", id: "bloom_burst_1", quantity: 2 } },
  { id: "bloom_burst_3", name: "Bloom Burst III", emoji: "🌱", tier: 3, rarity: "mythic",    category: "growth",
    description: `Advances a ${r(3)} plant. Seeds sprout; sprouts advance halfway to bloom.`,
    cost: { kind: "consumable", id: "bloom_burst_2", quantity: 2 } },
  { id: "bloom_burst_4", name: "Bloom Burst IV",  emoji: "🌱", tier: 4, rarity: "exalted",   category: "growth",
    description: `Advances a ${r(4)} plant. Seeds sprout; sprouts advance halfway to bloom.`,
    cost: { kind: "consumable", id: "bloom_burst_3", quantity: 2 } },
  { id: "bloom_burst_5", name: "Bloom Burst V",   emoji: "🌱", tier: 5, rarity: "prismatic", category: "growth",
    description: `Advances a ${r(5)} plant. Seeds sprout; sprouts advance halfway to bloom.`,
    cost: { kind: "consumable", id: "bloom_burst_4", quantity: 2 } },

  // ── Heirloom Charm (I–V) — growth ────────────────────────────────────────
  { id: "heirloom_charm_1", name: "Heirloom Charm I",   emoji: "🔮", tier: 1, rarity: "rare",      category: "growth",
    description: `Harvest a ${r(1)} bloom without consuming it — the seed is returned to your inventory.`,
    cost: { kind: "essence", amounts: [{ type: "grove", amount: 4 }, { type: "stellar", amount: 4 }] } },
  { id: "heirloom_charm_2", name: "Heirloom Charm II",  emoji: "🔮", tier: 2, rarity: "legendary", category: "growth",
    description: `Harvest a ${r(2)} bloom without consuming it — the seed is returned to your inventory.`,
    cost: { kind: "consumable", id: "heirloom_charm_1", quantity: 2 } },
  { id: "heirloom_charm_3", name: "Heirloom Charm III", emoji: "🔮", tier: 3, rarity: "mythic",    category: "growth",
    description: `Harvest a ${r(3)} bloom without consuming it — the seed is returned to your inventory.`,
    cost: { kind: "consumable", id: "heirloom_charm_2", quantity: 2 } },
  { id: "heirloom_charm_4", name: "Heirloom Charm IV",  emoji: "🔮", tier: 4, rarity: "exalted",   category: "growth",
    description: `Harvest a ${r(4)} bloom without consuming it — the seed is returned to your inventory.`,
    cost: { kind: "consumable", id: "heirloom_charm_3", quantity: 2 } },
  { id: "heirloom_charm_5", name: "Heirloom Charm V",   emoji: "🔮", tier: 5, rarity: "prismatic", category: "growth",
    description: `Harvest a ${r(5)} bloom without consuming it — the seed is returned to your inventory.`,
    cost: { kind: "consumable", id: "heirloom_charm_4", quantity: 2 } },

  // ── Eclipse Tonic (I–V) — utility ────────────────────────────────────────
  { id: "eclipse_tonic_1", name: "Eclipse Tonic I",   emoji: "🌒", tier: 1, rarity: "rare",      category: "utility", advanceHours: 1,
    description: "Advances all plants in your garden by 1 hour of growth. Once per day.",
    cost: { kind: "essence", amounts: [{ type: "solar", amount: 4 }, { type: "lunar", amount: 4 }] } },
  { id: "eclipse_tonic_2", name: "Eclipse Tonic II",  emoji: "🌒", tier: 2, rarity: "legendary", category: "utility", advanceHours: 2,
    description: "Advances all plants in your garden by 2 hours of growth. Once per day.",
    cost: { kind: "consumable", id: "eclipse_tonic_1", quantity: 2 } },
  { id: "eclipse_tonic_3", name: "Eclipse Tonic III", emoji: "🌒", tier: 3, rarity: "mythic",    category: "utility", advanceHours: 4,
    description: "Advances all plants in your garden by 4 hours of growth. Once per day.",
    cost: { kind: "consumable", id: "eclipse_tonic_2", quantity: 2 } },
  { id: "eclipse_tonic_4", name: "Eclipse Tonic IV",  emoji: "🌒", tier: 4, rarity: "exalted",   category: "utility", advanceHours: 8,
    description: "Advances all plants in your garden by 8 hours of growth. Once per day.",
    cost: { kind: "consumable", id: "eclipse_tonic_3", quantity: 2 } },
  { id: "eclipse_tonic_5", name: "Eclipse Tonic V",   emoji: "🌒", tier: 5, rarity: "prismatic", category: "utility", advanceHours: 16,
    description: "Advances all plants in your garden by 16 hours of growth. Once per day.",
    cost: { kind: "consumable", id: "eclipse_tonic_4", quantity: 2 } },

  // ── Purity Vial (I–V) — mutation_boost ───────────────────────────────────
  { id: "purity_vial_1", name: "Purity Vial I",   emoji: "🫧", tier: 1, rarity: "rare",      category: "mutation_boost",
    description: `Shields a ${r(1)} plant from receiving any mutation on its next harvest.`,
    cost: { kind: "essence", amounts: [{ type: "arcane", amount: 4 }, { type: "frost", amount: 4 }] } },
  { id: "purity_vial_2", name: "Purity Vial II",  emoji: "🫧", tier: 2, rarity: "legendary", category: "mutation_boost",
    description: `Shields a ${r(2)} plant from receiving any mutation on its next harvest.`,
    cost: { kind: "consumable", id: "purity_vial_1", quantity: 2 } },
  { id: "purity_vial_3", name: "Purity Vial III", emoji: "🫧", tier: 3, rarity: "mythic",    category: "mutation_boost",
    description: `Shields a ${r(3)} plant from receiving any mutation on its next harvest.`,
    cost: { kind: "consumable", id: "purity_vial_2", quantity: 2 } },
  { id: "purity_vial_4", name: "Purity Vial IV",  emoji: "🫧", tier: 4, rarity: "exalted",   category: "mutation_boost",
    description: `Shields a ${r(4)} plant from receiving any mutation on its next harvest.`,
    cost: { kind: "consumable", id: "purity_vial_3", quantity: 2 } },
  { id: "purity_vial_5", name: "Purity Vial V",   emoji: "🫧", tier: 5, rarity: "prismatic", category: "mutation_boost",
    description: `Shields a ${r(5)} plant from receiving any mutation on its next harvest.`,
    cost: { kind: "consumable", id: "purity_vial_4", quantity: 2 } },

  // ── Giant Vial (I–V) — mutation_boost ────────────────────────────────────
  { id: "giant_vial_1", name: "Giant Vial I",   emoji: "🧬", tier: 1, rarity: "rare",      category: "mutation_boost",
    description: `Forces a ${r(1)} plant to grow Giant on its next harvest.`,
    cost: { kind: "essence", amounts: [{ type: "grove", amount: 4 }, { type: "storm", amount: 4 }] } },
  { id: "giant_vial_2", name: "Giant Vial II",  emoji: "🧬", tier: 2, rarity: "legendary", category: "mutation_boost",
    description: `Forces a ${r(2)} plant to grow Giant on its next harvest.`,
    cost: { kind: "consumable", id: "giant_vial_1", quantity: 2 } },
  { id: "giant_vial_3", name: "Giant Vial III", emoji: "🧬", tier: 3, rarity: "mythic",    category: "mutation_boost",
    description: `Forces a ${r(3)} plant to grow Giant on its next harvest.`,
    cost: { kind: "consumable", id: "giant_vial_2", quantity: 2 } },
  { id: "giant_vial_4", name: "Giant Vial IV",  emoji: "🧬", tier: 4, rarity: "exalted",   category: "mutation_boost",
    description: `Forces a ${r(4)} plant to grow Giant on its next harvest.`,
    cost: { kind: "consumable", id: "giant_vial_3", quantity: 2 } },
  { id: "giant_vial_5", name: "Giant Vial V",   emoji: "🧬", tier: 5, rarity: "prismatic", category: "mutation_boost",
    description: `Forces a ${r(5)} plant to grow Giant on its next harvest.`,
    cost: { kind: "consumable", id: "giant_vial_4", quantity: 2 } },

  // ── Frost Vial (I–V) — mutation_boost ────────────────────────────────────
  { id: "frost_vial_1", name: "Frost Vial I",   emoji: "🧊", tier: 1, rarity: "rare",      category: "mutation_boost",
    description: `Significantly increases the Frozen mutation chance for a ${r(1)} plant.`,
    cost: { kind: "essence", amounts: [{ type: "frost", amount: 6 }] } },
  { id: "frost_vial_2", name: "Frost Vial II",  emoji: "🧊", tier: 2, rarity: "legendary", category: "mutation_boost",
    description: `Significantly increases the Frozen mutation chance for a ${r(2)} plant.`,
    cost: { kind: "consumable", id: "frost_vial_1", quantity: 2 } },
  { id: "frost_vial_3", name: "Frost Vial III", emoji: "🧊", tier: 3, rarity: "mythic",    category: "mutation_boost",
    description: `Significantly increases the Frozen mutation chance for a ${r(3)} plant.`,
    cost: { kind: "consumable", id: "frost_vial_2", quantity: 2 } },
  { id: "frost_vial_4", name: "Frost Vial IV",  emoji: "🧊", tier: 4, rarity: "exalted",   category: "mutation_boost",
    description: `Significantly increases the Frozen mutation chance for a ${r(4)} plant.`,
    cost: { kind: "consumable", id: "frost_vial_3", quantity: 2 } },
  { id: "frost_vial_5", name: "Frost Vial V",   emoji: "🧊", tier: 5, rarity: "prismatic", category: "mutation_boost",
    description: `Significantly increases the Frozen mutation chance for a ${r(5)} plant.`,
    cost: { kind: "consumable", id: "frost_vial_4", quantity: 2 } },

  // ── Ember Vial (I–V) — mutation_boost ────────────────────────────────────
  { id: "ember_vial_1", name: "Ember Vial I",   emoji: "🔥", tier: 1, rarity: "rare",      category: "mutation_boost",
    description: `Significantly increases the Scorched mutation chance for a ${r(1)} plant.`,
    cost: { kind: "essence", amounts: [{ type: "blaze", amount: 6 }] } },
  { id: "ember_vial_2", name: "Ember Vial II",  emoji: "🔥", tier: 2, rarity: "legendary", category: "mutation_boost",
    description: `Significantly increases the Scorched mutation chance for a ${r(2)} plant.`,
    cost: { kind: "consumable", id: "ember_vial_1", quantity: 2 } },
  { id: "ember_vial_3", name: "Ember Vial III", emoji: "🔥", tier: 3, rarity: "mythic",    category: "mutation_boost",
    description: `Significantly increases the Scorched mutation chance for a ${r(3)} plant.`,
    cost: { kind: "consumable", id: "ember_vial_2", quantity: 2 } },
  { id: "ember_vial_4", name: "Ember Vial IV",  emoji: "🔥", tier: 4, rarity: "exalted",   category: "mutation_boost",
    description: `Significantly increases the Scorched mutation chance for a ${r(4)} plant.`,
    cost: { kind: "consumable", id: "ember_vial_3", quantity: 2 } },
  { id: "ember_vial_5", name: "Ember Vial V",   emoji: "🔥", tier: 5, rarity: "prismatic", category: "mutation_boost",
    description: `Significantly increases the Scorched mutation chance for a ${r(5)} plant.`,
    cost: { kind: "consumable", id: "ember_vial_4", quantity: 2 } },

  // ── Storm Vial (I–V) — mutation_boost ────────────────────────────────────
  { id: "storm_vial_1", name: "Storm Vial I",   emoji: "⚡", tier: 1, rarity: "rare",      category: "mutation_boost",
    description: `Significantly increases the Shocked mutation chance for a ${r(1)} plant.`,
    cost: { kind: "essence", amounts: [{ type: "storm", amount: 6 }] } },
  { id: "storm_vial_2", name: "Storm Vial II",  emoji: "⚡", tier: 2, rarity: "legendary", category: "mutation_boost",
    description: `Significantly increases the Shocked mutation chance for a ${r(2)} plant.`,
    cost: { kind: "consumable", id: "storm_vial_1", quantity: 2 } },
  { id: "storm_vial_3", name: "Storm Vial III", emoji: "⚡", tier: 3, rarity: "mythic",    category: "mutation_boost",
    description: `Significantly increases the Shocked mutation chance for a ${r(3)} plant.`,
    cost: { kind: "consumable", id: "storm_vial_2", quantity: 2 } },
  { id: "storm_vial_4", name: "Storm Vial IV",  emoji: "⚡", tier: 4, rarity: "exalted",   category: "mutation_boost",
    description: `Significantly increases the Shocked mutation chance for a ${r(4)} plant.`,
    cost: { kind: "consumable", id: "storm_vial_3", quantity: 2 } },
  { id: "storm_vial_5", name: "Storm Vial V",   emoji: "⚡", tier: 5, rarity: "prismatic", category: "mutation_boost",
    description: `Significantly increases the Shocked mutation chance for a ${r(5)} plant.`,
    cost: { kind: "consumable", id: "storm_vial_4", quantity: 2 } },

  // ── Moon Vial (I–V) — mutation_boost ─────────────────────────────────────
  { id: "moon_vial_1", name: "Moon Vial I",   emoji: "🌙", tier: 1, rarity: "rare",      category: "mutation_boost",
    description: `Significantly increases the Moonlit mutation chance for a ${r(1)} plant.`,
    cost: { kind: "essence", amounts: [{ type: "lunar", amount: 6 }] } },
  { id: "moon_vial_2", name: "Moon Vial II",  emoji: "🌙", tier: 2, rarity: "legendary", category: "mutation_boost",
    description: `Significantly increases the Moonlit mutation chance for a ${r(2)} plant.`,
    cost: { kind: "consumable", id: "moon_vial_1", quantity: 2 } },
  { id: "moon_vial_3", name: "Moon Vial III", emoji: "🌙", tier: 3, rarity: "mythic",    category: "mutation_boost",
    description: `Significantly increases the Moonlit mutation chance for a ${r(3)} plant.`,
    cost: { kind: "consumable", id: "moon_vial_2", quantity: 2 } },
  { id: "moon_vial_4", name: "Moon Vial IV",  emoji: "🌙", tier: 4, rarity: "exalted",   category: "mutation_boost",
    description: `Significantly increases the Moonlit mutation chance for a ${r(4)} plant.`,
    cost: { kind: "consumable", id: "moon_vial_3", quantity: 2 } },
  { id: "moon_vial_5", name: "Moon Vial V",   emoji: "🌙", tier: 5, rarity: "prismatic", category: "mutation_boost",
    description: `Significantly increases the Moonlit mutation chance for a ${r(5)} plant.`,
    cost: { kind: "consumable", id: "moon_vial_4", quantity: 2 } },

  // ── Golden Vial (I–V) — mutation_boost ───────────────────────────────────
  { id: "golden_vial_1", name: "Golden Vial I",   emoji: "✨", tier: 1, rarity: "rare",      category: "mutation_boost",
    description: `Significantly increases the Golden mutation chance for a ${r(1)} plant.`,
    cost: { kind: "essence", amounts: [{ type: "solar", amount: 4 }, { type: "stellar", amount: 4 }] } },
  { id: "golden_vial_2", name: "Golden Vial II",  emoji: "✨", tier: 2, rarity: "legendary", category: "mutation_boost",
    description: `Significantly increases the Golden mutation chance for a ${r(2)} plant.`,
    cost: { kind: "consumable", id: "golden_vial_1", quantity: 2 } },
  { id: "golden_vial_3", name: "Golden Vial III", emoji: "✨", tier: 3, rarity: "mythic",    category: "mutation_boost",
    description: `Significantly increases the Golden mutation chance for a ${r(3)} plant.`,
    cost: { kind: "consumable", id: "golden_vial_2", quantity: 2 } },
  { id: "golden_vial_4", name: "Golden Vial IV",  emoji: "✨", tier: 4, rarity: "exalted",   category: "mutation_boost",
    description: `Significantly increases the Golden mutation chance for a ${r(4)} plant.`,
    cost: { kind: "consumable", id: "golden_vial_3", quantity: 2 } },
  { id: "golden_vial_5", name: "Golden Vial V",   emoji: "✨", tier: 5, rarity: "prismatic", category: "mutation_boost",
    description: `Significantly increases the Golden mutation chance for a ${r(5)} plant.`,
    cost: { kind: "consumable", id: "golden_vial_4", quantity: 2 } },

  // ── Rainbow Vial (I–V) — mutation_boost ──────────────────────────────────
  { id: "rainbow_vial_1", name: "Rainbow Vial I",   emoji: "🌈", tier: 1, rarity: "rare",      category: "mutation_boost",
    description: `Significantly increases the Rainbow mutation chance for a ${r(1)} plant.`,
    cost: { kind: "essence", amounts: [{ type: "universal", amount: 1 }] } },
  { id: "rainbow_vial_2", name: "Rainbow Vial II",  emoji: "🌈", tier: 2, rarity: "legendary", category: "mutation_boost",
    description: `Significantly increases the Rainbow mutation chance for a ${r(2)} plant.`,
    cost: { kind: "consumable", id: "rainbow_vial_1", quantity: 2 } },
  { id: "rainbow_vial_3", name: "Rainbow Vial III", emoji: "🌈", tier: 3, rarity: "mythic",    category: "mutation_boost",
    description: `Significantly increases the Rainbow mutation chance for a ${r(3)} plant.`,
    cost: { kind: "consumable", id: "rainbow_vial_2", quantity: 2 } },
  { id: "rainbow_vial_4", name: "Rainbow Vial IV",  emoji: "🌈", tier: 4, rarity: "exalted",   category: "mutation_boost",
    description: `Significantly increases the Rainbow mutation chance for a ${r(4)} plant.`,
    cost: { kind: "consumable", id: "rainbow_vial_3", quantity: 2 } },
  { id: "rainbow_vial_5", name: "Rainbow Vial V",   emoji: "🌈", tier: 5, rarity: "prismatic", category: "mutation_boost",
    description: `Significantly increases the Rainbow mutation chance for a ${r(5)} plant.`,
    cost: { kind: "consumable", id: "rainbow_vial_4", quantity: 2 } },

  // ── Magnifying Glass (I–V) — utility ─────────────────────────────────────
  // One-time use: reveals hidden plot information (plant species, mutation, growth %).
  { id: "magnifying_glass_1", name: "Magnifying Glass I",   emoji: "🔍", tier: 1, rarity: "rare",      category: "utility",
    description: `Reveals all details of a ${r(1)} plot — species, mutation, and exact growth progress.`,
    cost: { kind: "essence", amounts: [{ type: "arcane", amount: 4 }, { type: "stellar", amount: 4 }] } },
  { id: "magnifying_glass_2", name: "Magnifying Glass II",  emoji: "🔍", tier: 2, rarity: "legendary", category: "utility",
    description: `Reveals all details of a ${r(2)} plot — species, mutation, and exact growth progress.`,
    cost: { kind: "consumable", id: "magnifying_glass_1", quantity: 2 } },
  { id: "magnifying_glass_3", name: "Magnifying Glass III", emoji: "🔍", tier: 3, rarity: "mythic",    category: "utility",
    description: `Reveals all details of a ${r(3)} plot — species, mutation, and exact growth progress.`,
    cost: { kind: "consumable", id: "magnifying_glass_2", quantity: 2 } },
  { id: "magnifying_glass_4", name: "Magnifying Glass IV",  emoji: "🔍", tier: 4, rarity: "exalted",   category: "utility",
    description: `Reveals all details of a ${r(4)} plot — species, mutation, and exact growth progress.`,
    cost: { kind: "consumable", id: "magnifying_glass_3", quantity: 2 } },
  { id: "magnifying_glass_5", name: "Magnifying Glass V",   emoji: "🔍", tier: 5, rarity: "prismatic", category: "utility",
    description: `Reveals all details of a ${r(5)} plot — species, mutation, and exact growth progress.`,
    cost: { kind: "consumable", id: "magnifying_glass_4", quantity: 2 } },

  // ── Verdant Rush (I–V) — speed_boost ─────────────────────────────────────
  // Doubles growth speed for all garden plots for a limited time.
  { id: "verdant_rush_1", name: "Verdant Rush I",   emoji: "🌿", tier: 1, rarity: "rare",      category: "speed_boost", boostDurationMs: 30 * 60 * 1_000,
    description: "Doubles growth speed for all plants in your garden for 30 minutes.",
    cost: { kind: "essence", amounts: [{ type: "grove", amount: 4 }, { type: "zephyr", amount: 4 }] } },
  { id: "verdant_rush_2", name: "Verdant Rush II",  emoji: "🌿", tier: 2, rarity: "legendary", category: "speed_boost", boostDurationMs:  1 * 60 * 60 * 1_000,
    description: "Doubles growth speed for all plants in your garden for 1 hour.",
    cost: { kind: "consumable", id: "verdant_rush_1", quantity: 2 } },
  { id: "verdant_rush_3", name: "Verdant Rush III", emoji: "🌿", tier: 3, rarity: "mythic",    category: "speed_boost", boostDurationMs:  3 * 60 * 60 * 1_000,
    description: "Doubles growth speed for all plants in your garden for 3 hours.",
    cost: { kind: "consumable", id: "verdant_rush_2", quantity: 2 } },
  { id: "verdant_rush_4", name: "Verdant Rush IV",  emoji: "🌿", tier: 4, rarity: "exalted",   category: "speed_boost", boostDurationMs:  8 * 60 * 60 * 1_000,
    description: "Doubles growth speed for all plants in your garden for 8 hours.",
    cost: { kind: "consumable", id: "verdant_rush_3", quantity: 2 } },
  { id: "verdant_rush_5", name: "Verdant Rush V",   emoji: "🌿", tier: 5, rarity: "prismatic", category: "speed_boost", boostDurationMs: 24 * 60 * 60 * 1_000,
    description: "Doubles growth speed for all plants in your garden for 24 hours.",
    cost: { kind: "consumable", id: "verdant_rush_4", quantity: 2 } },

  // ── Forge Haste (I–V) — speed_boost ──────────────────────────────────────
  // Doubles crafting speed for all queued crafts for a limited time.
  { id: "forge_haste_1", name: "Forge Haste I",   emoji: "⚒️", tier: 1, rarity: "rare",      category: "speed_boost", boostDurationMs: 30 * 60 * 1_000,
    description: "Doubles crafting speed for all queued crafts for 30 minutes.",
    cost: { kind: "essence", amounts: [{ type: "blaze", amount: 4 }, { type: "storm", amount: 4 }] } },
  { id: "forge_haste_2", name: "Forge Haste II",  emoji: "⚒️", tier: 2, rarity: "legendary", category: "speed_boost", boostDurationMs:  1 * 60 * 60 * 1_000,
    description: "Doubles crafting speed for all queued crafts for 1 hour.",
    cost: { kind: "consumable", id: "forge_haste_1", quantity: 2 } },
  { id: "forge_haste_3", name: "Forge Haste III", emoji: "⚒️", tier: 3, rarity: "mythic",    category: "speed_boost", boostDurationMs:  3 * 60 * 60 * 1_000,
    description: "Doubles crafting speed for all queued crafts for 3 hours.",
    cost: { kind: "consumable", id: "forge_haste_2", quantity: 2 } },
  { id: "forge_haste_4", name: "Forge Haste IV",  emoji: "⚒️", tier: 4, rarity: "exalted",   category: "speed_boost", boostDurationMs:  8 * 60 * 60 * 1_000,
    description: "Doubles crafting speed for all queued crafts for 8 hours.",
    cost: { kind: "consumable", id: "forge_haste_3", quantity: 2 } },
  { id: "forge_haste_5", name: "Forge Haste V",   emoji: "⚒️", tier: 5, rarity: "prismatic", category: "speed_boost", boostDurationMs: 24 * 60 * 60 * 1_000,
    description: "Doubles crafting speed for all queued crafts for 24 hours.",
    cost: { kind: "consumable", id: "forge_haste_4", quantity: 2 } },

  // ── Resonance Draft (I–V) — speed_boost ──────────────────────────────────
  // Doubles attunement speed for all active attunement slots for a limited time.
  { id: "resonance_draft_1", name: "Resonance Draft I",   emoji: "🌀", tier: 1, rarity: "rare",      category: "speed_boost", boostDurationMs: 30 * 60 * 1_000,
    description: "Doubles attunement speed for all active attunement slots for 30 minutes.",
    cost: { kind: "essence", amounts: [{ type: "stellar", amount: 4 }, { type: "arcane", amount: 4 }] } },
  { id: "resonance_draft_2", name: "Resonance Draft II",  emoji: "🌀", tier: 2, rarity: "legendary", category: "speed_boost", boostDurationMs:  1 * 60 * 60 * 1_000,
    description: "Doubles attunement speed for all active attunement slots for 1 hour.",
    cost: { kind: "consumable", id: "resonance_draft_1", quantity: 2 } },
  { id: "resonance_draft_3", name: "Resonance Draft III", emoji: "🌀", tier: 3, rarity: "mythic",    category: "speed_boost", boostDurationMs:  3 * 60 * 60 * 1_000,
    description: "Doubles attunement speed for all active attunement slots for 3 hours.",
    cost: { kind: "consumable", id: "resonance_draft_2", quantity: 2 } },
  { id: "resonance_draft_4", name: "Resonance Draft IV",  emoji: "🌀", tier: 4, rarity: "exalted",   category: "speed_boost", boostDurationMs:  8 * 60 * 60 * 1_000,
    description: "Doubles attunement speed for all active attunement slots for 8 hours.",
    cost: { kind: "consumable", id: "resonance_draft_3", quantity: 2 } },
  { id: "resonance_draft_5", name: "Resonance Draft V",   emoji: "🌀", tier: 5, rarity: "prismatic", category: "speed_boost", boostDurationMs: 24 * 60 * 60 * 1_000,
    description: "Doubles attunement speed for all active attunement slots for 24 hours.",
    cost: { kind: "consumable", id: "resonance_draft_4", quantity: 2 } },

  // ── Wind Shear (non-tiered) — utility ─────────────────────────────────────
  { id: "wind_shear", name: "Wind Shear", emoji: "🌀", tier: null, rarity: "rare", category: "utility",
    description: "Refreshes your supply shop immediately, bypassing the cooldown. 1-hour cooldown between uses.",
    cost: { kind: "essence", amounts: [{ type: "zephyr", amount: 6 }, { type: "storm", amount: 6 }] } },

  // ── Slot Lock (non-tiered) — utility ──────────────────────────────────────
  { id: "slot_lock", name: "Slot Lock", emoji: "📌", tier: null, rarity: "rare", category: "utility",
    description: "Locks a supply shop slot so it survives the next refresh without rerolling.",
    cost: { kind: "essence", amounts: [{ type: "arcane", amount: 4 }, { type: "stellar", amount: 4 }] } },

  // ── Seed Pouch (I–V) — seed_pouch ────────────────────────────────────────
  { id: "seed_pouch_1", name: "Seed Pouch I",   emoji: "🎁", tier: 1, rarity: "rare",      category: "seed_pouch",
    description: `Open from your inventory for a random ${r(1)}+ seed.`,
    cost: { kind: "essence", amounts: [{ type: "universal", amount: 1 }] } },
  { id: "seed_pouch_2", name: "Seed Pouch II",  emoji: "🎁", tier: 2, rarity: "legendary", category: "seed_pouch",
    description: `Open from your inventory for a random ${r(2)}+ seed.`,
    cost: { kind: "consumable", id: "seed_pouch_1", quantity: 2 } },
  { id: "seed_pouch_3", name: "Seed Pouch III", emoji: "🎁", tier: 3, rarity: "mythic",    category: "seed_pouch",
    description: `Open from your inventory for a random ${r(3)}+ seed.`,
    cost: { kind: "consumable", id: "seed_pouch_2", quantity: 2 } },
  { id: "seed_pouch_4", name: "Seed Pouch IV",  emoji: "🎁", tier: 4, rarity: "exalted",   category: "seed_pouch",
    description: `Open from your inventory for a random ${r(4)}+ seed.`,
    cost: { kind: "consumable", id: "seed_pouch_3", quantity: 2 } },
  { id: "seed_pouch_5", name: "Seed Pouch V",   emoji: "🎁", tier: 5, rarity: "prismatic", category: "seed_pouch",
    description: `Open from your inventory for a random ${r(5)} seed.`,
    cost: { kind: "consumable", id: "seed_pouch_4", quantity: 2 } },
];

// ── Typed Seed Pouches (per-type I–V) ─────────────────────────────────────
// 12 element types × 5 tiers = 60 additional recipes, generated programmatically.

const TYPED_POUCH_TYPES = [
  "blaze", "tide", "grove", "frost", "storm", "lunar",
  "solar", "fairy", "shadow", "arcane", "stellar", "zephyr",
] as const;

const TYPE_LABELS: Record<string, string> = {
  blaze: "Blaze", tide: "Tide", grove: "Grove", frost: "Frost",
  storm: "Storm", lunar: "Lunar", solar: "Solar", fairy: "Fairy",
  shadow: "Shadow", arcane: "Arcane", stellar: "Stellar", zephyr: "Zephyr",
};

for (const t of TYPED_POUCH_TYPES) {
  const label = TYPE_LABELS[t];
  for (let _tier = 1; _tier <= 5; _tier++) {
    const tier = _tier as 1 | 2 | 3 | 4 | 5;
    const id = `seed_pouch_${t}_${tier}` as ConsumableId;
    const prevId = tier > 1 ? (`seed_pouch_${t}_${tier - 1}` as ConsumableId) : null;
    CONSUMABLE_RECIPES.push({
      id,
      name: `${label} Seed Pouch ${ROMAN[tier]}`,
      emoji: "🎁",
      tier,
      rarity: TIER_RARITIES[tier],
      category: "seed_pouch",
      description: `Open for a random ${r(tier)}+ ${label} seed.`,
      cost: tier === 1
        ? { kind: "essence", amounts: [{ type: t as EssenceType, amount: 6 }] }
        : { kind: "consumable", id: prevId!, quantity: 2 },
    });
  }
}

/** Lookup map: consumable ID → recipe */
export const CONSUMABLE_RECIPE_MAP = Object.fromEntries(
  CONSUMABLE_RECIPES.map((r) => [r.id, r])
) as Record<ConsumableId, ConsumableRecipe>;


// ── Affordability helpers ──────────────────────────────────────────────────

export function canCraftConsumable(
  recipe:      ConsumableRecipe,
  essences:    { type: string; amount: number }[],
  consumables: ConsumableItem[],
): boolean {
  const { cost } = recipe;
  if (cost.kind === "essence") {
    return cost.amounts.every(({ type, amount }) =>
      (essences.find((e) => e.type === type)?.amount ?? 0) >= amount
    );
  }
  return (consumables.find((c) => c.id === cost.id)?.quantity ?? 0) >= cost.quantity;
}

export function canCraftAttunement(
  recipe:       AttunementRecipe,
  essences:     { type: string; amount: number }[],
  attunements:  { rarity: string; quantity: number }[],
): boolean {
  const { cost } = recipe;
  if (cost.kind === "essence") {
    return cost.amounts.every(({ type, amount }) =>
      (essences.find((e) => e.type === type)?.amount ?? 0) >= amount
    );
  }
  const prevRarity = TIER_RARITIES[cost.tier];
  return (attunements.find((i) => i.rarity === prevRarity)?.quantity ?? 0) >= cost.quantity;
}

// ── Optimistic craft helpers ───────────────────────────────────────────────

/** Deduct costs + award 1 consumable. Returns null if can't afford. */
export function applyCraftConsumable(
  recipe:      ConsumableRecipe,
  essences:    { type: string; amount: number }[],
  consumables: ConsumableItem[],
): { essences: { type: string; amount: number }[]; consumables: ConsumableItem[] } | null {
  if (!canCraftConsumable(recipe, essences, consumables)) return null;

  let newEssences    = [...essences];
  let newConsumables = [...consumables];

  if (recipe.cost.kind === "essence") {
    for (const { type, amount } of recipe.cost.amounts) {
      newEssences = newEssences
        .map((e) => e.type === type ? { ...e, amount: e.amount - amount } : e)
        .filter((e) => e.amount > 0);
    }
  } else {
    const { id, quantity } = recipe.cost;
    newConsumables = newConsumables
      .map((c) => c.id === id ? { ...c, quantity: c.quantity - quantity } : c)
      .filter((c) => c.quantity > 0);
  }

  const existingIdx = newConsumables.findIndex((c) => c.id === recipe.id);
  newConsumables = existingIdx >= 0
    ? newConsumables.map((c, i) => i === existingIdx ? { ...c, quantity: c.quantity + 1 } : c)
    : [...newConsumables, { id: recipe.id, quantity: 1 }];

  return { essences: newEssences, consumables: newConsumables };
}

/** Deduct costs + award 1 attunement crystal of recipe.rarity. Returns null if can't afford. */
export function applyCraftAttunement(
  recipe:      AttunementRecipe,
  essences:    { type: string; amount: number }[],
  attunements: { rarity: string; quantity: number }[],
): { essences: { type: string; amount: number }[]; attunements: { rarity: string; quantity: number }[] } | null {
  if (!canCraftAttunement(recipe, essences, attunements)) return null;

  let newEssences    = [...essences];
  let newAttunements = [...attunements];

  if (recipe.cost.kind === "essence") {
    for (const { type, amount } of recipe.cost.amounts) {
      newEssences = newEssences
        .map((e) => e.type === type ? { ...e, amount: e.amount - amount } : e)
        .filter((e) => e.amount > 0);
    }
  } else {
    const prevRarity = TIER_RARITIES[recipe.cost.tier];
    newAttunements = newAttunements
      .map((i) => i.rarity === prevRarity ? { ...i, quantity: i.quantity - recipe.cost.quantity } : i)
      .filter((i) => i.quantity > 0);
  }

  const existingIdx = newAttunements.findIndex((i) => i.rarity === recipe.rarity);
  newAttunements = existingIdx >= 0
    ? newAttunements.map((i, idx) => idx === existingIdx ? { ...i, quantity: i.quantity + 1 } : i)
    : [...newAttunements, { rarity: recipe.rarity, quantity: 1 }];

  return { essences: newEssences, attunements: newAttunements };
}
