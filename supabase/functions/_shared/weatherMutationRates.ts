// Per-tick (1-second) base mutation chances — single source of truth for both
// online (tickWeatherMutations in gameStore) and offline (tick-offline-gardens cron).
// Offline path derives per-minute equivalents using perMinChance() below.
//
// ⚠️  Keep in sync with src/data/weatherMutationRates.ts (frontend copy).
//     Supabase bundler cannot reach outside supabase/functions/, so both files
//     must exist. When changing rates, update both.
export const WEATHER_MUT_CHANCE_PER_TICK: Record<string, number> = {
  rain:            0.001,    // ~70% over 20-min event
  heatwave:        0.00057,  // ~40% over 15-min event
  cold_front:      0.00057,  // ~40% over 15-min event
  star_shower:     0.000213, // ~20% over 17.5-min event
  prismatic_skies: 0.000248, // ~20% over 15-min event
  golden_hour:     0.000248, // ~20% over 15-min event
  tornado:         0.002,    // ~70% over 10-min event (600 ticks)
};

// Thunderstorm two-step chain: unmutated → wet → shocked (no direct →shocked path)
export const THUNDERSTORM_WET_CHANCE_PER_TICK     = 0.001;    // null/undefined → wet (~70% over 20 min)
export const THUNDERSTORM_SHOCKED_CHANCE_PER_TICK = 0.000578; // wet → shocked (~50% over 20 min)

// Moonlit at night outside star_shower (~15% over 10-hour night)
export const MOONLIT_NIGHT_CHANCE_PER_TICK = 0.0000045;

/** Convert a per-tick (1-second) probability to an equivalent per-minute probability. */
export function perMinChance(p: number): number {
  if (p >= 1) return 1;
  return 1 - Math.pow(1 - p, 60);
}
