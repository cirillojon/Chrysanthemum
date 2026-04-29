import { useState, useRef, useLayoutEffect } from "react";
import {
  type PlantedFlower,
  getCurrentStage,
  getMsUntilNextStage,
  applyFertilizer,
  removePlant,
} from "../store/gameStore";
import { edgeApplyFertilizer, edgeRemovePlant, edgeApplyInfuser } from "../lib/edgeFunctions";
import { getFlower, RARITY_CONFIG, MUTATIONS } from "../data/flowers";
import { FlowerTypeBadges } from "./FlowerTypeBadges";
import { FERTILIZERS, type FertilizerType } from "../data/upgrades";
import { useGame } from "../store/GameContext";

interface Props {
  plant:                 PlantedFlower;
  row:                   number;
  col:                   number;
  onClose?:              () => void;
  /** Called when the user clicks the Harvest button (for bloomed plants). */
  onHarvestRequest?:     () => void;
  /** Combined sprinkler × grow-lamp growth multiplier for this cell. */
  gearGrowthMultiplier?: number;
  isUnderSprinkler?:     boolean;
  sprinklerMutations?:   { emoji: string; label: string }[];
  isUnderGrowLamp?:      boolean;
  isUnderScarecrow?:     boolean;
  isUnderComposter?:     boolean;
  isUnderFan?:           boolean;
  isUnderHarvestBell?:   boolean;
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH > 0 ? `${d}d ${remH}h` : `${d}d`;
}

