import { useState, useRef, useLayoutEffect } from "react";
import { GEAR, isGearExpired, type PlacedGear, type FanDirection } from "../data/gear";
import { MUTATIONS, RARITY_CONFIG } from "../data/flowers";
import { FERTILIZERS } from "../data/upgrades";
import { removeGear, collectFromComposter, setFanDirection } from "../store/gameStore";
import { useGame } from "../store/GameContext";
import { edgeRemoveGear, edgeCollectFromComposter } from "../lib/edgeFunctions";

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
  const { state, perform, update } = useGame();
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

  // Map rarity text-color class → background-color class for the expiry bar.
  // Prismatic uses "rainbow-text" which doesn't follow text-* and whose rainbow-bg
  // keyframes are only 12% opacity (designed for tile backgrounds, not bar fills).
  const rarityBarBg = rarity.color === "rainbow-text"
    ? "bg-gradient-to-r from-pink-400 via-violet-400 to-sky-400"
    : rarity.color === "text-black"
      ? "bg-slate-300"
      : rarity.color.replace("text-", "bg-");

  const msRemaining    = def.durationMs ? Math.max(0, gear.placedAt + def.durationMs - now) : null;
  const expiryProgress = (def.durationMs && msRemaining !== null)
    ? msRemaining / def.durationMs
    : null;
  const expired = isGearExpired(gear, now);

  const stored      = gear.storedFertilizers ?? [];
  const hasStored   = stored.length > 0;
  const maxStorage  = def.maxStorage ?? 10;

  function handleRemove() {
    const optimistic = removeGear(state, row, col);
    if (!optimistic) return;
    const savedGear = gear; // captured at click time
    perform(
      optimistic,
      () => edgeRemoveGear(row, col),
      undefined,
      {
        rollback: (cur) => ({
          ...cur,
          grid: cur.grid.map((r2, ri) =>
            r2.map((p, ci) =>
              ri === row && ci === col ? { ...p, gear: savedGear } : p
            )
          ),
        }),
      }
    );
    onClose?.();
  }

  function handleCollect() {
    const optimistic = collectFromComposter(state, row, col);
    if (!optimistic) return;
    const storedTypes = gear.storedFertilizers ?? [];
    perform(
      optimistic,
      () => edgeCollectFromComposter(row, col),
      undefined,
      {
        rollback: (cur) => {
          // Count how many of each fertilizer type were collected
          const countByType = storedTypes.reduce<Record<string, number>>((acc, t) => {
            acc[t] = (acc[t] ?? 0) + 1;
            return acc;
          }, {});
          return {
            ...cur,
            grid: cur.grid.map((r2, ri) =>
              r2.map((p, ci) =>
                ri === row && ci === col
                  ? { ...p, gear: { ...p.gear!, storedFertilizers: storedTypes } }
                  : p
              )
            ),
            fertilizers: cur.fertilizers
              .map((f) =>
                countByType[f.type]
                  ? { ...f, quantity: f.quantity - (countByType[f.type] ?? 0) }
                  : f
              )
              .filter((f) => f.quantity > 0),
          };
        },
      }
    );
    onClose?.();
  }

  function handleFanDirection(dir: FanDirection) {
    const next = setFanDirection(state, row, col, dir);
    if (next) update(next);
  }

  const isFan = def.passiveSubtype === "fan";

  return (
    <div
      ref={tooltipRef}
      className={`absolute ${flipped ? "top-full mt-2" : "bottom-full mb-2"} left-1/2 z-40 pointer-events-none`}
      style={{ transform: `translateX(calc(-50% + ${nudge}px))` }}
    >
      <div className="pointer-events-auto bg-card/80 backdrop-blur-sm border border-border rounded-xl p-3 shadow-xl w-52 space-y-2">

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

        {/* Fan direction picker */}
        {isFan && (
          <div className="pt-1 border-t border-border space-y-1.5">
            <p className="text-[10px] text-muted-foreground">Direction</p>
            <div className="grid grid-cols-3 gap-1">
              <div />
              <button
                onClick={() => handleFanDirection("up")}
                className={`py-1 rounded-lg text-xs font-bold transition-all text-center ${
                  gear.direction === "up"
                    ? "bg-primary/20 border border-primary/40 text-primary"
                    : "bg-white/5 border border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >↑</button>
              <div />
              <button
                onClick={() => handleFanDirection("left")}
                className={`py-1 rounded-lg text-xs font-bold transition-all text-center ${
                  gear.direction === "left"
                    ? "bg-primary/20 border border-primary/40 text-primary"
                    : "bg-white/5 border border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >←</button>
              <div className="flex items-center justify-center text-base">💨</div>
              <button
                onClick={() => handleFanDirection("right")}
                className={`py-1 rounded-lg text-xs font-bold transition-all text-center ${
                  gear.direction === "right"
                    ? "bg-primary/20 border border-primary/40 text-primary"
                    : "bg-white/5 border border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >→</button>
              <div />
              <button
                onClick={() => handleFanDirection("down")}
                className={`py-1 rounded-lg text-xs font-bold transition-all text-center ${
                  gear.direction === "down"
                    ? "bg-primary/20 border border-primary/40 text-primary"
                    : "bg-white/5 border border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >↓</button>
              <div />
            </div>
          </div>
        )}

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
                  className={`h-full rounded-full ${rarityBarBg}`}
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
            🗑 Destroy {def.passiveSubtype === "composter" && hasStored ? "(returns fertilizers)" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
