import type { Rarity, MutationType } from "./flowers";
import type { FertilizerType } from "./upgrades";

// ── Gear type identifiers ──────────────────────────────────────────────────

export type SprinklerGearType =
  | "sprinkler_rare"
  | "sprinkler_legendary"
  | "sprinkler_mythic"
  | "sprinkler_exalted"
  | "sprinkler_prismatic"
  | "sprinkler_flame"
  | "sprinkler_frost"
  | "sprinkler_lightning"
  | "sprinkler_lunar"
  | "sprinkler_midas"
  | "sprinkler_prism";

export type PassiveGearType =
  | "grow_lamp_uncommon"
  | "grow_lamp_rare"
  | "scarecrow_rare"
  | "scarecrow_legendary"
  | "scarecrow_mythic"
  | "composter_uncommon"
  | "composter_rare"
  | "composter_legendary"
  | "fan_uncommon"
  | "fan_rare"
  | "fan_legendary"
  | "harvest_bell_uncommon"
  | "harvest_bell_rare"
  | "harvest_bell_legendary"
  | "aegis_uncommon"
  | "aegis_rare"
  | "aegis_legendary"
  | "garden_pin"
  | "auto_planter_prismatic"
  | "cropsticks";

export type GearType = SprinklerGearType | PassiveGearType;

export type GearCategory  = "sprinkler_regular" | "sprinkler_mutation" | "passive";
export type PassiveSubtype = "grow_lamp" | "scarecrow" | "composter" | "fan" | "harvest_bell" | "auto_planter" | "cropsticks" | "aegis" | "garden_pin";

/** Which way a Fan or Aegis is pointing — set at placement time */
export type FanDirection = "up" | "down" | "left" | "right";

// ── Placed gear (what lives in a grid cell) ────────────────────────────────

export interface PlacedGear {
  gearType: GearType;
  placedAt: number; // wall-clock timestamp
  /** Fertilizers waiting to be collected — composter only, max 10 */
  storedFertilizers?: FertilizerType[];
  /** Which direction the fan / aegis is blowing — fan and aegis gear only */
  direction?: FanDirection;
}

// ── Player's gear supply inventory ────────────────────────────────────────

export interface GearInventoryItem {
  gearType: GearType;
  quantity: number;
}

// ── Catalog entry ──────────────────────────────────────────────────────────

export interface GearDefinition {
  id:          GearType;
  name:        string;
  description: string;
  emoji:       string;
  rarity:      Rarity;
  shopPrice:   number;
  category:    GearCategory;

  // ── Sprinkler fields ─────────────────────────────────────────────────────
  /** Duration in milliseconds; undefined = never expires (passive gear) */
  durationMs?:     number;
  /** [rowOffset, colOffset] pairs from the sprinkler's cell */
  radiusOffsets?:  [number, number][];
  /** Regular sprinkler: growth speed multiplier applied to affected plants */
  growthMultiplier?: number;
  /** Regular sprinkler: per-tick chance of applying "wet" mutation (accumulates to 35% over full duration) */
  wetChancePerTick?: number;
  /** Mutation sprinkler: which mutation it can apply */
  mutationType?:     MutationType;
  /** Mutation sprinkler: per-tick chance (accumulates to 50% over 2-hr duration) */
  mutationChancePerTick?: number;

  // ── Passive fields ────────────────────────────────────────────────────────
  passiveSubtype?: PassiveSubtype;
  /** Grow lamp: growth multiplier applied during night periods (dusk/night/midnight) */
  nightMultiplier?: number;
  /** Composter: max fertilizers that can be stored before collection is needed */
  maxStorage?: number;
  /** Fan / Aegis: how many cells it reaches in the chosen direction */
  fanRange?: number;
  /** Fan: per-tick probability to strip mutation (or apply windstruck if none) */
  fanStripChancePerTick?: number;
  /** Scarecrow: per-tick probability to strip an existing mutation from a covered plant */
  mutationStripChancePerTick?: number;
}

// ── Radius pattern helpers ─────────────────────────────────────────────────

/** 3×3 square — all 8 neighbours (used by Legendary sprinkler, mutation sprinklers, passive gear) */
const OFFSETS_3X3: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],          [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
];

