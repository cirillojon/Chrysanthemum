import { useState, useEffect } from "react";
import type { DayPeriodDefinition } from "../data/dayNight";

interface Props {
  period: DayPeriodDefinition;
}

function overlayStyle(period: DayPeriodDefinition): React.CSSProperties {
  if (!period.overlayColor || period.overlayOpacity === 0) return { opacity: 0 };
  const color = period.overlayColor.replace("VAL", String(period.overlayOpacity));
  switch (period.id) {
    case "dawn":
      return { background: `linear-gradient(to top, ${color} 0%, transparent 60%)` };
    case "sunset":
      return { background: `linear-gradient(to top, ${color} 0%, transparent 70%)` };
    case "dusk":
      return { background: `linear-gradient(to bottom, ${color} 0%, transparent 60%)` };
    default:
      return { background: color };
  }
}

export function DayNightOverlay({ period }: Props) {
  const [current,  setCurrent]  = useState(period);
  const [previous, setPrevious] = useState<DayPeriodDefinition | null>(null);
  const [fading,   setFading]   = useState(false);

  useEffect(() => {
    if (period.id === current.id) return;

    // Start cross-fade: keep old period visible while new one fades in
    setPrevious(current);
    setFading(true);
    setCurrent(period);

    const timer = setTimeout(() => {
      setPrevious(null);
      setFading(false);
    }, 3_000);

    return () => clearTimeout(timer);
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Outgoing period — fades to 0 */}
      {previous && (
        <div
          className="pointer-events-none fixed inset-0 z-10"
          style={{
            ...overlayStyle(previous),
            opacity:    fading ? 0 : 1,
            transition: "opacity 3000ms ease-in-out",
          }}
        />
      )}
      {/* Incoming period — fades in from 0 */}
      <div
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          ...overlayStyle(current),
          opacity:    fading ? 1 : 1,
          transition: "opacity 3000ms ease-in-out",
        }}
      />
    </>
  );
}
