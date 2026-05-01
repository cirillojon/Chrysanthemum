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

// ── Response helpers ──────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const err = (msg: string, status = 400) => json({ error: msg }, status);

// ── Tier → rarity (mirrors src/data/consumables.ts) ──────────────────────────

const TIER_RARITIES: Record<number, string> = {
  1: "rare", 2: "legendary", 3: "mythic", 4: "exalted", 5: "prismatic",
};

// ── Eclipse Tonic: advancement hours per consumable ID ───────────────────────

const ECLIPSE_ADVANCE_HOURS: Record<string, number> = {
  eclipse_tonic_1: 1, eclipse_tonic_2: 2, eclipse_tonic_3: 4,
  eclipse_tonic_4: 8, eclipse_tonic_5: 16,
};

// ── Speed-boost consumables (mirrors src/data/consumables.ts) ────────────────
// Tier → duration in ms: I=30min, II=1h, III=3h, IV=8h, V=24h
const BOOST_DURATIONS_MS: Record<number, number> = {
  1: 30 * 60 * 1_000,
  2:  1 * 60 * 60 * 1_000,
  3:  3 * 60 * 60 * 1_000,
  4:  8 * 60 * 60 * 1_000,
  5: 24 * 60 * 60 * 1_000,
};

type BoostType = "growth" | "craft" | "attunement";

function consumableToBoostType(id: string): BoostType | null {
  if (id.startsWith("verdant_rush_"))    return "growth";
  if (id.startsWith("forge_haste_"))     return "craft";
  if (id.startsWith("resonance_draft_")) return "attunement";
  return null;
}

interface ActiveBoost {
  type:         BoostType;
  expiresAt:    string;  // ISO
  consumableId: string;
}

// ── Mutation-boost vials: consumable prefix → mutation type ──────────────────

const VIAL_MUTATION: Record<string, string> = {
  frost_vial:   "frozen",
  ember_vial:   "scorched",
  storm_vial:   "shocked",
  moon_vial:    "moonlit",
  golden_vial:  "golden",
  rainbow_vial: "rainbow",
};

// ── Species → rarity (mirrors apply-infuser/index.ts) ────────────────────────

const SPECIES_RARITY: Record<string, string> = {
  // Common
  quickgrass: "common",    dustweed: "common",       sprig: "common",
  dewdrop: "common",       pebblebloom: "common",    ember_moss: "common",
  dandelion: "common",     clover: "common",          violet: "common",
  lemongrass: "common",    daisy: "common",           honeywort: "common",
  buttercup: "common",     dawnpetal: "common",       poppy: "common",
  chamomile: "common",     marigold: "common",        sunflower: "common",
  coppercup: "common",     ivybell: "common",         thornberry: "common",
  saltmoss: "common",      ashpetal: "common",        snowdrift: "common",
  // Uncommon
  swiftbloom: "uncommon",  shortcress: "uncommon",    thornwhistle: "uncommon",
  starwort: "uncommon",    mintleaf: "uncommon",      tulip: "uncommon",
  inkbloom: "uncommon",    hyacinth: "uncommon",      snapdragon: "uncommon",
  beebalm: "uncommon",     candleflower: "uncommon",  carnation: "uncommon",
  ribbonweed: "uncommon",  hibiscus: "uncommon",      wildberry: "uncommon",
  frostbell: "uncommon",   bluebell: "uncommon",      cherry_blossom: "uncommon",
  rose: "uncommon",        peacockflower: "uncommon", bamboo_bloom: "uncommon",
  hummingbloom: "uncommon",water_lily: "uncommon",    lanternflower: "uncommon",
  dovebloom: "uncommon",   coral_bells: "uncommon",   sundew: "uncommon",
  bubblebloom: "uncommon",
  // Rare
  flashpetal: "rare",      rushwillow: "rare",        sweetheart_lily: "rare",
  glassbell: "rare",       stormcaller: "rare",       lavender: "rare",
  amber_crown: "rare",     peach_blossom: "rare",     foxglove: "rare",
  butterbloom: "rare",     peony: "rare",             tidebloom: "rare",
  starweave: "rare",       wisteria: "rare",          dreamcup: "rare",
  coralbell: "rare",       foxfire: "rare",           bird_of_paradise: "rare",
  solarbell: "rare",       moonpetal: "rare",         orchid: "rare",
  duskrose: "rare",        passionflower: "rare",     glasswing: "rare",
  mirror_orchid: "rare",   stargazer_lily: "rare",    prism_lily: "rare",
  dusk_orchid: "rare",
  // Legendary
  firstbloom: "legendary",    haste_lily: "legendary",     verdant_crown: "legendary",
  ironwood_bloom: "legendary",sundial: "legendary",         lotus: "legendary",
  candy_blossom: "legendary", prismbark: "legendary",       dolphinia: "legendary",
  ghost_orchid: "legendary",  nestbloom: "legendary",       black_rose: "legendary",
  pumpkin_blossom: "legendary",starburst_lily: "legendary",  sporebloom: "legendary",
  fire_lily: "legendary",     stargazer: "legendary",       fullmoon_bloom: "legendary",
  ice_crown: "legendary",     diamond_bloom: "legendary",   oracle_eye: "legendary",
  halfmoon_bloom: "legendary",aurora_bloom: "legendary",    mirrorpetal: "legendary",
  emberspark: "legendary",
  // Cropsticks recipe output — Legendary (Tier 1)
  phoenix_lily: "legendary",  eclipse_bloom: "legendary",   tempest_orchid: "legendary",
  blightmantle: "legendary",  cosmosbloom: "legendary",     dreamgust: "legendary",
  // Mythic
  blink_rose: "mythic",    dawnfire: "mythic",        moonflower: "mythic",
  jellybloom: "mythic",    celestial_bloom: "mythic", void_blossom: "mythic",
  seraph_wing: "mythic",   solar_rose: "mythic",      nebula_drift: "mythic",
  superbloom: "mythic",    wanderbloom: "mythic",     chrysanthemum: "mythic",
  // Cropsticks recipe output — Mythic (Tier 2)
  solarburst: "mythic",    tidalune: "mythic",        whisperleaf: "mythic",
  crystalmind: "mythic",
  // Exalted
  umbral_bloom: "exalted",  obsidian_rose: "exalted", duskmantle: "exalted",
  graveweb: "exalted",      nightwing: "exalted",     ashenveil: "exalted",
  voidfire: "exalted",
  // Cropsticks recipe output — Exalted (Tier 3)
  void_chrysalis: "exalted", starloom: "exalted",
  // Prismatic
  dreambloom: "prismatic",  fairy_blossom: "prismatic", lovebind: "prismatic",
  eternal_heart: "prismatic",nova_bloom: "prismatic",   princess_blossom: "prismatic",
  // Cropsticks recipe output — Prismatic (Tier 4)
  the_first_bloom: "prismatic",
};