/** Cross — up / down / left / right only (Rare sprinkler) */
const OFFSETS_CROSS: [number, number][] = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
];

/**
 * Diamond — 5×5 shape (Mythic sprinkler)
 * [0,0,1,0,0]
 * [0,1,1,1,0]
 * [1,1,S,1,1]
 * [0,1,1,1,0]
 * [0,0,1,0,0]
 */
const OFFSETS_DIAMOND: [number, number][] = [
  [-2, 0],
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -2], [ 0, -1], [ 0, 1], [ 0, 2],
  [ 1, -1], [ 1, 0], [ 1, 1],
  [ 2, 0],
];

/** Full 5×5 square — all 24 surrounding cells (Exalted sprinkler) */
const OFFSETS_5X5: [number, number][] = [
  [-2,-2],[-2,-1],[-2, 0],[-2, 1],[-2, 2],
  [-1,-2],[-1,-1],[-1, 0],[-1, 1],[-1, 2],
  [ 0,-2],[ 0,-1],         [ 0, 1],[ 0, 2],
  [ 1,-2],[ 1,-1],[ 1, 0],[ 1, 1],[ 1, 2],
  [ 2,-2],[ 2,-1],[ 2, 0],[ 2, 1],[ 2, 2],
];

/** 5×5 square + four star-tip cells — 28 cells total (Prismatic sprinkler) */
const OFFSETS_GRAND_STAR: [number, number][] = [
  ...OFFSETS_5X5,
  [-3, 0], [0, -3], [0, 3], [3, 0],
];


// ── Per-tick chance helpers ────────────────────────────────────────────────

/** p = 1 − (1 − targetTotal)^(1/ticks). Gives the per-tick rate that
 *  accumulates to `targetTotal` probability over the full duration. */
function perTickChance(targetTotal: number, durationMs: number): number {
  const ticks = durationMs / 1_000; // 1-second ticks
  return 1 - Math.pow(1 - targetTotal, 1 / ticks);
}

const WET_CHANCE_PER_HOUR = 0.35; // 35% chance per hour (compounds across duration)
/** Cumulative wet chance over `hours` hours at 35%/hr */
function wetOverHours(hours: number): number {
  return 1 - Math.pow(1 - WET_CHANCE_PER_HOUR, hours);
}
const MUT_CHANCE_TARGET  = 0.50; // 50% over full duration

const DURATION_1H  =  1 * 60 * 60 * 1_000;
const DURATION_2H  =  2 * 60 * 60 * 1_000;
const DURATION_4H  =  4 * 60 * 60 * 1_000;
const DURATION_8H  =  8 * 60 * 60 * 1_000;
const DURATION_12H = 12 * 60 * 60 * 1_000;

// ── Gear catalog ───────────────────────────────────────────────────────────

