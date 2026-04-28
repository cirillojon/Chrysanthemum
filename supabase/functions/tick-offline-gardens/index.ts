import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  WEATHER_MUT_CHANCE_PER_TICK,
  THUNDERSTORM_WET_CHANCE_PER_TICK,
  THUNDERSTORM_SHOCKED_CHANCE_PER_TICK,
  MOONLIT_NIGHT_CHANCE_PER_TICK,
  perMinChance,
} from "../_shared/weatherMutationRates.ts";

// ── Called by a Supabase cron schedule every minute ────────────────────────
// Simulates offline gear auto-actions (harvest bell, auto-planter) for every
// player who has active gear in their garden but isn't currently online.
// Auth: requires Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY> (sent by the Supabase pg_cron job)

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Flower total bloom thresholds in ms (seed + sprout) ───────────────────
// Mirrors src/data/flowers.ts FLOWER_GROWTH_TIMES (same copy in harvest/index.ts)
const FLOWER_BLOOM_MS: Record<string, number> = {
  quickgrass: 120_000, dustweed: 135_000, sprig: 180_000, dewdrop: 195_000,
  pebblebloom: 204_000, ember_moss: 210_000, dandelion: 225_000, clover: 240_000,
  violet: 255_000, lemongrass: 264_000, daisy: 270_000, honeywort: 276_000,
  buttercup: 285_000, dawnpetal: 291_000, poppy: 300_000, chamomile: 315_000,
  marigold: 330_000, sunflower: 360_000, coppercup: 375_000, ivybell: 390_000,
  thornberry: 420_000, saltmoss: 444_000, ashpetal: 465_000, snowdrift: 489_000,
  swiftbloom: 720_000, shortcress: 765_000, thornwhistle: 840_000, starwort: 870_000,
  mintleaf: 885_000, tulip: 900_000, inkbloom: 930_000, hyacinth: 960_000,
  snapdragon: 990_000, beebalm: 1_035_000, candleflower: 1_050_000, carnation: 1_080_000,
  ribbonweed: 1_110_000, hibiscus: 1_140_000, wildberry: 1_185_000, frostbell: 1_170_000,
  bluebell: 1_200_000, cherry_blossom: 1_230_000, rose: 1_260_000, peacockflower: 1_290_000,
  bamboo_bloom: 1_320_000, hummingbloom: 1_320_000, water_lily: 1_350_000, lanternflower: 1_380_000,
  dovebloom: 1_440_000, coral_bells: 1_500_000, sundew: 1_560_000, bubblebloom: 1_620_000,
  flashpetal: 2_700_000, rushwillow: 2_880_000, sweetheart_lily: 3_240_000, glassbell: 3_300_000,
  stormcaller: 3_420_000, lavender: 3_600_000, amber_crown: 3_600_000, peach_blossom: 3_600_000,
  foxglove: 3_960_000, butterbloom: 4_140_000, peony: 4_320_000, tidebloom: 4_500_000,
  starweave: 4_500_000, wisteria: 4_680_000, dreamcup: 4_680_000, coralbell: 4_860_000,
  foxfire: 4_950_000, bird_of_paradise: 5_040_000, solarbell: 5_040_000, moonpetal: 5_220_000,
  orchid: 5_400_000, duskrose: 5_580_000, passionflower: 5_760_000, glasswing: 6_000_000,
  mirror_orchid: 6_300_000, stargazer_lily: 6_480_000, prism_lily: 6_840_000, dusk_orchid: 7_200_000,
  firstbloom: 16_200_000, haste_lily: 17_400_000, verdant_crown: 19_800_000, ironwood_bloom: 20_400_000,
  sundial: 21_000_000, lotus: 21_600_000, candy_blossom: 22_500_000, prismbark: 22_500_000,
  dolphinia: 23_400_000, ghost_orchid: 23_400_000, nestbloom: 24_300_000, black_rose: 25_200_000,
  pumpkin_blossom: 25_200_000, starburst_lily: 25_200_000, sporebloom: 26_100_000, fire_lily: 27_000_000,
  stargazer: 27_900_000, fullmoon_bloom: 28_800_000, ice_crown: 28_800_000, diamond_bloom: 30_600_000,
  oracle_eye: 32_400_000, halfmoon_bloom: 34_200_000, aurora_bloom: 34_500_000, mirrorpetal: 36_000_000,
  emberspark: 37_800_000,
  blink_rose: 54_000_000, dawnfire: 64_800_000, moonflower: 86_400_000, jellybloom: 90_000_000,
  celestial_bloom: 108_000_000, void_blossom: 129_600_000, seraph_wing: 162_000_000,
  solar_rose: 172_800_000, nebula_drift: 194_400_000, superbloom: 216_000_000,
  wanderbloom: 216_000_000, chrysanthemum: 259_200_000,
  umbral_bloom: 324_000_000, obsidian_rose: 388_800_000, duskmantle: 432_000_000,
  graveweb: 518_400_000, nightwing: 648_000_000, ashenveil: 712_800_000, voidfire: 777_600_000,
  dreambloom: 900_000_000, fairy_blossom: 972_000_000, lovebind: 1_036_800_000,
  eternal_heart: 1_123_200_000, nova_bloom: 1_209_600_000, princess_blossom: 1_296_000_000,
};