export function PlotTooltip({
  plant, row, col, onClose, onHarvestRequest,
  gearGrowthMultiplier = 1.0,
  isUnderSprinkler, sprinklerMutations = [],
  isUnderGrowLamp, isUnderScarecrow, isUnderComposter, isUnderFan, isUnderHarvestBell,
}: Props) {
  const { state, getState, perform, update, activeWeather } = useGame();
  const [showFertPicker,  setShowFertPicker]  = useState(false);
  const [confirmRemove,   setConfirmRemove]   = useState(false);
  const [removing,        setRemoving]        = useState(false);
  const [applyingInfuser, setApplyingInfuser] = useState(false);
  const [nudge,           setNudge]           = useState(0);
  const [flipped,         setFlipped]         = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw  = document.documentElement.clientWidth;
    const pad = 8;

    // Horizontal clamping
    if (rect.left < pad) {
      setNudge(pad - rect.left);
    } else if (rect.right > vw - pad) {
      setNudge(vw - pad - rect.right);
    }

    // Vertical: flip below the plot if tooltip is hidden behind the sticky nav
    const navEl = document.querySelector<HTMLElement>("[data-sticky-nav]");
    const navBottom = navEl ? navEl.getBoundingClientRect().bottom : 0;
    if (rect.top < navBottom + pad) {
      setFlipped(true);
    }
  }, []);

  const now     = Date.now();
  const species = getFlower(plant.speciesId);
  if (!species) return null;

  const stage         = getCurrentStage(plant, now, activeWeather, gearGrowthMultiplier);
  const msLeft        = getMsUntilNextStage(plant, now, activeWeather, gearGrowthMultiplier);
  const rarity        = RARITY_CONFIG[species.rarity];
  const isBloomed     = stage === "bloom";
  const hasFertilizer = !!plant.fertilizer;
  const availableFerts = state.fertilizers
    .filter((f) => f.quantity > 0)
    .sort((a, b) => FERTILIZERS[a.type].speedMultiplier - FERTILIZERS[b.type].speedMultiplier);

  // Infuser — find one that matches this flower's rarity
  const matchingInfuser = (state.infusers ?? []).find(
    (i) => i.rarity === species.rarity && i.quantity > 0
  );

  async function handleApplyInfuser() {
    if (applyingInfuser) return;
    setApplyingInfuser(true);
    try {
      const res = await edgeApplyInfuser(row, col);
      const cur = getState();
      update({ ...cur, grid: res.grid, infusers: res.infusers, serverUpdatedAt: res.serverUpdatedAt });
      onClose?.();
    } catch {
      // Server function not yet active or error — silently re-enable button
    } finally {
      setApplyingInfuser(false);
    }
  }

  function handleApplyFertilizer(type: FertilizerType) {
    const optimistic = applyFertilizer(state, row, col, type);
    if (optimistic) perform(optimistic, () => edgeApplyFertilizer(row, col, type));
    setShowFertPicker(false);
    onClose?.();
  }

  function handleRemove() {
    if (removing) return;
    const cur = getState();
    const optimistic = removePlant(cur, row, col);
    if (!optimistic) return;
    setRemoving(true);
    // Snapshot the cell for surgical rollback
    const savedCell = cur.grid[row][col];
    perform(
      optimistic,
      async () => {
        try {
          return await edgeRemovePlant(row, col);
        } finally {
          setRemoving(false);
        }
      },
      () => onClose?.(),
      {
        rollback: (c) => ({
          ...c,
          grid: c.grid.map((r, ri) =>
            r.map((p, ci) => ri === row && ci === col ? savedCell : p)
          ),
          // Undo the seed that was optimistically added back
          inventory: c.inventory
            .map((i) =>
              i.speciesId === plant.speciesId && i.isSeed
                ? { ...i, quantity: i.quantity - 1 }
                : i
            )
            .filter((i) => i.quantity > 0),
        }),
      }
    );
  }

  return (
    <div
      ref={tooltipRef}
      className={`absolute ${flipped ? "top-full mt-2" : "bottom-full mb-2"} left-1/2 z-40 pointer-events-none`}
      style={{ transform: `translateX(calc(-50% + ${nudge}px))` }}
    >
      <div className="pointer-events-auto bg-card/80 backdrop-blur-sm border border-border rounded-xl p-3 shadow-xl w-48 space-y-2">

        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-xl">{species.emoji[stage]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold leading-tight">{species.name}</p>
            <p className={`text-[10px] font-mono ${rarity.color}`}>{rarity.label}</p>
            <FlowerTypeBadges types={species.types} className="mt-1" />
          </div>
          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-xs flex-shrink-0 leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            Stage: <span className="text-foreground capitalize">{stage}</span>
          </p>
          {!isBloomed && (
            <p>
              Next stage in:{" "}
              <span className={`font-mono ${plant.masteredBonus ? "text-yellow-400" : "text-primary"}`}>
                {plant.masteredBonus ? "⚡ " : ""}{formatMs(msLeft)}
              </span>
            </p>
          )}
          {!isBloomed && plant.masteredBonus && (
            <p className="text-[10px] text-yellow-400/70 font-mono">mastered · 20% faster</p>
          )}
          {isBloomed && (
            <p className="text-primary font-semibold">Ready to harvest!</p>
          )}
          {isBloomed && plant.mutation && (() => {
            const mut = MUTATIONS[plant.mutation];
            return (
              <p className={`text-[10px] font-mono ${mut.color}`}>
                {mut.emoji} {mut.name} · ×{mut.valueMultiplier} value
              </p>
            );
          })()}
          {isBloomed && plant.mutation === null && (
            <p className="text-[10px] text-muted-foreground font-mono">No mutation</p>
          )}
        </div>

        {/* Bloomed actions — Harvest + Infuser */}
        {isBloomed && (
          <div className="pt-1 border-t border-border space-y-1.5">
            {onHarvestRequest && (
              <button
                onClick={() => { onHarvestRequest(); onClose?.(); }}
                className="w-full py-1.5 rounded-lg bg-primary/20 border border-primary/50 text-primary text-xs font-semibold hover:bg-primary/30 transition-colors"
              >
                Harvest
              </button>
            )}

            {plant.infused ? (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <span>🥢</span>
                <span className="text-[10px] text-emerald-400 font-medium">Infused · awaiting Cropsticks</span>
              </div>
            ) : matchingInfuser ? (
              <button
                onClick={handleApplyInfuser}
                disabled={applyingInfuser}
                className="w-full py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                {applyingInfuser ? "Applying…" : `🥢 Apply Infuser ×${matchingInfuser.quantity}`}
              </button>
            ) : (
              <p className="text-[10px] text-muted-foreground text-center">No matching Infuser in inventory</p>
            )}
          </div>
        )}

        {/* Active gear effects */}
        {(isUnderSprinkler || sprinklerMutations.length > 0 || isUnderGrowLamp || isUnderScarecrow || isUnderComposter || isUnderFan || isUnderHarvestBell) && (
          <div className="pt-1 border-t border-border space-y-1">
            <p className="text-[10px] text-muted-foreground">Active gear</p>

            {/* Chip labels */}
            <div className="flex flex-wrap gap-1">
              {isUnderGrowLamp && (
                <span className="relative inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-400/10 border border-amber-400/30 text-[10px] text-amber-300 overflow-hidden">
                  <div className="absolute inset-0 gear-lamp-glow pointer-events-none" />
                  <span className="relative">💡</span>
                  <span className="relative">Grow lamp</span>
                </span>
              )}
              {isUnderSprinkler && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-blue-400/10 border border-blue-400/20 text-[10px] text-blue-300">
                  <span>💧</span><span>Sprinkler</span>
                </span>
              )}
              {sprinklerMutations.map(({ emoji, label }, i) => (
                <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-blue-400/10 border border-blue-400/20 text-[10px] text-blue-300">
                  <span>{emoji}</span><span>{label}</span>
                </span>
              ))}
              {isUnderScarecrow && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-green-400/10 border border-green-400/20 text-[10px] text-green-300">
                  <span>🧹</span><span>Scarecrow</span>
                </span>
              )}
              {isUnderComposter && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-green-400/10 border border-green-400/20 text-[10px] text-green-300">
                  <span>🧺</span><span>Composter</span>
                </span>
              )}
              {isUnderFan && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-stone-400/10 border border-stone-400/20 text-[10px] text-stone-300">
                  <span>💨</span><span>Fan</span>
                </span>
              )}
              {isUnderHarvestBell && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-yellow-400/10 border border-yellow-400/20 text-[10px] text-yellow-300">
                  <span>🔔</span><span>Harvest Bell</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Fertilizer section */}
        {!isBloomed && (
          <div className="pt-1 border-t border-border">
            {hasFertilizer ? (
              <p className="text-[10px] text-green-400 font-mono">
                {FERTILIZERS[plant.fertilizer!].emoji}{" "}
                {FERTILIZERS[plant.fertilizer!].name} applied
              </p>
            ) : availableFerts.length > 0 ? (
              <>
                <button
                  onClick={() => setShowFertPicker((v) => !v)}
                  className="text-[10px] text-primary hover:underline w-full text-left"
                >
                  + Apply fertilizer
                </button>
                {showFertPicker && (
                  <div className="mt-1.5 space-y-1">
                    {availableFerts.map((f) => (
                      <button
                        key={f.type}
                        onClick={() => handleApplyFertilizer(f.type)}
                        className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors"
                      >
                        <span>{FERTILIZERS[f.type].emoji}</span>
                        <span className="text-[10px] text-foreground">
                          {FERTILIZERS[f.type].name}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          ×{f.quantity}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-[10px] text-muted-foreground">No fertilizer available</p>
            )}
          </div>
        )}

        {/* Remove section — only for growing (non-bloomed) plants */}
        {!isBloomed && (
          <div className="pt-1 border-t border-border">
            {confirmRemove ? (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Seed will be returned. Sure?</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={handleRemove}
                    disabled={removing}
                    className="flex-1 text-[10px] py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-40 text-center"
                  >
                    {removing ? "Removing..." : "Yes, remove"}
                  </button>
                  <button
                    onClick={() => setConfirmRemove(false)}
                    className="flex-1 text-[10px] py-1 rounded-lg bg-card border border-border text-muted-foreground hover:border-primary/30 transition-colors text-center"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setShowFertPicker(false); setConfirmRemove(true); }}
                className="text-[10px] text-red-400 hover:text-red-300 transition-colors w-full text-left"
              >
                🗑 Remove plant
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