export const GEAR: Record<GearType, GearDefinition> = {

  // ── Regular sprinklers ───────────────────────────────────────────────────

  sprinkler_rare: {
    id:               "sprinkler_rare",
    name:             "Sprinkler I",
    description:      "Speeds up adjacent plants by 1.5×. May get them wet. Lasts 1 hour.",
    emoji:            "🚿",
    rarity:           "rare",
    shopPrice:        400,
    category:         "sprinkler_regular",
    durationMs:       DURATION_1H,
    radiusOffsets:    OFFSETS_CROSS,
    growthMultiplier: 1.5,
    wetChancePerTick: perTickChance(wetOverHours(1), DURATION_1H),
  },

  sprinkler_legendary: {
    id:               "sprinkler_legendary",
    name:             "Sprinkler II",
    description:      "Speeds up surrounding plants by 1.75×. May get them wet. Lasts 2 hours.",
    emoji:            "🚿",
    rarity:           "legendary",
    shopPrice:        5_500,
    category:         "sprinkler_regular",
    durationMs:       DURATION_2H,
    radiusOffsets:    OFFSETS_3X3,
    growthMultiplier: 1.75,
    wetChancePerTick: perTickChance(wetOverHours(2), DURATION_2H),
  },

  sprinkler_mythic: {
    id:               "sprinkler_mythic",
    name:             "Sprinkler III",
    description:      "Speeds up all nearby plants by 2×. May get them wet. Lasts 4 hours.",
    emoji:            "🚿",
    rarity:           "mythic",
    shopPrice:        60_000,
    category:         "sprinkler_regular",
    durationMs:       DURATION_4H,
    radiusOffsets:    OFFSETS_DIAMOND,
    growthMultiplier: 2.0,
    wetChancePerTick: perTickChance(wetOverHours(4), DURATION_4H),
  },

  sprinkler_exalted: {
    id:               "sprinkler_exalted",
    name:             "Sprinkler IV",
    description:      "Speeds up plants in a wide area by 2.5×. May get them wet. Lasts 8 hours.",
    emoji:            "🚿",
    rarity:           "exalted",
    shopPrice:        350_000,
    category:         "sprinkler_regular",
    durationMs:       DURATION_8H,
    radiusOffsets:    OFFSETS_5X5,
    growthMultiplier: 2.5,
    wetChancePerTick: perTickChance(wetOverHours(8), DURATION_8H),
  },

  sprinkler_prismatic: {
    id:               "sprinkler_prismatic",
    name:             "Sprinkler V",
    description:      "Speeds up plants in a massive star-shaped area by 3×. May get them wet. Lasts 12 hours.",
    emoji:            "🚿",
    rarity:           "prismatic",
    shopPrice:        2_000_000,
    category:         "sprinkler_regular",
    durationMs:       DURATION_12H,
    radiusOffsets:    OFFSETS_GRAND_STAR,
    growthMultiplier: 3.0,
    wetChancePerTick: perTickChance(wetOverHours(12), DURATION_12H),
  },

  // ── Mutation sprinklers ──────────────────────────────────────────────────

  sprinkler_flame: {
    id:                    "sprinkler_flame",
    name:                  "Heater",
    description:           "50% chance per hour to apply Scorched to nearby blooms. Lasts 2 hours.",
    emoji:                 "♨️",
    rarity:                "legendary",
    shopPrice:             6_000,
    category:              "sprinkler_mutation",
    durationMs:            DURATION_2H,
    radiusOffsets:         OFFSETS_3X3,
    mutationType:          "scorched",
    mutationChancePerTick: perTickChance(MUT_CHANCE_TARGET, DURATION_1H),
  },

  sprinkler_frost: {
    id:                    "sprinkler_frost",
    name:                  "Cooler",
    description:           "50% chance per hour to apply Frozen to nearby blooms. Lasts 2 hours.",
    emoji:                 "🧊",
    rarity:                "legendary",
    shopPrice:             6_000,
    category:              "sprinkler_mutation",
    durationMs:            DURATION_2H,
    radiusOffsets:         OFFSETS_3X3,
    mutationType:          "frozen",
    mutationChancePerTick: perTickChance(MUT_CHANCE_TARGET, DURATION_1H),
  },

  sprinkler_lightning: {
    id:                    "sprinkler_lightning",
    name:                  "Generator",
    description:           "50% chance per hour to apply Shocked to nearby wet blooms. Pair with a Sprinkler to wet them first. Lasts 2 hours.",
    emoji:                 "🔋",
    rarity:                "mythic",
    shopPrice:             50_000,
    category:              "sprinkler_mutation",
    durationMs:            DURATION_2H,
    radiusOffsets:         OFFSETS_3X3,
    mutationType:          "shocked",
    mutationChancePerTick: perTickChance(MUT_CHANCE_TARGET, DURATION_1H),
  },

  sprinkler_lunar: {
    id:                    "sprinkler_lunar",
    name:                  "Crystal Ball",
    description:           "50% chance per hour to apply Moonlit to nearby blooms. Lasts 2 hours.",
    emoji:                 "🔮",
    rarity:                "mythic",
    shopPrice:             50_000,
    category:              "sprinkler_mutation",
    durationMs:            DURATION_2H,
    radiusOffsets:         OFFSETS_3X3,
    mutationType:          "moonlit",
    mutationChancePerTick: perTickChance(MUT_CHANCE_TARGET, DURATION_1H),
  },

  sprinkler_midas: {
    id:                    "sprinkler_midas",
    name:                  "Gold Vial",
    description:           "50% chance per hour to apply Gilded to nearby blooms. Lasts 2 hours.",
    emoji:                 "💰",
    rarity:                "exalted",
    shopPrice:             200_000,
    category:              "sprinkler_mutation",
    durationMs:            DURATION_2H,
    radiusOffsets:         OFFSETS_3X3,
    mutationType:          "golden",
    mutationChancePerTick: perTickChance(MUT_CHANCE_TARGET, DURATION_1H),
  },

  sprinkler_prism: {
    id:                    "sprinkler_prism",
    name:                  "Kaleidoscope",
    description:           "50% chance per hour to apply Rainbow to nearby blooms. Lasts 2 hours.",
    emoji:                 "🔭",
    rarity:                "prismatic",
    shopPrice:             800_000,
    category:              "sprinkler_mutation",
    durationMs:            DURATION_2H,
    radiusOffsets:         OFFSETS_3X3,
    mutationType:          "rainbow",
    mutationChancePerTick: perTickChance(MUT_CHANCE_TARGET, DURATION_1H),
  },

  // ── Passive gear ─────────────────────────────────────────────────────────

  grow_lamp_uncommon: {
    id:              "grow_lamp_uncommon",
    name:            "Grow Lamp I",
    description:     "Adds a 1.2× night boost that stacks with sprinklers. Lasts 4 hours.",
    emoji:           "💡",
    rarity:          "uncommon",
    shopPrice:       100,
    category:        "passive",
    passiveSubtype:  "grow_lamp",
    radiusOffsets:   OFFSETS_3X3,
    durationMs:      4 * 60 * 60 * 1_000,
    nightMultiplier: 1.2,
  },

  grow_lamp_rare: {
    id:              "grow_lamp_rare",
    name:            "Grow Lamp II",
    description:     "Adds a 1.5× night boost that stacks with sprinklers. Lasts 8 hours.",
    emoji:           "💡",
    rarity:          "rare",
    shopPrice:       600,
    category:        "passive",
    passiveSubtype:  "grow_lamp",
    radiusOffsets:   OFFSETS_3X3,
    durationMs:      8 * 60 * 60 * 1_000,
    nightMultiplier: 1.5,
  },

  scarecrow_rare: {
    id:             "scarecrow_rare",
    name:           "Scarecrow I",
    description:    "Blocks weather mutations on nearby plants. Has a 15% chance per hour to strip an existing mutation. Lasts 4 hours.",
    emoji:          "🧹",
    rarity:         "rare",
    shopPrice:      700,
    category:       "passive",
    passiveSubtype: "scarecrow",
    radiusOffsets:  OFFSETS_3X3,
    durationMs:     4 * 60 * 60 * 1_000,
    mutationStripChancePerTick: perTickChance(0.15, DURATION_1H),
  },

  scarecrow_legendary: {
    id:             "scarecrow_legendary",
    name:           "Scarecrow II",
    description:    "Blocks weather mutations on nearby plants. Has a 25% chance per hour to strip an existing mutation. Lasts 8 hours.",
    emoji:          "🧹",
    rarity:         "legendary",
    shopPrice:      7_500,
    category:       "passive",
    passiveSubtype: "scarecrow",
    radiusOffsets:  OFFSETS_3X3,
    durationMs:     8 * 60 * 60 * 1_000,
    mutationStripChancePerTick: perTickChance(0.25, DURATION_1H),
  },

  scarecrow_mythic: {
    id:             "scarecrow_mythic",
    name:           "Scarecrow III",
    description:    "Blocks weather mutations on nearby plants in a wide area. Has a 40% chance per hour to strip an existing mutation. Lasts 12 hours.",
    emoji:          "🧹",
    rarity:         "mythic",
    shopPrice:      50_000,
    category:       "passive",
    passiveSubtype: "scarecrow",
    radiusOffsets:  OFFSETS_DIAMOND,
    durationMs:     DURATION_12H,
    mutationStripChancePerTick: perTickChance(0.40, DURATION_1H),
  },

  composter_uncommon: {
    id:             "composter_uncommon",
    name:           "Composter I",
    description:    "Generates a fertilizer each time a nearby plant blooms. Stores up to 10. Lasts 4 hours.",
    emoji:          "🧺",
    rarity:         "uncommon",
    shopPrice:      150,
    category:       "passive",
    passiveSubtype: "composter",
    radiusOffsets:  OFFSETS_3X3,
    durationMs:     4 * 60 * 60 * 1_000,
    maxStorage:     10,
  },

  composter_rare: {
    id:             "composter_rare",
    name:           "Composter II",
    description:    "Generates a fertilizer each time a nearby plant blooms. Stores up to 20. Lasts 8 hours.",
    emoji:          "🧺",
    rarity:         "rare",
    shopPrice:      800,
    category:       "passive",
    passiveSubtype: "composter",
    radiusOffsets:  OFFSETS_3X3,
    durationMs:     DURATION_8H,
    maxStorage:     20,
  },

  composter_legendary: {
    id:             "composter_legendary",
    name:           "Composter III",
    description:    "Generates a fertilizer each time a nearby plant blooms. Stores up to 30. Lasts 12 hours.",
    emoji:          "🧺",
    rarity:         "legendary",
    shopPrice:      5_000,
    category:       "passive",
    passiveSubtype: "composter",
    radiusOffsets:  OFFSETS_3X3,
    durationMs:     DURATION_12H,
    maxStorage:     30,
  },

  // ── Fan ──────────────────────────────────────────────────────────────────
  // Blows in a player-chosen direction. Each tick: strips mutation from
  // a bloomed plant in range, OR applies Windstruck if the plant has none.

  fan_uncommon: {
    id:                    "fan_uncommon",
    name:                  "Fan I",
    description:           "Blows in one direction across 2 plants. Strips mutations from blooms — or applies Windstruck if there's none. Lasts 2 hours.",
    emoji:                 "💨",
    rarity:                "uncommon",
    shopPrice:             250,
    category:              "passive",
    passiveSubtype:        "fan",
    durationMs:            DURATION_2H,
    fanRange:              2,
    fanStripChancePerTick: perTickChance(0.50, DURATION_2H),
  },

  fan_rare: {
    id:                    "fan_rare",
    name:                  "Fan II",
    description:           "Blows in one direction across 3 plants. Strips mutations from blooms — or applies Windstruck if there's none. Lasts 4 hours.",
    emoji:                 "💨",
    rarity:                "rare",
    shopPrice:             1_200,
    category:              "passive",
    passiveSubtype:        "fan",
    durationMs:            DURATION_4H,
    fanRange:              3,
    fanStripChancePerTick: perTickChance(0.70, DURATION_4H),
  },

  fan_legendary: {
    id:                    "fan_legendary",
    name:                  "Fan III",
    description:           "Blows in one direction across 4 plants. Strips mutations from blooms — or applies Windstruck if there's none. Lasts 8 hours.",
    emoji:                 "💨",
    rarity:                "legendary",
    shopPrice:             8_000,
    category:              "passive",
    passiveSubtype:        "fan",
    durationMs:            DURATION_8H,
    fanRange:              4,
    fanStripChancePerTick: perTickChance(0.80, DURATION_8H),
  },

  // ── Harvest Bell ─────────────────────────────────────────────────────────
  // Automatically harvests bloomed plants in range, even while offline.

  harvest_bell_uncommon: {
    id:             "harvest_bell_uncommon",
    name:           "Harvest Bell I",
    description:    "Automatically harvests bloomed plants on adjacent cells, even while offline. Lasts 2 hours.",
    emoji:          "🔔",
    rarity:         "uncommon",
    shopPrice:      400,
    category:       "passive",
    passiveSubtype: "harvest_bell",
    radiusOffsets:  OFFSETS_CROSS,
    durationMs:     DURATION_2H,
  },

  harvest_bell_rare: {
    id:             "harvest_bell_rare",
    name:           "Harvest Bell II",
    description:    "Automatically harvests bloomed plants on adjacent cells, even while offline. Lasts 4 hours.",
    emoji:          "🔔",
    rarity:         "rare",
    shopPrice:      2_500,
    category:       "passive",
    passiveSubtype: "harvest_bell",
    radiusOffsets:  OFFSETS_CROSS,
    durationMs:     DURATION_4H,
  },

  harvest_bell_legendary: {
    id:             "harvest_bell_legendary",
    name:           "Harvest Bell III",
    description:    "Automatically harvests bloomed plants in surrounding cells, even while offline. Lasts 8 hours.",
    emoji:          "🔔",
    rarity:         "legendary",
    shopPrice:      18_000,
    category:       "passive",
    passiveSubtype: "harvest_bell",
    radiusOffsets:  OFFSETS_3X3,
    durationMs:     DURATION_8H,
  },

  // ── Aegis ─────────────────────────────────────────────────────────────────
  // Points in a player-chosen direction. Blocks weather mutations on all
  // plants in the line ahead. Does NOT strip existing mutations.

  aegis_uncommon: {
    id:             "aegis_uncommon",
    name:           "Aegis I",
    description:    "Blocks weather mutations on 2 plants in a chosen direction. Lasts 2 hours.",
    emoji:          "🛡️",
    rarity:         "uncommon",
    shopPrice:      300,
    category:       "passive",
    passiveSubtype: "aegis",
    durationMs:     DURATION_2H,
    fanRange:       2,
  },

  aegis_rare: {
    id:             "aegis_rare",
    name:           "Aegis II",
    description:    "Blocks weather mutations on 3 plants in a chosen direction. Lasts 4 hours.",
    emoji:          "🛡️",
    rarity:         "rare",
    shopPrice:      1_500,
    category:       "passive",
    passiveSubtype: "aegis",
    durationMs:     DURATION_4H,
    fanRange:       3,
  },

  aegis_legendary: {
    id:             "aegis_legendary",
    name:           "Aegis III",
    description:    "Blocks weather mutations on 4 plants in a chosen direction. Lasts 8 hours.",
    emoji:          "🛡️",
    rarity:         "legendary",
    shopPrice:      10_000,
    category:       "passive",
    passiveSubtype: "aegis",
    durationMs:     DURATION_8H,
    fanRange:       4,
  },

  // ── Garden Pin ────────────────────────────────────────────────────────────
  // Placed in any plot cell. Marks the plot as "pinned" — blocks manual
  // harvests and all mutations (weather and sprinkler) until removed.
  // Permanent — no expiry.

  garden_pin: {
    id:             "garden_pin",
    name:           "Garden Pin",
    description:    "Marks this plot. Blocks harvests and mutations until removed. Permanent.",
    emoji:          "📌",
    rarity:         "uncommon",
    shopPrice:      0,
    category:       "passive",
    passiveSubtype: "garden_pin",
  },

  // ── Auto-Planter ─────────────────────────────────────────────────────────
  // Automatically plants seeds from the player's inventory into empty cells
  // within a 5×5 area — works even while offline.

  auto_planter_prismatic: {
    id:             "auto_planter_prismatic",
    name:           "Auto-Planter",
    description:    "Automatically plants seeds from your inventory into empty cells in a diamond area, even while offline. Lasts 12 hours.",
    emoji:          "🌾",
    rarity:         "prismatic",
    shopPrice:      500_000,
    category:       "passive",
    passiveSubtype: "auto_planter",
    radiusOffsets:  OFFSETS_DIAMOND,
    durationMs:     DURATION_12H,
  },

  // ── Cropsticks ───────────────────────────────────────────────────────────
  // Placed in an empty cell. Each server tick, scans the 4 adjacent cells for
  // bloomed flowers marked as attuned. If 2+ attuned neighbors match a
  // cross-breed recipe, there's a chance (~0.58%/tick → ~50% over an hour)
  // to produce a hybrid seed. Permanent — no expiry.

  cropsticks: {
    id:             "cropsticks",
    name:           "Cropsticks",
    description:    "Passively cross-breeds adjacent flowers marked with Attunement. Place next to two attuned blooms of compatible types and wait for a hybrid seed to appear. Permanent.",
    emoji:          "🥢",
    rarity:         "legendary",
    shopPrice:      12_000,
    category:       "passive",
    passiveSubtype: "cropsticks",
    radiusOffsets:  OFFSETS_CROSS, // highlights the 4 cells it monitors in the UI
  },
};