// ── Fertilizer speed multipliers (mirrors src/data/upgrades.ts) ───────────
const FERT_MULT: Record<string, number> = {
  basic: 1.1, advanced: 1.25, premium: 1.5, elite: 1.75, miracle: 2.0,
};

// ── Weather growth multipliers (mirrors src/data/weather.ts) ──────────────
// Only rain and thunderstorm differ from 1.0
const WEATHER_MULT: Record<string, number> = {
  rain: 1.5, thunderstorm: 1.5,
};

// ── Weather mutation types (mirrors src/store/gameStore.ts) ───────────────
const WEATHER_MUTATION_TYPE: Record<string, string> = {
  rain:            "wet",
  heatwave:        "scorched",
  cold_front:      "frozen",
  star_shower:     "moonlit",
  prismatic_skies: "rainbow",
  golden_hour:     "golden",
  tornado:         "windstruck",
  // thunderstorm omitted — handled via two-step chain (wet→shocked) below
};

// Per-minute equivalents derived from the shared per-tick source of truth.
// Formula: 1 - (1 - perTickChance)^60
const WEATHER_MUTATION_CHANCE_PER_MIN: Record<string, number> = Object.fromEntries(
  Object.entries(WEATHER_MUT_CHANCE_PER_TICK).map(([k, v]) => [k, perMinChance(v)])
);
const THUNDERSTORM_WET_CHANCE_PER_MIN     = perMinChance(THUNDERSTORM_WET_CHANCE_PER_TICK);
const THUNDERSTORM_SHOCKED_CHANCE_PER_MIN = perMinChance(THUNDERSTORM_SHOCKED_CHANCE_PER_TICK);
const MOONLIT_NIGHT_CHANCE_PER_MIN        = perMinChance(MOONLIT_NIGHT_CHANCE_PER_TICK);

function isNightUTC(now: number): boolean {
  const h = new Date(now).getUTCHours();
  return h >= 20 || h < 6;
}

// ── Gear range offsets ─────────────────────────────────────────────────────
const OFFSETS_CROSS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const OFFSETS_3X3: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],          [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
];
const OFFSETS_DIAMOND: [number, number][] = [
  [-2, 0],
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -2], [ 0, -1], [ 0, 1], [ 0, 2],
  [ 1, -1], [ 1, 0], [ 1, 1],
  [ 2, 0],
];

// ── Gear definitions ───────────────────────────────────────────────────────
interface GearDef { subtype: "harvest_bell" | "auto_planter"; offsets: [number, number][]; durationMs: number; }
const GEAR_DEFS: Record<string, GearDef> = {
  harvest_bell_rare:      { subtype: "harvest_bell", offsets: OFFSETS_CROSS,   durationMs:  4 * 60 * 60 * 1_000 },
  harvest_bell_legendary: { subtype: "harvest_bell", offsets: OFFSETS_3X3,    durationMs:  8 * 60 * 60 * 1_000 },
  auto_planter_prismatic: { subtype: "auto_planter", offsets: OFFSETS_DIAMOND, durationMs: 12 * 60 * 60 * 1_000 },
};

