import { RARITY_CONFIG, type Rarity } from "../data/flowers";
import { ESSENCE_YIELD } from "../data/essences";

interface Props {
  onClose: () => void;
}

const RARITY_ORDER: Rarity[] = [
  "common", "uncommon", "rare", "legendary", "mythic", "exalted", "prismatic",
];

/** Modal showing the rarity → essence units per flower table. Replaces the
 *  inline yield table that used to live in the Alchemy → Essences view; now
 *  surfaced as a "📊 Yield rates" button on the Sacrifice view. */
export function YieldTableModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-border flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-base text-foreground leading-tight">
              📊 Essence yield rates
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Units of essence per flower sacrificed, by rarity.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none pt-0.5"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Table */}
        <div className="px-5 py-4 space-y-1.5">
          {RARITY_ORDER.map((rarity) => {
            const cfg = RARITY_CONFIG[rarity];
            return (
              <div key={rarity} className="flex items-center justify-between text-xs">
                <span className={cfg.color}>{cfg.label}</span>
                <span className="text-muted-foreground font-mono">
                  {ESSENCE_YIELD[rarity]} per flower
                </span>
              </div>
            );
          })}
        </div>

        {/* Done */}
        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl font-semibold text-sm text-center bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
