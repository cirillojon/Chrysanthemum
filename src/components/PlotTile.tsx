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
import { GEAR, isGearExpired, type FanDirection } from "../data/gear";
import { PlotTooltip } from "./PlotTooltip";
import { GearTooltip } from "./GearTooltip";
import { useGame } from "../store/GameContext";
import { useSettings } from "../store/SettingsContext";
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
  /** True when this cell is covered by at least one active regular (growth) sprinkler. */
  isUnderSprinkler?: boolean;
  /** Mutation emojis from any active mutation sprinklers covering this cell. */
  sprinklerMutations?: string[];
  /** True when this cell is within a scarecrow's radius. */
  isUnderScarecrow?: boolean;
  /** True when this cell is within a composter's radius. */
  isUnderComposter?: boolean;
  /** True when this cell is within a grow lamp's radius. */
  isUnderGrowLamp?: boolean;
  /** True when this cell is within a fan's range. */
  isUnderFan?: boolean;
  /** Direction the fan covering this cell is blowing. */
  fanDirection?: FanDirection;
  /** True when this cell is within a harvest bell's radius. */
  isUnderHarvestBell?: boolean;
  /** Called when this cell's gear tooltip opens — lets Garden highlight affected cells. */
  onGearInspect?:      (row: number, col: number, gearType: import("../data/gear").GearType) => void;
  onGearInspectClose?: () => void;
  cellSize?:       string;
}

export function PlotTile({
  plot, row, col,
  onEmptyClick, onHarvest, onHarvestStart, onHarvestEnd, harvestPending,
  isSelected, isHighlighted,
  isUnderSprinkler, sprinklerMutations = [],
  isUnderScarecrow, isUnderComposter, isUnderGrowLamp,
  isUnderFan, fanDirection, isUnderHarvestBell,
  onGearInspect, onGearInspectClose,
  cellSize = "w-16 h-16",
}: Props) {
  const { perform, getState, activeWeather } = useGame();
  const { settings } = useSettings();
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
        if (gearOpen) { setGearOpen(false); onGearInspectClose?.(); }
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
            const next = !gearOpen;
            setGearOpen(next);
            if (next) onGearInspect?.(row, col, gear.gearType);
            else      onGearInspectClose?.();
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
          isUnderSprinkler={isUnderSprinkler}
          sprinklerMutations={sprinklerMutations}
          isUnderGrowLamp={isUnderGrowLamp}
          isUnderScarecrow={isUnderScarecrow}
          isUnderComposter={isUnderComposter}
          isUnderFan={isUnderFan}
          isUnderHarvestBell={isUnderHarvestBell}
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
        {/* ── Gear ambient animation overlay (clipped to cell) ── */}
        {settings.plotAnimations && (isUnderSprinkler || sprinklerMutations.length > 0 || isUnderGrowLamp || isUnderScarecrow || isUnderComposter || isUnderFan) && (
          <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
            {/* Grow lamp: warm amber glow */}
            {isUnderGrowLamp && <div className="absolute inset-0 gear-lamp-glow" />}
            {/* Sprinkler: 💧 drops falling */}
            {isUnderSprinkler && (
              <>
                <span className="gear-drop" style={{ left: "15%", animationDelay: "0s"   }}>💧</span>
                <span className="gear-drop" style={{ left: "48%", animationDelay: "0.6s" }}>💧</span>
                <span className="gear-drop" style={{ left: "74%", animationDelay: "1.2s" }}>💧</span>
              </>
            )}
            {/* Mutation sprinkler: emoji floating up, 2 per mutation type */}
            {sprinklerMutations.flatMap((emoji, mi) => [
              <span key={`m${mi}a`} className="gear-float" style={{ left: `${16 + mi * 28}%`, animationDelay: `${mi * 0.5}s`       }}>{emoji}</span>,
              <span key={`m${mi}b`} className="gear-float" style={{ left: `${40 + mi * 28}%`, animationDelay: `${mi * 0.5 + 1.1}s` }}>{emoji}</span>,
            ])}
            {/* Scarecrow: 🐦 birds fluttering away */}
            {isUnderScarecrow && (
              <>
                <span className="gear-bird" style={{ left: "10%", animationDelay: "0s"   }}>🐦</span>
                <span className="gear-bird" style={{ left: "52%", animationDelay: "1.5s" }}>🐦</span>
              </>
            )}
            {/* Composter: ✦ sparkles rising */}
            {isUnderComposter && (
              <>
                <span className="gear-compost-spark" style={{ left: "18%", animationDelay: "0s"    }}>✦</span>
                <span className="gear-compost-spark" style={{ left: "50%", animationDelay: "0.75s" }}>✦</span>
                <span className="gear-compost-spark" style={{ left: "76%", animationDelay: "1.5s"  }}>✦</span>
              </>
            )}
            {/* Fan: 💨 gusts drifting in the fan's direction */}
            {isUnderFan && (() => {
              const dir  = fanDirection ?? "right";
              const cls  = `gear-wind-${dir}`;
              const horiz = dir === "left" || dir === "right";
              const axis  = horiz ? "top" : "left";
              return (["18%", "50%", "76%"] as const).map((pos, i) => (
                <span key={i} className={cls} style={{ [axis]: pos, animationDelay: `${i * 0.65}s` }}>💨</span>
              ));
            })()}
          </div>
        )}

        <span className="text-2xl leading-none">
          {species?.emoji[stage!] ?? "🌱"}
        </span>

        {/* Fertilizer indicator — top-left */}
        {settings.plotFertilizerIndicator && hasFert && !isBloomed && (
          <span className="absolute top-0.5 left-0.5 text-[10px] leading-none">
            {FERTILIZERS[(plant as PlantedFlower).fertilizer!].emoji}
          </span>
        )}

        {/* ⚡ Mastery bonus indicator — top-right */}
        {settings.plotMasteryIndicator && (plant as PlantedFlower).masteredBonus && (
          <span
            className="absolute top-0.5 right-0.5 text-[10px] leading-none text-yellow-400"
            title="Mastered — grows 20% faster"
          >
            ⚡
          </span>
        )}

        {/* Gear effect indicators — bottom-left row */}
        {settings.plotGearIndicator && (isUnderSprinkler || sprinklerMutations.length > 0 || isUnderScarecrow || isUnderComposter || isUnderGrowLamp || isUnderFan || isUnderHarvestBell) && (
          <div className={`absolute left-0.5 flex leading-none ${isBloomed ? "bottom-1" : "bottom-2.5"}`}>
            {isUnderSprinkler && <span className="text-[9px]" title="Under sprinkler">💧</span>}
            {sprinklerMutations.map((emoji, i) => (
              <span key={i} className="text-[9px]" title="Mutation sprinkler">{emoji}</span>
            ))}
            {isUnderScarecrow && <span className="text-[9px]" title="Under scarecrow">🧹</span>}
            {isUnderComposter && <span className="text-[9px]" title="Near composter">🧺</span>}
            {isUnderGrowLamp && <span className="text-[9px]" title="Under grow lamp">💡</span>}
            {isUnderFan && <span className="text-[9px]" title="In fan range">💨</span>}
            {isUnderHarvestBell && <span className="text-[9px]" title="Auto-harvest active">🔔</span>}
          </div>
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
        {settings.plotMutationIndicator && isBloomed && (plant as PlantedFlower).mutation && (
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