// ── Types ──────────────────────────────────────────────────────────────────
interface Plant {
  speciesId: string;
  timePlanted: number;
  growthMs?: number;
  lastTickAt?: number;
  bloomedAt?: number;
  sproutedAt?: number;
  fertilizer?: string;
  masteredBonus?: number;
  mutation?: string | null;
}
interface Gear { gearType: string; placedAt: number; }
interface Plot { id: string; plant?: Plant | null; gear?: Gear | null; }
interface InvItem { speciesId: string; quantity: number; isSeed: boolean; mutation?: string | null; }
interface Save {
  user_id: string;
  updated_at: string;
  grid: Plot[][];
  inventory: InvItem[];
  discovered: string[];
}

// ── Growth helpers ─────────────────────────────────────────────────────────
function computeGrowthMs(plant: Plant, now: number, weatherMult: number): number {
  if (plant.bloomedAt) return Infinity;
  const fert = FERT_MULT[plant.fertilizer ?? ""] ?? 1.0;
  const mast = plant.masteredBonus ?? 1.0;
  const mult = fert * mast * weatherMult;
  if (plant.growthMs !== undefined && plant.lastTickAt !== undefined) {
    return plant.growthMs + Math.max(0, now - plant.lastTickAt) * mult;
  }
  if (plant.sproutedAt !== undefined) {
    const seedMs = (FLOWER_BLOOM_MS[plant.speciesId] ?? 300_000) / 3;
    return seedMs + Math.max(0, now - plant.sproutedAt) * mult;
  }
  return Math.max(0, now - plant.timePlanted) * mult;
}

function hasBloom(plant: Plant, now: number, weatherMult: number): boolean {
  if (plant.bloomedAt && now >= plant.bloomedAt) return true;
  const gMs   = computeGrowthMs(plant, now, weatherMult);
  const total = FLOWER_BLOOM_MS[plant.speciesId];
  return total !== undefined && gMs >= total;
}

function isExpired(gear: Gear, now: number): boolean {
  const def = GEAR_DEFS[gear.gearType];
  return !def || now >= gear.placedAt + def.durationMs;
}

function affectedCells(gearType: string, ri: number, ci: number, rows: number, cols: number): [number, number][] {
  const def = GEAR_DEFS[gearType];
  if (!def) return [];
  return def.offsets
    .map(([dr, dc]): [number, number] => [ri + dr, ci + dc])
    .filter(([r, c]) => r >= 0 && r < rows && c >= 0 && c < cols);
}

// ── Stamp bloomedAt ────────────────────────────────────────────────────────
function stampBloomed(grid: Plot[][], now: number, weatherMult: number): { grid: Plot[][]; changed: boolean } {
  let changed = false;
  const next = grid.map(row => row.map(plot => {
    if (!plot.plant || plot.plant.bloomedAt) return plot;
    if (!hasBloom(plot.plant, now, weatherMult)) return plot;
    changed = true;
    return { ...plot, plant: { ...plot.plant, bloomedAt: now } };
  }));
  return { grid: changed ? next : grid, changed };
}

// ── Harvest bell ───────────────────────────────────────────────────────────
function runHarvestBells(save: Save, now: number): Save {
  let cur = save;
  const rows = save.grid.length;
  const cols = save.grid[0]?.length ?? 0;

  for (let ri = 0; ri < rows; ri++) {
    for (let ci = 0; ci < cols; ci++) {
      const gear = cur.grid[ri][ci].gear;
      if (!gear) continue;
      const def = GEAR_DEFS[gear.gearType];
      if (!def || def.subtype !== "harvest_bell") continue;
      if (isExpired(gear, now)) continue;

      for (const [ar, ac] of affectedCells(gear.gearType, ri, ci, rows, cols)) {
        const targetPlot = cur.grid[ar]?.[ac];
        if (!targetPlot?.plant) continue;
        // Only harvest plants with bloomedAt stamped AND past the 5-second grace
        if (!targetPlot.plant.bloomedAt || now - targetPlot.plant.bloomedAt < 5_000) continue;

        const { speciesId, mutation } = targetPlot.plant;
        const mut = mutation ?? null;

        // Remove plant from grid
        const newGrid = cur.grid.map((row, rr) =>
          row.map((p, cc) => rr === ar && cc === ac ? { ...p, plant: null } : p)
        );

        // Add bloom to inventory
        const existIdx = cur.inventory.findIndex(
          i => !i.isSeed && i.speciesId === speciesId && (i.mutation ?? null) === mut
        );
        const newInv: InvItem[] = existIdx >= 0
          ? cur.inventory.map((i, idx) => idx === existIdx ? { ...i, quantity: i.quantity + 1 } : i)
          : [...cur.inventory, { speciesId, quantity: 1, isSeed: false, mutation: mut }];

        // Update discovered
        const newDiscovered = [...cur.discovered];
        if (!newDiscovered.includes(speciesId)) newDiscovered.push(speciesId);
        if (mut) {
          const key = `${speciesId}:${mut}`;
          if (!newDiscovered.includes(key)) newDiscovered.push(key);
        }

        cur = { ...cur, grid: newGrid, inventory: newInv, discovered: newDiscovered };
      }
    }
  }

  return cur;
}