// ── Flower growth times in ms (mirrors harvest/index.ts) ─────────────────────
// Used by Bloom Burst to know how far to advance the sprout stage.

const FLOWER_GROWTH_TIMES: Record<string, { seed: number; sprout: number }> = {
  quickgrass: { seed: 40_000, sprout: 80_000 }, dustweed: { seed: 45_000, sprout: 90_000 },
  sprig: { seed: 60_000, sprout: 120_000 }, dewdrop: { seed: 65_000, sprout: 130_000 },
  pebblebloom: { seed: 68_000, sprout: 136_000 }, ember_moss: { seed: 70_000, sprout: 140_000 },
  dandelion: { seed: 75_000, sprout: 150_000 }, clover: { seed: 80_000, sprout: 160_000 },
  violet: { seed: 85_000, sprout: 170_000 }, stormcap: { seed: 87_000, sprout: 174_000 },
  lemongrass: { seed: 88_000, sprout: 176_000 },
  daisy: { seed: 90_000, sprout: 180_000 }, honeywort: { seed: 92_000, sprout: 184_000 },
  buttercup: { seed: 95_000, sprout: 190_000 }, dawnpetal: { seed: 97_000, sprout: 194_000 },
  poppy: { seed: 100_000, sprout: 200_000 }, chamomile: { seed: 105_000, sprout: 210_000 },
  marigold: { seed: 110_000, sprout: 220_000 }, stardust: { seed: 115_000, sprout: 230_000 },
  sunflower: { seed: 120_000, sprout: 240_000 },
  coppercup: { seed: 125_000, sprout: 250_000 }, ivybell: { seed: 130_000, sprout: 260_000 },
  thornberry: { seed: 140_000, sprout: 280_000 }, saltmoss: { seed: 148_000, sprout: 296_000 },
  ashpetal: { seed: 155_000, sprout: 310_000 }, snowdrift: { seed: 163_000, sprout: 326_000 },
  swiftbloom: { seed: 240_000, sprout: 480_000 }, shortcress: { seed: 255_000, sprout: 510_000 },
  thornwhistle: { seed: 280_000, sprout: 560_000 }, starwort: { seed: 290_000, sprout: 580_000 },
  mintleaf: { seed: 295_000, sprout: 590_000 }, tulip: { seed: 300_000, sprout: 600_000 },
  inkbloom: { seed: 310_000, sprout: 620_000 }, hyacinth: { seed: 320_000, sprout: 640_000 },
  snapdragon: { seed: 330_000, sprout: 660_000 }, moonstrike: { seed: 340_000, sprout: 680_000 },
  beebalm: { seed: 345_000, sprout: 690_000 }, candleflower: { seed: 350_000, sprout: 700_000 }, carnation: { seed: 360_000, sprout: 720_000 },
  ribbonweed: { seed: 370_000, sprout: 740_000 }, hibiscus: { seed: 380_000, sprout: 760_000 },
  wildberry: { seed: 395_000, sprout: 790_000 }, frostbell: { seed: 390_000, sprout: 780_000 },
  bluebell: { seed: 400_000, sprout: 800_000 }, cherry_blossom: { seed: 410_000, sprout: 820_000 },
  rose: { seed: 420_000, sprout: 840_000 }, peacockflower: { seed: 430_000, sprout: 860_000 },
  bamboo_bloom: { seed: 440_000, sprout: 880_000 }, hummingbloom: { seed: 440_000, sprout: 880_000 },
  water_lily: { seed: 450_000, sprout: 900_000 }, lanternflower: { seed: 460_000, sprout: 920_000 },
  dovebloom: { seed: 480_000, sprout: 960_000 }, coral_bells: { seed: 500_000, sprout: 1_000_000 },
  sundew: { seed: 520_000, sprout: 1_040_000 }, bubblebloom: { seed: 540_000, sprout: 1_080_000 },
  flashpetal: { seed: 900_000, sprout: 1_800_000 }, rushwillow: { seed: 960_000, sprout: 1_920_000 },
  sweetheart_lily: { seed: 1_080_000, sprout: 2_160_000 }, glassbell: { seed: 1_100_000, sprout: 2_200_000 },
  stormcaller: { seed: 1_140_000, sprout: 2_280_000 }, lavender: { seed: 1_200_000, sprout: 2_400_000 },
  amber_crown: { seed: 1_200_000, sprout: 2_400_000 }, peach_blossom: { seed: 1_200_000, sprout: 2_400_000 },
  foxglove: { seed: 1_320_000, sprout: 2_640_000 }, winterwood: { seed: 1_350_000, sprout: 2_700_000 },
  butterbloom: { seed: 1_380_000, sprout: 2_760_000 },
  peony: { seed: 1_440_000, sprout: 2_880_000 }, tidebloom: { seed: 1_500_000, sprout: 3_000_000 },
  starweave: { seed: 1_500_000, sprout: 3_000_000 }, wisteria: { seed: 1_560_000, sprout: 3_120_000 },
  dreamcup: { seed: 1_560_000, sprout: 3_120_000 }, coralbell: { seed: 1_620_000, sprout: 3_240_000 },
  foxfire: { seed: 1_650_000, sprout: 3_300_000 }, bird_of_paradise: { seed: 1_680_000, sprout: 3_360_000 },
  solarbell: { seed: 1_680_000, sprout: 3_360_000 }, moonpetal: { seed: 1_740_000, sprout: 3_480_000 },
  orchid: { seed: 1_800_000, sprout: 3_600_000 }, duskrose: { seed: 1_860_000, sprout: 3_720_000 },
  passionflower: { seed: 1_920_000, sprout: 3_840_000 }, glasswing: { seed: 2_000_000, sprout: 4_000_000 },
  mirror_orchid: { seed: 2_100_000, sprout: 4_200_000 }, stargazer_lily: { seed: 2_160_000, sprout: 4_320_000 },
  prism_lily: { seed: 2_280_000, sprout: 4_560_000 }, dusk_orchid: { seed: 2_400_000, sprout: 4_800_000 },
  firstbloom: { seed: 5_400_000, sprout: 10_800_000 }, haste_lily: { seed: 5_800_000, sprout: 11_600_000 },
  verdant_crown: { seed: 6_600_000, sprout: 13_200_000 }, ironwood_bloom: { seed: 6_800_000, sprout: 13_600_000 },
  sundial: { seed: 7_000_000, sprout: 14_000_000 }, lotus: { seed: 7_200_000, sprout: 14_400_000 },
  candy_blossom: { seed: 7_500_000, sprout: 15_000_000 }, prismbark: { seed: 7_500_000, sprout: 15_000_000 },
  dolphinia: { seed: 7_800_000, sprout: 15_600_000 }, ghost_orchid: { seed: 7_800_000, sprout: 15_600_000 },
  nestbloom: { seed: 8_100_000, sprout: 16_200_000 }, black_rose: { seed: 8_400_000, sprout: 16_800_000 },
  pumpkin_blossom: { seed: 8_400_000, sprout: 16_800_000 }, starburst_lily: { seed: 8_400_000, sprout: 16_800_000 },
  sporebloom: { seed: 8_700_000, sprout: 17_400_000 }, fire_lily: { seed: 9_000_000, sprout: 18_000_000 },
  stargazer: { seed: 9_300_000, sprout: 18_600_000 }, fullmoon_bloom: { seed: 9_600_000, sprout: 19_200_000 },
  ice_crown: { seed: 9_600_000, sprout: 19_200_000 }, diamond_bloom: { seed: 10_200_000, sprout: 20_400_000 },
  oracle_eye: { seed: 10_800_000, sprout: 21_600_000 }, halfmoon_bloom: { seed: 11_400_000, sprout: 22_800_000 },
  aurora_bloom: { seed: 11_500_000, sprout: 23_000_000 }, mirrorpetal: { seed: 12_000_000, sprout: 24_000_000 },
  emberspark: { seed: 12_600_000, sprout: 25_200_000 },
  phoenix_lily: { seed: 36_000_000, sprout: 72_000_000 }, eclipse_bloom: { seed: 43_200_000, sprout: 86_400_000 },
  tempest_orchid: { seed: 50_400_000, sprout: 100_800_000 }, blightmantle: { seed: 57_600_000, sprout: 115_200_000 },
  cosmosbloom: { seed: 64_800_000, sprout: 129_600_000 }, dreamgust: { seed: 72_000_000, sprout: 144_000_000 },
  solarburst: { seed: 86_400_000, sprout: 172_800_000 }, tidalune: { seed: 108_000_000, sprout: 216_000_000 },
  whisperleaf: { seed: 129_600_000, sprout: 259_200_000 }, crystalmind: { seed: 151_200_000, sprout: 302_400_000 },
  void_chrysalis: { seed: 302_400_000, sprout: 604_800_000 }, starloom: { seed: 345_600_000, sprout: 691_200_000 },
  the_first_bloom: { seed: 604_800_000, sprout: 1_209_600_000 },
  blink_rose: { seed: 18_000_000, sprout: 36_000_000 }, dawnfire: { seed: 21_600_000, sprout: 43_200_000 },
  moonflower: { seed: 28_800_000, sprout: 57_600_000 }, jellybloom: { seed: 30_000_000, sprout: 60_000_000 },
  celestial_bloom: { seed: 36_000_000, sprout: 72_000_000 }, void_blossom: { seed: 43_200_000, sprout: 86_400_000 },
  seraph_wing: { seed: 54_000_000, sprout: 108_000_000 }, solar_rose: { seed: 57_600_000, sprout: 115_200_000 },
  nebula_drift: { seed: 64_800_000, sprout: 129_600_000 }, superbloom: { seed: 72_000_000, sprout: 144_000_000 },
  wanderbloom: { seed: 72_000_000, sprout: 144_000_000 }, chrysanthemum: { seed: 86_400_000, sprout: 172_800_000 },
  umbral_bloom: { seed: 108_000_000, sprout: 216_000_000 }, obsidian_rose: { seed: 129_600_000, sprout: 259_200_000 },
  duskmantle: { seed: 144_000_000, sprout: 288_000_000 }, deeproot: { seed: 150_000_000, sprout: 300_000_000 },
  graveweb: { seed: 172_800_000, sprout: 345_600_000 }, rimestorm: { seed: 180_000_000, sprout: 360_000_000 },
  nightwing: { seed: 216_000_000, sprout: 432_000_000 }, solglow: { seed: 225_000_000, sprout: 450_000_000 },
  ashenveil: { seed: 237_600_000, sprout: 475_200_000 }, voidfire: { seed: 259_200_000, sprout: 518_400_000 },
  dreambloom: { seed: 300_000_000, sprout: 600_000_000 }, fairy_blossom: { seed: 324_000_000, sprout: 648_000_000 },
  lovebind: { seed: 345_600_000, sprout: 691_200_000 }, islebloom: { seed: 355_000_000, sprout: 710_000_000 },
  eternal_heart: { seed: 374_400_000, sprout: 748_800_000 }, moonrime: { seed: 385_000_000, sprout: 770_000_000 },
  nova_bloom: { seed: 403_200_000, sprout: 806_400_000 }, shadowgale: { seed: 415_000_000, sprout: 830_000_000 },
  princess_blossom: { seed: 432_000_000, sprout: 864_000_000 },
};