// ── Utility: check if gear has expired ────────────────────────────────────

export function isGearExpired(gear: PlacedGear, now: number): boolean {
  const def = GEAR[gear.gearType];
  if (!def.durationMs) return false; // permanent gear never expires
  return now >= gear.placedAt + def.durationMs;
}

// ── Utility: get cells affected by a piece of gear ────────────────────────

/**
 * Returns all [row, col] pairs that a piece of gear at (gearRow, gearCol)
 * affects, clamped to the grid dimensions.
 * For fans and aegis, `direction` must be supplied to compute the line of cells.
 */
export function getAffectedCells(
  gearType:  GearType,
  gearRow:   number,
  gearCol:   number,
  gridRows:  number,
  gridCols:  number,
  direction?: FanDirection
): [number, number][] {
  const def = GEAR[gearType];

  // Fan / Aegis: compute a line of cells in the chosen direction
  if ((def.passiveSubtype === "fan" || def.passiveSubtype === "aegis") && def.fanRange) {
    if (!direction) return []; // direction required
    const range = def.fanRange;
    const offsets: [number, number][] = [];
    for (let i = 1; i <= range; i++) {
      if (direction === "up")    offsets.push([-i,  0]);
      if (direction === "down")  offsets.push([ i,  0]);
      if (direction === "left")  offsets.push([ 0, -i]);
      if (direction === "right") offsets.push([ 0,  i]);
    }
    return offsets
      .map(([dr, dc]): [number, number] => [gearRow + dr, gearCol + dc])
      .filter(([r, c]) => r >= 0 && r < gridRows && c >= 0 && c < gridCols);
  }

  if (!def.radiusOffsets) return [];
  return def.radiusOffsets
    .map(([dr, dc]): [number, number] => [gearRow + dr, gearCol + dc])
    .filter(([r, c]) => r >= 0 && r < gridRows && c >= 0 && c < gridCols);
}