// ── Auto-planter ───────────────────────────────────────────────────────────
function pickBestSeed(inventory: InvItem[]): string | null {
  const seeds = inventory.filter(i => i.isSeed && i.quantity > 0);
  if (!seeds.length) return null;
  return seeds.reduce((a, b) => b.quantity > a.quantity ? b : a).speciesId;
}

function runAutoPlanter(save: Save, now: number): Save {
  let cur = save;
  const rows = save.grid.length;
  const cols = save.grid[0]?.length ?? 0;

  for (let ri = 0; ri < rows; ri++) {
    for (let ci = 0; ci < cols; ci++) {
      const gear = cur.grid[ri][ci].gear;
      if (!gear) continue;
      const def = GEAR_DEFS[gear.gearType];
      if (!def || def.subtype !== "auto_planter") continue;
      if (isExpired(gear, now)) continue;

      for (const [ar, ac] of affectedCells(gear.gearType, ri, ci, rows, cols)) {
        const targetPlot = cur.grid[ar]?.[ac];
        if (!targetPlot || targetPlot.plant || targetPlot.gear) continue;

        const speciesId = pickBestSeed(cur.inventory);
        if (!speciesId) return cur; // no seeds left

        // Deduct seed
        const newInv = cur.inventory
          .map(i => i.isSeed && i.speciesId === speciesId ? { ...i, quantity: i.quantity - 1 } : i)
          .filter(i => i.quantity > 0);

        // Plant seed
        const newGrid = cur.grid.map((row, rr) =>
          row.map((p, cc) =>
            rr === ar && cc === ac
              ? { ...p, plant: { speciesId, timePlanted: now, growthMs: 0, lastTickAt: now } }
              : p
          )
        );

        cur = { ...cur, grid: newGrid, inventory: newInv };
      }
    }
  }

  return cur;
}

// ── Weather mutations ──────────────────────────────────────────────────────
// Rolls weather-based mutations on all bloomed plants (same logic as
// tickWeatherMutations in gameStore.ts, but scaled to per-minute probability).
// Scarecrow protection is not applied here (server has no gear-coverage lookup);
// the worst case is an offline player gets a mutation they'd have been protected from.
function rollWeatherMutations(grid: Plot[][], weatherType: string, now: number): { grid: Plot[][]; changed: boolean } {
  if (!weatherType || weatherType === "clear") return { grid, changed: false };

  const mutType   = WEATHER_MUTATION_TYPE[weatherType];
  const mutChance = WEATHER_MUTATION_CHANCE_PER_MIN[weatherType] ?? 0;
  const night     = isNightUTC(now);
  let changed     = false;

  const next = grid.map(row => row.map(plot => {
    if (!plot.plant || !plot.plant.bloomedAt) return plot;

    // Thunderstorm combo: wet → shocked
    if (weatherType === "thunderstorm" && plot.plant.mutation === "wet") {
      if (Math.random() < THUNDERSTORM_SHOCKED_CHANCE_PER_MIN) {
        changed = true;
        return { ...plot, plant: { ...plot.plant, mutation: "shocked" } };
      }
      return plot;
    }

    // Skip already-mutated plants (string = assigned; null = Giant-tried, weather can still apply)
    if (typeof plot.plant.mutation === "string") return plot;

    // Thunderstorm: null/undefined → wet
    if (weatherType === "thunderstorm" && plot.plant.mutation == null) {
      if (Math.random() < THUNDERSTORM_WET_CHANCE_PER_MIN) {
        changed = true;
        return { ...plot, plant: { ...plot.plant, mutation: "wet" } };
      }
      return plot;
    }

    // Standard weather mutation roll
    if (mutType && mutChance > 0 && Math.random() < mutChance) {
      changed = true;
      return { ...plot, plant: { ...plot.plant, mutation: mutType } };
    }

    // Moonlit at night (outside star_shower)
    if (night && weatherType !== "star_shower" && plot.plant.mutation === undefined) {
      if (Math.random() < MOONLIT_NIGHT_CHANCE_PER_MIN) {
        changed = true;
        return { ...plot, plant: { ...plot.plant, mutation: "moonlit" } };
      }
    }

    return plot;
  }));

  return { grid: changed ? next : grid, changed };
}

