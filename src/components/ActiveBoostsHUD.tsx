import { useEffect, useState } from "react";
import type { ActiveBoost } from "../store/gameStore";

const BOOST_DISPLAY: Record<ActiveBoost["type"], { emoji: string; label: string }> = {
  growth:     { emoji: "🌿", label: "Verdant Rush" },
  craft:      { emoji: "⚒️", label: "Forge Haste" },
  attunement: { emoji: "🌀", label: "Resonance Draft" },
};

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface Props {
  activeBoosts: ActiveBoost[] | undefined;
}

/** Tiny HUD strip near the coin counter showing currently-active speed boosts.
 *  One badge per boost type; each shows emoji + remaining time, ticks every second.
 *  Renders nothing when no boosts are active. */
export function ActiveBoostsHUD({ activeBoosts }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const live = (activeBoosts ?? []).filter(
    (b) => new Date(b.expiresAt).getTime() > now,
  );

  if (live.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {live.map((b) => {
        const cfg       = BOOST_DISPLAY[b.type];
        const remaining = new Date(b.expiresAt).getTime() - now;
        return (
          <span
            key={b.type}
            title={`${cfg.label} — 2× speed (${formatRemaining(remaining)} left)`}
            className="flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300"
          >
            <span className="leading-none">{cfg.emoji}</span>
            <span>{formatRemaining(remaining)}</span>
          </span>
        );
      })}
    </div>
  );
}