// ── Utility: find active gear of a category affecting a cell ─────────────

export interface ActiveGearSource {
  gearType:  GearType;
  def:       GearDefinition;
  sourceRow: number;
  sourceCol: number;
  placedGear: PlacedGear;
}

/**
 * Scans the entire grid and returns every non-expired gear item whose
 * radius covers (targetRow, targetCol), optionally filtered by category.
 */
export function getGearAffectingCell<G extends GearDefinition = GearDefinition>(
  grid: { gear: PlacedGear | null }[][],
  targetRow: number,
  targetCol: number,
  now: number,
  filter?: (def: GearDefinition) => def is G
): ActiveGearSource[] {
  const results: ActiveGearSource[] = [];
  const gridRows = grid.length;
  const gridCols = grid[0]?.length ?? 0;

  for (let sr = 0; sr < gridRows; sr++) {
    for (let sc = 0; sc < gridCols; sc++) {
      const placedGear = grid[sr][sc]?.gear;
      if (!placedGear) continue;
      if (isGearExpired(placedGear, now)) continue;

      const def = GEAR[placedGear.gearType];
      if (filter && !filter(def)) continue;

      const affected = getAffectedCells(placedGear.gearType, sr, sc, gridRows, gridCols, placedGear.direction);
      if (affected.some(([r, c]) => r === targetRow && c === targetCol)) {
        results.push({ gearType: placedGear.gearType, def, sourceRow: sr, sourceCol: sc, placedGear });
      }
    }
  }

  return results;
}