// ── Main ───────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify the caller is the Supabase cron (which sends the service role key as bearer)
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = Date.now();

    // ── Fetch active weather for growth multiplier + mutation type ───────────
    let weatherMult = 1.0;
    let weatherType = "clear";
    try {
      const { data: wRow } = await supabase
        .from("weather")
        .select("type, started_at, ends_at")
        .eq("id", 1)
        .single();
      if (wRow && Date.parse(wRow.started_at) <= now && Date.parse(wRow.ends_at) >= now) {
        weatherType = wRow.type as string;
        weatherMult = WEATHER_MULT[weatherType] ?? 1.0;
      }
    } catch { /* non-critical — fall back to clear */ }

    // ── Fetch saves updated in the last 25 hours (max gear duration = 24 h) ──
    const cutoff = new Date(now - 25 * 60 * 60 * 1_000).toISOString();
    const { data: saves, error: fetchErr } = await supabase
      .from("game_saves")
      .select("user_id, updated_at, grid, inventory, discovered")
      .gt("updated_at", cutoff);

    if (fetchErr || !saves) {
      return new Response(JSON.stringify({ error: fetchErr?.message ?? "fetch failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let scanned = 0, changed = 0;

    for (const raw of saves as Save[]) {
      scanned++;
      const grid = raw.grid as Plot[][];
      if (!grid?.length) continue;

      // Fast-path: skip saves that have nothing to do.
      // Process if: active harvest_bell/auto_planter gear, OR weather is active
      // and there are bloomed plants that could receive mutations.
      const hasActiveGear = grid.flat().some(plot => {
        if (!plot.gear) return false;
        const def = GEAR_DEFS[plot.gear.gearType];
        return !!def && !isExpired(plot.gear, now);
      });
      const hasBloomedForMutation = weatherType !== "clear" &&
        grid.flat().some(plot => plot.plant && hasBloom(plot.plant, now, weatherMult));
      if (!hasActiveGear && !hasBloomedForMutation) continue;

      const original: Save = {
        user_id:    raw.user_id,
        updated_at: raw.updated_at,
        grid,
        inventory:  (raw.inventory  ?? []) as InvItem[],
        discovered: (raw.discovered ?? []) as string[],
      };

      // 1. Stamp bloomedAt so harvest bell + mutations can find ready plants
      const { grid: stamped, changed: stampChanged } = stampBloomed(original.grid, now, weatherMult);
      let sim = stampChanged ? { ...original, grid: stamped } : original;

      // 2. Roll weather mutations on bloomed plants
      const { grid: mutGrid, changed: mutChanged } = rollWeatherMutations(sim.grid, weatherType, now);
      if (mutChanged) sim = { ...sim, grid: mutGrid };

      // 3. Harvest bell
      sim = runHarvestBells(sim, now);

      // 4. Auto-planter
      sim = runAutoPlanter(sim, now);

      // Skip if nothing actually changed
      if (sim.grid === original.grid &&
          sim.inventory === original.inventory &&
          sim.discovered === original.discovered) continue;

      // Write back — optimistic lock on updated_at to avoid stomping concurrent client saves
      const { error: writeErr } = await supabase
        .from("game_saves")
        .update({
          grid:       sim.grid,
          inventory:  sim.inventory,
          discovered: sim.discovered,
          updated_at: new Date(now).toISOString(),
        })
        .eq("user_id", sim.user_id)
        .eq("updated_at", original.updated_at); // only update if row hasn't changed

      if (!writeErr) changed++;
    }

    return new Response(
      JSON.stringify({ ok: true, scanned, changed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("tick-offline-gardens error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
