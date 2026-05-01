// Per-tick (1-second) base mutation chances — single source of truth for both
// online (tickWeatherMutations in gameStore) and offline (tick-offline-gardens cron).
// Offline path derives per-minute equivalents using perMinChance() below.
// All rates halved from their original v2.2 values to make weather mutations
// feel rarer / more special — getting "Wet" on every rain felt like noise
// rather than an event. ⚠️ Keep in sync with the server copy.
export const WEATHER_MUT_CHANCE_PER_TICK: Record<string, number> = {
  rain:            0.000333, // ~33% over 20-min event
  heatwave:        0.00019,  // ~16% over 15-min event
  cold_front:      0.00019,  // ~16% over 15-min event
  star_shower:     0.0000713, // ~7% over 17.5-min event
  prismatic_skies: 0.0000827, // ~7% over 15-min event
  golden_hour:     0.0000827, // ~7% over 15-min event
  tornado:         0.000667,  // ~33% over 10-min event (600 ticks)
};

// Thunderstorm two-step chain: unmutated → wet → shocked (no direct →shocked path)
export const THUNDERSTORM_WET_CHANCE_PER_TICK     = 0.000333; // null/undefined → wet (~33% over 20 min)
export const THUNDERSTORM_SHOCKED_CHANCE_PER_TICK = 0.000193; // wet → shocked (~21% over 20 min)

// Moonlit at night outside star_shower (~5% over 10-hour night)
export const MOONLIT_NIGHT_CHANCE_PER_TICK = 0.0000015;

/** Convert a per-tick (1-second) probability to an equivalent per-minute probability. */
export function perMinChance(p: number): number {
  if (p >= 1) return 1;
  return 1 - Math.pow(1 - p, 60);
}