// ── Convenience predicates ─────────────────────────────────────────────────

export function isRegularSprinkler(def: GearDefinition): boolean {
  return def.category === "sprinkler_regular";
}

export function isMutationSprinkler(def: GearDefinition): boolean {
  return def.category === "sprinkler_mutation";
}

export function isScarecrow(def: GearDefinition): boolean {
  return def.passiveSubtype === "scarecrow";
}

export function isGrowLamp(def: GearDefinition): boolean {
  return def.passiveSubtype === "grow_lamp";
}

export function isComposter(def: GearDefinition): boolean {
  return def.passiveSubtype === "composter";
}

export function isFan(def: GearDefinition): boolean {
  return def.passiveSubtype === "fan";
}

export function isAegis(def: GearDefinition): boolean {
  return def.passiveSubtype === "aegis";
}

export function isHarvestBell(def: GearDefinition): boolean {
  return def.passiveSubtype === "harvest_bell";
}

export function isAutoPlanter(def: GearDefinition): boolean {
  return def.passiveSubtype === "auto_planter";
}

export function isCropsticks(def: GearDefinition): boolean {
  return def.passiveSubtype === "cropsticks";
}

export function isGardenPin(def: GearDefinition): boolean {
  return def.passiveSubtype === "garden_pin";
}

