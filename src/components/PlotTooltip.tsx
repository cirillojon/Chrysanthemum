import { useState } from "react";
import {
  type PlantedFlower,
  getCurrentStage,
  getMsUntilNextStage,
  applyFertilizer,
  removePlant,
} from "../store/gameStore";
import { edgeApplyFertilizer, edgeRemovePlant } from "../lib/edgeFunctions";
import { getFlower, RARITY_CONFIG, MUTATIONS } from "../data/flowers";
import { FERTILIZERS, type FertilizerType } from "../data/upgrades";
import { useGame } from "../store/GameContext";

interface Props {
  plant: PlantedFlower;
  row: number;
  col: number;
  onClose?: () => void;
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

export function PlotTooltip({ plant, row, col, onClose }: Props) {
  const { state, getState, perform, activeWeather } = useGame();
  const [showFertPicker,  setShowFertPicker]  = useState(false);
  const [confirmRemove,   setConfirmRemove]   = useState(false);
  const [removing,        setRemoving]        = useState(false);

  const now     = Date.now();
  const species = getFlower(plant.speciesId);
  if (!species) return null;

  const stage         = getCurrentStage(plant, now, activeWeather);
  const msLeft        = getMsUntilNextStage(plant, now, activeWeather);
  const rarity        = RARITY_CONFIG[species.rarity];
  const isBloomed     = stage === "bloom";
  const hasFertilizer = !!plant.fertilizer;
  const availableFerts = state.fertilizers
    .filter((f) => f.quantity > 0)
    .sort((a, b) => FERTILIZERS[a.type].speedMultiplier - FERTILIZERS[b.type].speedMultiplier);

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
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-40 pointer-events-none">
      <div className="pointer-events-auto bg-card border border-border rounded-xl p-3 shadow-xl w-48 space-y-2">

        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-xl">{species.emoji[stage]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold leading-tight">{species.name}</p>
            <p className={`text-[10px] font-mono ${rarity.color}`}>{rarity.label}</p>
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
                    className="flex-1 text-[10px] py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-40"
                  >
                    {removing ? "Removing..." : "Yes, remove"}
                  </button>
                  <button
                    onClick={() => setConfirmRemove(false)}
                    className="flex-1 text-[10px] py-1 rounded-lg bg-card border border-border text-muted-foreground hover:border-primary/30 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setShowFertPicker(false); setConfirmRemove(true); }}
                className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors w-full text-left"
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
