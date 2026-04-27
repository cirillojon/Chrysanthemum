import { useEffect, useState } from "react";
import { getCurrentPeriod, type DayPeriodDefinition } from "../data/dayNight";

function getEtHour(): number {
  // Weather period gating is anchored to Eastern Time (America/New_York),
  // which automatically handles EST (UTC-5) / EDT (UTC-4) DST transitions.
  return parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" })
      .format(new Date()),
    10
  ) % 24;
}

export interface TimeOfDay {
  period: DayPeriodDefinition;
  etHour: number;
  /** midnight (0–5) or night (21–24) */
  isNight: boolean;
  /** morning (7–11), midday (11–14), afternoon (14–17) */
  isDaytime: boolean;
  /** dawn (5–7), sunset (17–19), dusk (19–21) */
  isSunriseSunset: boolean;
}

/**
 * Returns the current Eastern-Time-based time-of-day period, updated every minute.
 *
 * All weather period gating (golden hour, prismatic skies, star shower) is
 * anchored to America/New_York — the server's advance_weather() SQL function
 * uses the same timezone. DST transitions are handled automatically.
 */
export function useTimeOfDay(): TimeOfDay {
  const [etHour, setEtHour] = useState<number>(() => getEtHour());

  useEffect(() => {
    const id = setInterval(() => setEtHour(getEtHour()), 60_000);
    return () => clearInterval(id);
  }, []);

  const period = getCurrentPeriod(etHour);

  return {
    period,
    etHour,
    isNight:         period.id === "midnight" || period.id === "night",
    isDaytime:       period.id === "morning"  || period.id === "midday" || period.id === "afternoon",
    isSunriseSunset: period.id === "dawn"     || period.id === "sunset" || period.id === "dusk",
  };
}