// ── Supply shop pools ──────────────────────────────────────────────────────

export type SupplyItem =
  | { kind: "fertilizer"; fertilizerType: FertilizerType }
  | { kind: "gear";       gearType: GearType };

/** Items available at each rarity tier in the Supply Shop.
 *  Gear has moved to the Crafting system — only fertilizers appear here. */
export const SUPPLY_POOLS: Partial<Record<Rarity, SupplyItem[]>> = {
  common: [
    { kind: "fertilizer", fertilizerType: "basic" },
  ],
  uncommon: [
    { kind: "fertilizer", fertilizerType: "advanced" },
  ],
  rare: [
    { kind: "fertilizer", fertilizerType: "premium" },
  ],
  legendary: [
    { kind: "fertilizer", fertilizerType: "elite" },
  ],
  mythic: [
    { kind: "fertilizer", fertilizerType: "miracle" },
  ],
};

/** Rarity weights for supply shop generation */
export const SUPPLY_RARITY_WEIGHTS: Partial<Record<Rarity, number>> = {
  common:    40,
  uncommon:  30,
  rare:      20,
  legendary: 6,
  mythic:    3,
  exalted:   1,
  prismatic: 0.5,
};

const RARITY_RANK: Record<Rarity, number> = {
  common: 0, uncommon: 1, rare: 2, legendary: 3, mythic: 4, exalted: 5, prismatic: 6,
};

