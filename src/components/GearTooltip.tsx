import { useState, useRef, useLayoutEffect } from "react";
import { GEAR, isGearExpired, type PlacedGear } from "../data/gear";
import { MUTATIONS, RARITY_CONFIG } from "../data/flowers";
import { FERTILIZERS } from "../data/upgrades";
import { removeGear, collectFromComposter } from "../store/gameStore";
import { useGame } from "../store/GameContext";

interface Props {
  gear:    PlacedGear;
  row:     number;
  col:     number;
  onClose?: () => void;
}

function formatMs(ms: number): string {
  if (ms <= 0) return "Expired";
  const s = Math.floor(ms / 1_000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
}

export function GearTooltip({ gear, row, col, onClose }: Props) {
  const { state, update } = useGame();
  const [nudge,   setNudge]   = useState(0);
  const [flipped, setFlipped] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw   = document.documentElement.clientWidth;
    const pad  = 8;
    if (rect.left < pad)        setNudge(pad - rect.left);
    else if (rect.right > vw - pad) setNudge(vw - pad - rect.right);

    const navEl    = document.querySelector<HTMLElement>("[data-sticky-nav]");
    const navBottom = navEl ? navEl.getBoundingClientRect().bottom : 0;
    if (rect.top < navBottom + pad) setFlipped(true);
  }, []);

  const now    = Date.now();
  const def    = GEAR[gear.gearType];
  const rarity = RARITY_CONFIG[def.rarity];

  const msRemaining    = def.durationMs ? Math.max(0, gear.placedAt + def.durationMs - now) : null;
  const expiryProgress = (def.durationMs && msRemaining !== null)
    ? msRemaining / def.durationMs
    : null;
  const expired = isGearExpired(gear, now);

  const stored      = gear.storedFertilizers ?? [];
  const hasStored   = stored.length > 0;
  const maxStorage  = def.maxStorage ?? 10;

  function handleRemove() {
    const next = removeGear(state, row, col);
    if (next) update(next);
    onClose?.();
  }

  function handleCollect() {
    const next = collectFromComposter(state, row, col);
    if (next) update(next);
    onClose?.();
  }

  return (
    <div
      ref={tooltipRef}
      className={`absolute ${flipped ? "top-full mt-2" : "bottom-full mb-2"} left-1/2 z-40 pointer-events-none`}
      style={{ transform: `translateX(calc(-50% + ${nudge}px))` }}
    >
      <div className="pointer-events-auto bg-card border border-border rounded-xl p-3 shadow-xl w-52 space-y-2">

        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-xl">{def.emoji}</span>
          {def.category === "sprinkler_mutation" && def.mutationType && (
            <span className="text-base leading-none">{MUTATIONS[def.mutationType].emoji}</span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold leading-tight">{def.name}</p>
            <p className={`text-[10px] font-mono ${rarity.color}`}>{rarity.label}</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-xs flex-shrink-0 leading-none"
            >
              ✕
            </button>
          )}
        </div>

        {/* Description */}
        <p className="text-[10px] text-muted-foreground leading-snug">{def.description}</p>

        {/* Expiry */}
        {msRemaining !== null && (
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">
              {expired
                ? <span className="text-red-400">Expired</span>
                : <>Time left: <span className="font-mono text-foreground">{formatMs(msRemaining)}</span></>
              }
            </p>
            {expiryProgress !== null && !expired && (
              <div className="h-1 bg-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${rarity.color.replace("text-", "bg-")}`}
                  style={{ width: `${expiryProgress * 100}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Composter stored fertilizers */}
        {def.passiveSubtype === "composter" && (
          <div className="pt-1 border-t border-border space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                Stored: <span className="text-foreground font-mono">{stored.length}/{maxStorage}</span>
              </p>
              {hasStored && (
                <button
                  onClick={handleCollect}
                  className="text-[10px] text-primary hover:underline"
                >
                  Collect
                </button>
              )}
            </div>
            {hasStored && (
              <div className="flex flex-wrap gap-1">
                {stored.map((t, i) => (
                  <span key={i} className="text-sm" title={FERTILIZERS[t].name}>
                    {FERTILIZERS[t].emoji}
                  </span>
                ))}
              </div>
            )}
            {!hasStored && (
              <p className="text-[10px] text-muted-foreground italic">
                Waiting for nearby blooms…
              </p>
            )}
          </div>
        )}

        {/* Remove */}
        <div className="pt-1 border-t border-border">
          <button
            onClick={handleRemove}
            className="text-[10px] text-red-400 hover:text-red-300 transition-colors w-full text-left"
          >
            🗑 Remove {def.passiveSubtype === "composter" && hasStored ? "(returns fertilizers)" : "(returns to inventory)"}
          </button>
        </div>
      </div>
    </div>
  );
}
