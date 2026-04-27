import { useState, useRef, useEffect } from "react";
import {
  type Plot,
  type PlantedFlower,
  getCurrentStage,
  getStageProgress,
  harvestPlant,
} from "../store/gameStore";
import { getFlower, RARITY_CONFIG, MUTATIONS, type MutationType } from "../data/flowers";
import { FERTILIZERS } from "../data/upgrades";
import { GEAR, isGearExpired } from "../data/gear";
import { PlotTooltip } from "./PlotTooltip";
import { GearTooltip } from "./GearTooltip";
import { useGame } from "../store/GameContext";
import { edgeHarvest } from "../lib/edgeFunctions";

interface Props {
  plot:            Plot;
  row:             number;
  col:             number;
  onEmptyClick:    () => void;
  onHarvest:       (speciesId: string, mutation?: MutationType) => void;
  onHarvestStart?: () => void;
  onHarvestEnd?:   () => void;
  /** Called at click time to check if this plot is already queued by Collect All. */
  harvestPending?: () => boolean;
  isSelected?:     boolean;
  /** True when this cell is within the radius of an inspected gear item. */
  isHighlighted?:  boolean;
  /** Called when this cell's gear tooltip opens — lets Garden highlight affected cells. */
  onGearInspect?:      (row: number, col: number, gearType: import("../data/gear").GearType) => void;
  onGearInspectClose?: () => void;
  cellSize?:       string;
}