/** Returns the highest rarity tier available in the supply shop for a given slot count */
export function getMaxSupplyRarity(supplySlots: number): Rarity {
  if (supplySlots >= 6) return "prismatic";
  if (supplySlots >= 5) return "exalted";
  if (supplySlots >= 4) return "mythic";
  if (supplySlots >= 3) return "legendary";
  return "rare"; // default (1–2 slots)
}

/** True if `rarity` is available in the supply shop given the current slot count */
export function isRarityUnlocked(rarity: Rarity, supplySlots: number): boolean {
  return RARITY_RANK[rarity] <= RARITY_RANK[getMaxSupplyRarity(supplySlots)];
}

// ── Composter fertilizer roll ──────────────────────────────────────────────

/**
 * Rolls a fertilizer type for a composter when a nearby plant blooms.
 * Higher-rarity flowers produce better fertilizers more often.
 */
export function rollComposterFertilizer(flowerRarity: Rarity): FertilizerType {
  const table: Record<Rarity, Record<FertilizerType, number>> = {
    common:    { basic: 50, advanced: 30, premium: 15, elite: 4,  miracle: 1  },
    uncommon:  { basic: 35, advanced: 35, premium: 20, elite: 8,  miracle: 2  },
    rare:      { basic: 20, advanced: 30, premium: 30, elite: 15, miracle: 5  },
    legendary: { basic: 10, advanced: 20, premium: 30, elite: 25, miracle: 15 },
    mythic:    { basic: 5,  advanced: 15, premium: 25, elite: 30, miracle: 25 },
    exalted:   { basic: 3,  advanced: 10, premium: 20, elite: 30, miracle: 37 },
    prismatic: { basic: 2,  advanced: 8,  premium: 15, elite: 25, miracle: 50 },
  };

  const weights = table[flowerRarity];
  const total   = Object.values(weights).reduce((s, w) => s + w, 0);
  let roll      = Math.random() * total;

  for (const [type, weight] of Object.entries(weights) as [FertilizerType, number][]) {
    roll -= weight;
    if (roll <= 0) return type;
  }
  return "basic";
}