// ── Types ─────────────────────────────────────────────────────────────────────

type ConsumableEntry = { id: string; quantity: number };
type PlantData = {
  speciesId:      string;
  timePlanted:    number;
  sproutedAt?:    number;
  bloomedAt?:     number;
  growthMs?:      number;
  lastTickAt?:    number;
  heirloomActive?:  boolean;
  mutationBlocked?: boolean;
  forcedMutation?:  string;
  mutationBoost?:   { mutation: string; multiplier: number };
  revealed?:        boolean;
  pinned?:          boolean;
  [key: string]: unknown;
};
type GridCell = { id: string; plant: PlantData | null; gear?: unknown };
type ShopSlot = {
  speciesId: string;
  price:     number;
  quantity:  number;
  locked?:   boolean;
  isEmpty?:  boolean;
  [key: string]: unknown;
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Extract the trailing tier digit from a consumable ID, e.g. "bloom_burst_3" → 3. */
function extractTier(id: string): number | null {
  const last = id.split("_").pop();
  const n    = last ? parseInt(last, 10) : NaN;
  return isNaN(n) ? null : n;
}

/** Remove 1× of consumableId from the inventory array. Returns null if not owned. */
function deductConsumable(
  consumables: ConsumableEntry[],
  consumableId: string,
): ConsumableEntry[] | null {
  const idx = consumables.findIndex((c) => c.id === consumableId && c.quantity > 0);
  if (idx < 0) return null;
  return consumables
    .map((c, i) => i === idx ? { ...c, quantity: c.quantity - 1 } : c)
    .filter((c) => c.quantity > 0);
}

/**
 * Simplified growth-stage check that works without weather/gear multipliers.
 * Uses bloomedAt if stamped; falls back to growthMs → sproutedAt → timePlanted.
 */
function getStage(plant: PlantData, now: number): "seed" | "sprout" | "bloom" {
  if (plant.bloomedAt != null && plant.bloomedAt <= now) return "bloom";

  const times = FLOWER_GROWTH_TIMES[plant.speciesId];

  if (plant.growthMs !== undefined) {
    const elapsed = plant.growthMs + Math.max(0, now - (plant.lastTickAt ?? now));
    if (times && elapsed >= times.seed) return "sprout";
    return "seed";
  }

  if (plant.sproutedAt != null) return "sprout";
  return "seed";
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Auth (fast decode) ────────────────────────────────────────────────────

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

    // ── Parse body ────────────────────────────────────────────────────────────

    const body = await req.json() as {
      action:       string;
      consumableId: string;
      row?:         number;
      col?:         number;
      slotId?:      string;
    };

    const { action, consumableId } = body;
    if (!action)       return err("action is required");
    if (!consumableId) return err("consumableId is required");

    const VALID_ACTIONS = ["apply_to_plant", "eclipse_tonic", "wind_shear", "slot_lock", "activate_boost"];
    if (!VALID_ACTIONS.includes(action)) return err(`Unknown action: ${action}`);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Build SELECT list based on action ─────────────────────────────────────

    const extraCols = {
      apply_to_plant: ", grid",
      eclipse_tonic:  ", grid, last_eclipse_tonic",
      wind_shear:     ", last_wind_shear_used",
      slot_lock:      ", supply_shop",
      activate_boost: ", active_boosts",
    } as Record<string, string>;

    const selectCols = `consumables, updated_at${extraCols[action] ?? ""}`;

    // ── Auth + save load in parallel ──────────────────────────────────────────

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

    const save          = saveResult.data;
    const priorUpdatedAt = save.updated_at as string;
    const consumables   = (save.consumables ?? []) as ConsumableEntry[];

    // ── Action: apply_to_plant ────────────────────────────────────────────────
    // Handles Bloom Burst, Heirloom Charm, Purity Vial, Giant Vial, and all
    // mutation-boost vials (Frost, Ember, Storm, Moon, Golden, Rainbow).

    if (action === "apply_to_plant") {
      const { row, col } = body;
      if (typeof row !== "number" || typeof col !== "number") {
        return err("row and col are required for apply_to_plant");
      }

      const grid = (save.grid ?? []) as GridCell[][];
      const cell = grid[row]?.[col];
      if (!cell || !cell.plant) return err("No plant at this position");

      const plant  = cell.plant;
      const rarity = SPECIES_RARITY[plant.speciesId];
      if (!rarity) return err("Unknown species");

      // Validate consumable tier vs. plant rarity.
      // Magnifying Glass and Garden Pin have no tier suffix and work on any rarity — skip the gate.
      if (consumableId !== "magnifying_glass" && consumableId !== "garden_pin") {
        const tier = extractTier(consumableId);
        if (tier === null) return err("This consumable cannot be applied to a plant");

        const requiredRarity = TIER_RARITIES[tier];
        if (!requiredRarity) return err("Unknown consumable tier");

        // All plant-targeting consumables match DOWNWARD — a higher-tier consumable
        // works on lower-rarity plants (e.g. Mythic vial → Rare plant). Tier 1
        // (Rare) is still the floor, so Common/Uncommon plants stay excluded.
        const RARITY_ORDER: Record<string, number> = {
          common: 0, uncommon: 1, rare: 2, legendary: 3, mythic: 4, exalted: 5, prismatic: 6,
        };
        if ((RARITY_ORDER[requiredRarity] ?? -1) < (RARITY_ORDER[rarity] ?? 999)) {
          return err(`This ${requiredRarity} consumable can't reach ${rarity} plants`);
        }
      }

      // Deduct consumable
      const newConsumables = deductConsumable(consumables, consumableId);
      if (!newConsumables) return err("Not enough consumables");

      const now   = Date.now();
      const stage = getStage(plant, now);
      let updatedPlant: PlantData = { ...plant };

      // ── Bloom Burst ─────────────────────────────────────────────────────────
      // Skip part of the remaining time in the plant's current stage:
      //   - Seed   → advance by remaining/2 (half of remaining)
      //   - Sprout → advance by remaining/4 (quarter, since sprout is 2× as
      //              long as seed → half as effective per real-time second)
      // Mirrors the client's applyPlantConsumable exactly.
      if (consumableId.startsWith("bloom_burst_")) {
        if (stage === "bloom") return err("Cannot use Bloom Burst on a fully bloomed plant");

        const times = FLOWER_GROWTH_TIMES[plant.speciesId];
        if (!times) return err("Unknown species growth data");

        const seedMs   = times.seed;
        const sproutMs = times.sprout;

        // Current growthMs (same fallback chain as getStage above)
        let currentGm: number;
        if (plant.growthMs !== undefined) {
          currentGm = plant.growthMs + Math.max(0, now - (plant.lastTickAt ?? now));
        } else if (plant.sproutedAt != null) {
          currentGm = seedMs + Math.max(0, now - plant.sproutedAt);
        } else {
          currentGm = Math.max(0, now - plant.timePlanted);
        }

        const stageEnd  = stage === "seed" ? seedMs : seedMs + sproutMs;
        const divisor   = stage === "seed" ? 2 : 4;
        const remaining = Math.max(0, stageEnd - currentGm);
        const newGm     = currentGm + Math.floor(remaining / divisor);

        updatedPlant = { ...updatedPlant, growthMs: newGm, lastTickAt: now };
        // Also stamp sproutedAt if we crossed the seed → sprout boundary
        if (newGm >= seedMs && updatedPlant.sproutedAt == null) {
          updatedPlant = { ...updatedPlant, sproutedAt: now };
        }

      // ── Heirloom Charm ──────────────────────────────────────────────────────
      } else if (consumableId.startsWith("heirloom_charm_")) {
        if (stage !== "bloom") return err("Heirloom Charm requires a bloomed plant");
        if (plant.heirloomActive) return err("Plant already has an active Heirloom Charm");
        updatedPlant = { ...updatedPlant, heirloomActive: true };

      // ── Purity Vial ─────────────────────────────────────────────────────────
      } else if (consumableId.startsWith("purity_vial_")) {
        updatedPlant = {
          ...updatedPlant,
          mutationBlocked: true,
          forcedMutation:  undefined,
          mutationBoost:   undefined,
        };

      // ── Giant Vial ──────────────────────────────────────────────────────────
      } else if (consumableId.startsWith("giant_vial_")) {
        updatedPlant = {
          ...updatedPlant,
          forcedMutation:  "giant",
          mutationBlocked: undefined,
          mutationBoost:   undefined,
        };

      // ── Magnifying Glass ────────────────────────────────────────────────────
      // Locks in whatever mutation state the plant currently has — future
      // weather/sprinkler/fan ticks skip revealed plants. Player decides when
      // to lock based on what's already rolled.
      } else if (consumableId === "magnifying_glass") {
        if (plant.revealed) return err("This plant's species is already revealed");
        if (plant.bloomedAt || plant.timePlanted === 0) return err("This plant has already bloomed — harvest it to identify it");
        updatedPlant = { ...updatedPlant, revealed: true };

      // ── Garden Pin ──────────────────────────────────────────────────────────
      // Shields the plot from auto-harvest (Harvest Bell, Auto-Planter).
      // Manual harvest still works. Permanent for the life of the plant.
      } else if (consumableId === "garden_pin") {
        if (plant.pinned) return err("This plant is already pinned");
        updatedPlant = { ...updatedPlant, pinned: true };

      // ── Mutation-boost vials (Frost, Ember, Storm, Moon, Golden, Rainbow) ───
      } else {
        const prefix   = consumableId.replace(/_\d+$/, ""); // e.g. "frost_vial"
        const mutation = VIAL_MUTATION[prefix];
        if (!mutation) return err(`Unknown plant consumable: ${consumableId}`);
        updatedPlant = {
          ...updatedPlant,
          mutationBoost:   { mutation, multiplier: 5 },
          mutationBlocked: undefined,
        };
      }

      const newGrid = grid.map((r, ri) =>
        r.map((c, ci) => ri === row && ci === col ? { ...c, plant: updatedPlant } : c)
      );

      const { data: ud, error: ue } = await supabaseAdmin
        .from("game_saves")
        .update({ grid: newGrid, consumables: newConsumables, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("updated_at", priorUpdatedAt)
        .select("updated_at")
        .single();

      if (ue || !ud) return err("Save conflict — please retry", 409);

      void supabaseAdmin.from("action_log").insert({
        user_id: userId, action: "use_consumable",
        payload: { action, row, col, consumableId },
        result:  { stage, flags: { heirloomActive: updatedPlant.heirloomActive, mutationBlocked: updatedPlant.mutationBlocked, forcedMutation: updatedPlant.forcedMutation, mutationBoost: updatedPlant.mutationBoost } },
      });

      return json({ ok: true, grid: newGrid, consumables: newConsumables, serverUpdatedAt: ud.updated_at });
    }

    // ── Action: eclipse_tonic ─────────────────────────────────────────────────
    // Advances every plant in the garden by N hours. Once per calendar day (UTC).

    if (action === "eclipse_tonic") {
      const advanceHours = ECLIPSE_ADVANCE_HOURS[consumableId];
      if (!advanceHours) return err(`Unknown Eclipse Tonic: ${consumableId}`);

      const today           = new Date().toISOString().slice(0, 10);
      const lastEclipseTonic = save.last_eclipse_tonic as string | null;
      if (lastEclipseTonic === today) {
        return err("Eclipse Tonic already used today. Try again tomorrow.", 429);
      }

      const newConsumables = deductConsumable(consumables, consumableId);
      if (!newConsumables) return err("Not enough consumables");

      const advanceMs = advanceHours * 60 * 60 * 1_000;
      const grid      = (save.grid ?? []) as GridCell[][];

      const newGrid = grid.map((row) =>
        row.map((cell) => {
          if (!cell.plant) return cell;
          const p = cell.plant;
          return {
            ...cell,
            plant: {
              ...p,
              timePlanted: p.timePlanted - advanceMs,
              // Shift explicit stage timestamps backward so the client's stage
              // detection and progress bar immediately reflect the new growth.
              ...(p.sproutedAt != null ? { sproutedAt: p.sproutedAt - advanceMs } : {}),
              ...(p.bloomedAt  != null ? { bloomedAt:  p.bloomedAt  - advanceMs } : {}),
              // Also shift the growthMs checkpoint window so the delta-based
              // system advances by the same amount.
              ...(p.lastTickAt != null ? { lastTickAt: p.lastTickAt - advanceMs } : {}),
            },
          };
        })
      );

      const { data: ud, error: ue } = await supabaseAdmin
        .from("game_saves")
        .update({
          grid:               newGrid,
          consumables:        newConsumables,
          last_eclipse_tonic: today,
          updated_at:         new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("updated_at", priorUpdatedAt)
        .select("updated_at")
        .single();

      if (ue || !ud) return err("Save conflict — please retry", 409);

      void supabaseAdmin.from("action_log").insert({
        user_id: userId, action: "use_consumable",
        payload: { action, consumableId, advanceHours },
      });

      return json({
        ok: true,
        grid: newGrid,
        consumables: newConsumables,
        lastEclipseTonic: today,
        serverUpdatedAt: ud.updated_at,
      });
    }

    // ── Action: wind_shear ────────────────────────────────────────────────────
    // Deducts the consumable and records the cooldown timestamp.
    // The client is responsible for regenerating and syncing the new supply shop.

    if (action === "wind_shear") {
      if (consumableId !== "wind_shear") return err("Invalid consumable for wind_shear action");

      const now            = Date.now();
      const lastUsed       = save.last_wind_shear_used as number | null;
      const COOLDOWN_MS    = 3_600_000; // 1 hour

      if (lastUsed != null && now - lastUsed < COOLDOWN_MS) {
        const remainingSec = Math.ceil((COOLDOWN_MS - (now - lastUsed)) / 1_000);
        return err(`Wind Shear is on cooldown. Try again in ${remainingSec}s.`, 429);
      }

      const newConsumables = deductConsumable(consumables, consumableId);
      if (!newConsumables) return err("Not enough consumables");

      const { data: ud, error: ue } = await supabaseAdmin
        .from("game_saves")
        .update({
          consumables:          newConsumables,
          last_wind_shear_used: now,
          updated_at:           new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("updated_at", priorUpdatedAt)
        .select("updated_at")
        .single();

      if (ue || !ud) return err("Save conflict — please retry", 409);

      void supabaseAdmin.from("action_log").insert({
        user_id: userId, action: "use_consumable",
        payload: { action, consumableId },
      });

      return json({
        ok: true,
        consumables: newConsumables,
        lastWindShearUsed: now,
        serverUpdatedAt: ud.updated_at,
      });
    }

    // ── Action: slot_lock ─────────────────────────────────────────────────────
    // Marks a supply shop slot as locked — it will survive the next shop refresh.

    if (action === "slot_lock") {
      if (consumableId !== "slot_lock") return err("Invalid consumable for slot_lock action");
      if (!body.slotId) return err("slotId is required for slot_lock");

      const supplyShop = (save.supply_shop ?? []) as ShopSlot[];
      const slotIdx    = supplyShop.findIndex((s) => s.speciesId === body.slotId);

      if (slotIdx < 0)                    return err("Slot not found in supply shop");
      if (supplyShop[slotIdx].isEmpty)    return err("Cannot lock an empty slot");
      if (supplyShop[slotIdx].locked)     return err("Slot is already locked");

      const newConsumables = deductConsumable(consumables, consumableId);
      if (!newConsumables) return err("Not enough consumables");

      const newSupplyShop = supplyShop.map((s, i) =>
        i === slotIdx ? { ...s, locked: true } : s
      );

      const { data: ud, error: ue } = await supabaseAdmin
        .from("game_saves")
        .update({
          supply_shop:  newSupplyShop,
          consumables:  newConsumables,
          updated_at:   new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("updated_at", priorUpdatedAt)
        .select("updated_at")
        .single();

      if (ue || !ud) return err("Save conflict — please retry", 409);

      void supabaseAdmin.from("action_log").insert({
        user_id: userId, action: "use_consumable",
        payload: { action, consumableId, slotId: body.slotId },
      });

      return json({
        ok: true,
        supplyShop: newSupplyShop,
        consumables: newConsumables,
        serverUpdatedAt: ud.updated_at,
      });
    }

    // ── Action: activate_boost ────────────────────────────────────────────────
    // Verdant Rush / Forge Haste / Resonance Draft (speed_boost category).
    // Deducts 1 of the consumable, adds an ActiveBoost entry with expiresAt =
    // now + tier duration. If a boost of the same type is already active, the
    // new entry takes precedence — the old one is dropped (no stacking past 2×).

    if (action === "activate_boost") {
      const boostType = consumableToBoostType(consumableId);
      if (!boostType) return err(`Not a speed-boost consumable: ${consumableId}`);

      const tier = extractTier(consumableId);
      if (tier === null) return err("Speed-boost consumable missing tier");
      const durationMs = BOOST_DURATIONS_MS[tier];
      if (!durationMs) return err(`Unknown tier ${tier}`);

      const newConsumables = deductConsumable(consumables, consumableId);
      if (!newConsumables) return err("Not enough consumables");

      const now      = Date.now();
      const existing = (save.active_boosts ?? []) as ActiveBoost[];

      // Drop expired entries
      const live = existing.filter((b) => new Date(b.expiresAt).getTime() > now);

      // For same-type entry: extend timer to whichever expiry is later.
      // (Using a 24h V on top of an active 30min I shouldn't shrink the timer.)
      const sameType         = live.find((b) => b.type === boostType);
      const existingExpiryMs = sameType ? new Date(sameType.expiresAt).getTime() : 0;
      const newExpiryMs      = Math.max(existingExpiryMs, now + durationMs);

      const otherTypes = live.filter((b) => b.type !== boostType);
      const newBoost: ActiveBoost = {
        type:         boostType,
        expiresAt:    new Date(newExpiryMs).toISOString(),
        consumableId,
      };
      const newActiveBoosts = [...otherTypes, newBoost];

      const { data: ud, error: ue } = await supabaseAdmin
        .from("game_saves")
        .update({
          consumables:   newConsumables,
          active_boosts: newActiveBoosts,
          updated_at:    new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("updated_at", priorUpdatedAt)
        .select("updated_at")
        .single();

      if (ue || !ud) return err("Save conflict — please retry", 409);

      void supabaseAdmin.from("action_log").insert({
        user_id: userId, action: "use_consumable",
        payload: { action, consumableId, boostType, durationMs },
      });

      return json({
        ok:              true,
        consumables:     newConsumables,
        activeBoosts:    newActiveBoosts,
        serverUpdatedAt: ud.updated_at,
      });
    }

    return err("Unhandled action");

  } catch (e) {
    console.error("use-consumable error:", e);
    return err("Internal server error", 500);
  }
});