export function PlotTile({
  plot, row, col,
  onEmptyClick, onHarvest, onHarvestStart, onHarvestEnd, harvestPending,
  isSelected, isHighlighted,
  onGearInspect, onGearInspectClose,
  cellSize = "w-16 h-16",
}: Props) {
  const { perform, getState, activeWeather } = useGame();
  const now    = Date.now();
  const plant  = plot.plant;
  const gear   = plot.gear;
  const species = plant ? getFlower(plant.speciesId) : null;

  const stage    = plant ? getCurrentStage(plant, now, activeWeather) : null;
  const progress = plant ? getStageProgress(plant, now, activeWeather) : 0;

  const rarity     = species ? RARITY_CONFIG[species.rarity] : null;
  const isBloomed  = stage === "bloom";
  const hasFert    = !!plant?.fertilizer;

  const [open,     setOpen]     = useState(false);
  const [gearOpen, setGearOpen] = useState(false);
  const tileRef       = useRef<HTMLDivElement>(null);
  const harvestingRef = useRef(false);

  useEffect(() => {
    if (!open && !gearOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (tileRef.current && !tileRef.current.contains(e.target as Node)) {
        setOpen(false);
        setGearOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, gearOpen]);

  useEffect(() => { if (!plant) setOpen(false); }, [plant]);
  useEffect(() => {
    if (!gear) { setGearOpen(false); onGearInspectClose?.(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gear]);

  function handleClick() {
    if (!plant) { onEmptyClick(); return; }
    if (isBloomed) {
      if (harvestingRef.current) return;
      if (harvestPending?.()) return;
      const currentState = getState();
      const optimistic   = harvestPlant(currentState, row, col, activeWeather);
      if (optimistic) {
        const savedCell         = currentState.grid[row][col];
        const harvestedSpecies  = savedCell.plant?.speciesId;
        const harvestedMutation = savedCell.plant?.mutation ?? undefined;
        harvestingRef.current = true;
        onHarvestStart?.();
        perform(
          optimistic.state,
          async () => {
            try { return await edgeHarvest(row, col, optimistic.mutation); }
            finally {
              harvestingRef.current = false;
              onHarvestEnd?.();
            }
          },
          () => { onHarvest(plant.speciesId, optimistic.mutation); },
          {
            serialize: true,
            rollback: (cur) => ({
              ...cur,
              grid: cur.grid.map((r, ri) =>
                r.map((p, ci) => ri === row && ci === col ? savedCell : p)
              ),
              inventory: harvestedSpecies
                ? cur.inventory
                    .map((item) =>
                      item.speciesId === harvestedSpecies &&
                      item.mutation  === harvestedMutation &&
                      !item.isSeed
                        ? { ...item, quantity: item.quantity - 1 }
                        : item
                    )
                    .filter((item) => item.quantity > 0)
                : cur.inventory,
            }),
          }
        );
        setOpen(false);
      }
      return;
    }
    setOpen((v) => !v);
  }

  // ── Gear tile ──────────────────────────────────────────────────────────────
  if (gear) {
    const def         = GEAR[gear.gearType];
    const gearRarity  = RARITY_CONFIG[def.rarity];
    const expired     = isGearExpired(gear, now);
    const storedCount = gear.storedFertilizers?.length ?? 0;

    const expiryProgress = def.durationMs
      ? Math.max(0, (gear.placedAt + def.durationMs - now) / def.durationMs)
      : null;

    return (
      <div ref={tileRef} className="relative">
        {gearOpen && (
          <GearTooltip
            gear={gear}
            row={row}
            col={col}
            onClose={() => { setGearOpen(false); onGearInspectClose?.(); }}
          />
        )}
        <button
          onClick={() => {
            setGearOpen((v) => {
              const next = !v;
              if (next) onGearInspect?.(row, col, gear.gearType);
              else      onGearInspectClose?.();
              return next;
            });
          }}
          className={`
            relative ${cellSize} rounded-xl border-2 transition-all duration-200
            flex flex-col items-center justify-center
            ${gearOpen
              ? `${gearRarity.borderBloom} ${gearRarity.bgBloom} scale-105`
              : `${gearRarity.borderBloom} ${gearRarity.bgBloom} hover:scale-105 hover:brightness-110 ${gearRarity.glow}`
            }
            ${expired ? "opacity-50" : ""}
            ${isHighlighted ? "ring-2 ring-primary/60" : ""}
          `}
          title={`${def.name} — ${def.rarity} — Click to inspect`}
        >
          <span className="text-2xl leading-none">{def.emoji}</span>

          {/* Mutation emoji overlay */}
          {def.category === "sprinkler_mutation" && def.mutationType && (
            <span className="absolute -bottom-1 -right-1 text-sm leading-none">
              {MUTATIONS[def.mutationType].emoji}
            </span>
          )}

          {/* Expiry progress bar */}
          {expiryProgress !== null && !expired && (
            <div className="absolute bottom-1 left-2 right-2 h-1 bg-border rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${gearRarity.color.replace("text-", "bg-")}`}
                style={{ width: `${expiryProgress * 100}%` }}
              />
            </div>
          )}

          {/* Composter stored count badge */}
          {def.passiveSubtype === "composter" && storedCount > 0 && (
            <span className="absolute top-0.5 right-0.5 text-[9px] font-mono font-bold text-primary leading-none">
              {storedCount}
            </span>
          )}

          {/* Highlighted ring overlay */}
          {isHighlighted && (
            <div className="absolute inset-0 rounded-xl bg-primary/10 pointer-events-none" />
          )}
        </button>
      </div>
    );
  }

  // ── Empty tile ─────────────────────────────────────────────────────────────
  if (!plant) {
    return (
      <div className="relative">
        <button
          onClick={onEmptyClick}
          className={`
            ${cellSize} rounded-xl border-2 transition-all duration-200
            flex items-center justify-center
            ${isSelected
              ? "border-primary bg-primary/20 scale-105"
              : "border-border bg-card/40 hover:bg-card/80 hover:border-primary/50 hover:scale-105"
            }
            ${isHighlighted ? "ring-2 ring-primary/60 bg-primary/10" : ""}
          `}
          title="Empty plot"
        >
          <span className="text-2xl opacity-30">＋</span>
          {isHighlighted && (
            <div className="absolute inset-0 rounded-xl bg-primary/10 pointer-events-none" />
          )}
        </button>
      </div>
    );
  }

  // ── Plant tile ─────────────────────────────────────────────────────────────
  return (
    <div ref={tileRef} className="relative">
      {open && !isBloomed && (
        <PlotTooltip
          plant={plant}
          row={row}
          col={col}
          onClose={() => setOpen(false)}
        />
      )}

      <button
        onClick={handleClick}
        className={`
          relative ${cellSize} rounded-xl border-2 transition-all duration-200
          flex flex-col items-center justify-center gap-0.5
          ${isBloomed
            ? `${rarity?.borderBloom ?? "border-primary/60"} ${rarity?.bgBloom ?? "bg-primary/10"} hover:scale-110 hover:brightness-125 cursor-pointer ${rarity?.glow}`
            : open
            ? `${rarity?.borderGrowing ?? "border-border/60"} bg-card/80 scale-105`
            : `${rarity?.borderGrowing ?? "border-border/60"} bg-card/60 hover:bg-card/80 cursor-pointer`
          }
          ${isHighlighted ? "ring-2 ring-primary/40" : ""}
        `}
        title={
          isBloomed
            ? `${species?.name} — Tap to harvest!`
            : open
            ? "Click to close"
            : `${species?.name} — Click for options`
        }
      >
        <span className="text-2xl leading-none">
          {species?.emoji[stage!] ?? "🌱"}
        </span>

        {/* Fertilizer indicator — top-left */}
        {hasFert && !isBloomed && (
          <span className="absolute top-0.5 left-0.5 text-[10px] leading-none">
            {FERTILIZERS[(plant as PlantedFlower).fertilizer!].emoji}
          </span>
        )}

        {/* ⚡ Mastery bonus indicator — top-right (only when growing) */}
        {!isBloomed && (plant as PlantedFlower).masteredBonus && (
          <span
            className="absolute top-0.5 right-0.5 text-[10px] leading-none text-yellow-400"
            title="Mastered — grows 20% faster"
          >
            ⚡
          </span>
        )}

        {/* Progress bar — bottom */}
        {!isBloomed && (
          <div className="absolute bottom-1 left-2 right-2 h-1 bg-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                hasFert ? "bg-green-400" : "bg-primary"
              }`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}

        {/* Bloom pulse dot — top-right */}
        {isBloomed && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full animate-pulse" />
        )}

        {/* Mutation emoji — bottom-right */}
        {isBloomed && (plant as PlantedFlower).mutation && (
          <span className="absolute -bottom-1 -right-1 text-sm leading-none">
            {MUTATIONS[(plant as PlantedFlower).mutation!].emoji}
          </span>
        )}

        {/* Tooltip-open indicator */}
        {open && !isBloomed && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary/60 rounded-full" />
        )}

        {/* Sprinkler-highlight ring overlay */}
        {isHighlighted && (
          <div className="absolute inset-0 rounded-xl bg-primary/10 pointer-events-none" />
        )}
      </button>
    </div>
  );
}
