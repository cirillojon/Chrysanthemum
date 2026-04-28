import { createPortal } from "react-dom";
import { RARITY_CONFIG } from "../data/flowers";
import type { Rarity } from "../data/flowers";

export interface RateRow {
  rarity:       Rarity;
  weight:       number;
  /** Slot-gated: shows 🔒 + unlock hint */
  unlocksAt?:   string;
  /** Genuinely absent from this shop — shows a dash instead of a bar */
  unavailable?: boolean;
}

interface Props {
  title:     string;
  subtitle?: string;
  rows:      RateRow[];
  onClose:   () => void;
}

/** Explicit Tailwind class names so the JIT includes every colour. */
function rarityBgClass(rarity: Rarity): string {
  switch (rarity) {
    case "common":    return "bg-gray-400";
    case "uncommon":  return "bg-green-400";
    case "rare":      return "bg-blue-400";
    case "legendary": return "bg-yellow-400";
    case "mythic":    return "bg-pink-400";
    case "exalted":   return "bg-slate-300";
    case "prismatic": return "rainbow-bg";   // custom CSS animation class
  }
}

export function RatesModal({ title, subtitle, rows, onClose }: Props) {
  const eligible    = rows.filter((r) => !r.unlocksAt && !r.unavailable);
  const totalWeight = eligible.reduce((s, r) => s + r.weight, 0);

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl p-5 w-80 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-sm">{title}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xs leading-none flex-shrink-0 mt-0.5"
          >
            ✕
          </button>
        </div>

        {/* Rate rows */}
        <div className="space-y-2.5">
          {rows.map(({ rarity, weight, unlocksAt, unavailable }) => {
            const cfg = RARITY_CONFIG[rarity];
            const pct = (unlocksAt || unavailable || totalWeight === 0)
              ? 0
              : (weight / totalWeight) * 100;

            const dimmed = !!(unlocksAt || unavailable);

            return (
              <div key={rarity} className={dimmed ? "opacity-40" : ""}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-mono font-semibold ${cfg.color}`}>
                    {cfg.label}
                  </span>
                  {unlocksAt ? (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      🔒 {unlocksAt}
                    </span>
                  ) : unavailable ? (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  ) : (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {pct.toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${rarityBgClass(rarity)}`}
                    style={{ width: dimmed ? "0%" : `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground leading-snug">
          Rates are per slot roll. Each restock independently re-rolls all slots.
        </p>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
