import { useState, useEffect, useRef, useMemo } from "react";
import { useGame } from "../store/GameContext";
import { useGrowthTick } from "../hooks/useGrowthTick";
import { PlotTile } from "./PlotTile";
import { SeedPicker } from "./SeedPicker";
import { HarvestPopup } from "./HarvestPopup";
import {
  getCurrentStage,
  plantSeed,
  upgradeFarm,
  harvestPlant,
  plantAll,
  assignBloomMutations,
  tickWeatherMutations,
  tickSprinklerMutations,
  tickFanMutations,
  findHarvestBellTargets,
  findAutoPlantTargets,
  stampStageTransitions,
  placeGear,
} from "../store/gameStore";
import { edgePlantSeed, edgeUpgradeFarm, edgeHarvest, edgePlaceGear } from "../lib/edgeFunctions";
import { getNextUpgrade, getCurrentTier } from "../data/upgrades";
import { getAffectedCells, GEAR, isGearExpired } from "../data/gear";
import { MUTATIONS } from "../data/flowers";
import type { MutationType } from "../data/flowers";
import type { GearType, FanDirection } from "../data/gear";

export function Garden() {
  const { state, update, perform, getState, awaitHarvests, activeWeather } = useGame();
  useGrowthTick(5_000);

  // Every render: stamp transitions, roll weather mutations, roll sprinkler/fan mutations.
  // IMPORTANT: use getState() (the ref) not `state` (the React closure) as the starting point.
  // The closure can be stale when perform() has already advanced stateRef synchronously but
  // the React re-render hasn't flushed yet. Using the stale closure would write an old state
  // back through update(), wiping out any in-flight optimistic plants/harvests.
  useEffect(() => {
    const now     = Date.now();
    const weather = activeWeather ?? "clear";
    const latest  = getState();                            // always the freshest state
    let next = stampStageTransitions(latest, now, weather);
    next = tickWeatherMutations(next, weather);
    next = tickSprinklerMutations(next, weather);
    next = tickFanMutations(next, weather);
    next = assignBloomMutations(next, weather);
    if (next !== latest) update(next);

    // Bell harvests — throttled to 1 per GEAR_ACTION_INTERVAL_MS to prevent server races
    const bellTargets = findHarvestBellTargets(next, weather);
    const nowBell = Date.now();
    if (nowBell - lastBellActionRef.current >= GEAR_ACTION_INTERVAL_MS) {
      const bellTarget = bellTargets.find(({ row, col }) => !harvestingPlots.current.has(`${row}-${col}`));
      if (bellTarget) {
        const { row, col } = bellTarget;
        const key = `${row}-${col}`;
        lastBellActionRef.current = nowBell;
        harvestingPlots.current.add(key);
        const cur = getState();
        if (!cur.grid[row]?.[col]?.plant) {
          harvestingPlots.current.delete(key);
        } else {
          const savedCell          = cur.grid[row][col];
          const harvestedSpeciesId = savedCell.plant?.speciesId;
          const harvestedMutation  = savedCell.plant?.mutation ?? undefined;
          const opt = harvestPlant(cur, row, col, weather);
          if (!opt) {
            harvestingPlots.current.delete(key);
          } else {
            perform(
              opt.state,
              async () => {
                try {
                  return await edgeHarvest(row, col);
                } finally {
                  harvestingPlots.current.delete(key);
                }
              },
              undefined,
              {
                serialize: true,
                rollback: (c) => ({
                  ...c,
                  grid: c.grid.map((r2, ri2) =>
                    r2.map((p2, ci2) => ri2 === row && ci2 === col ? savedCell : p2)
                  ),
                  inventory: harvestedSpeciesId
                    ? c.inventory
                        .map((item) =>
                          item.speciesId === harvestedSpeciesId &&
                          item.mutation  === harvestedMutation  &&
                          !item.isSeed
                            ? { ...item, quantity: item.quantity - 1 }
                            : item
                        )
                        .filter((item) => item.quantity > 0)
                    : c.inventory,
                }),
              }
            );
          }
        }
      }
    }

    // Auto-Planter: throttled to 1 per GEAR_ACTION_INTERVAL_MS
    const plantTargets = findAutoPlantTargets(getState());
    const nowPlant = Date.now();
    if (nowPlant - lastPlanterActionRef.current >= GEAR_ACTION_INTERVAL_MS) {
      const plantTarget = plantTargets.find(({ row, col }) => !plantingPlots.current.has(`plant-${row}-${col}`));
      if (plantTarget) {
        const { row, col, speciesId } = plantTarget;
        const key = `plant-${row}-${col}`;
        lastPlanterActionRef.current = nowPlant;
        plantingPlots.current.add(key);
        const cur = getState();
        if (cur.grid[row]?.[col]?.plant || cur.grid[row]?.[col]?.gear) {
          plantingPlots.current.delete(key);
        } else {
          const opt = plantSeed(cur, row, col, speciesId);
          if (!opt) {
            plantingPlots.current.delete(key);
          } else {
            perform(
              opt,
              async () => {
                try {
                  // Discard grid + inventory from the server response — merging back
                  // would overwrite other in-flight optimistic plants.
                  await edgePlantSeed(row, col, speciesId);
                  return {};
                } finally {
                  plantingPlots.current.delete(key);
                }
              },
              undefined,
              {
                serialize: true,
                rollback: (c) => ({
                  ...c,
                  grid: c.grid.map((r2, ri2) =>
                    r2.map((p2, ci2) =>
                      ri2 === row && ci2 === col ? { ...p2, plant: null } : p2
                    )
                  ),
                  inventory: c.inventory.map((item) =>
                    item.speciesId === speciesId && item.isSeed
                      ? { ...item, quantity: item.quantity + 1 }
                      : item
                  ),
                }),
              }
            );
          }
        }
      }
    }
  });

  const [selectedPlot, setSelectedPlot]     = useState<{ row: number; col: number } | null>(null);
  const [harvestPopup, setHarvestPopup]     = useState<{ speciesId: string; mutation?: MutationType } | null>(null);
  /** Which gear cell has its tooltip open — used to highlight affected cells */
  const [highlightSource, setHighlightSource] = useState<{ row: number; col: number; gearType: GearType } | null>(null);
  /** Pending fan placement — waits for the player to choose a direction */
  const [pendingFan, setPendingFan] = useState<{ gearType: GearType; row: number; col: number } | null>(null);

  // Track plots with a harvest in-flight so we don't open the seed picker
  // before the server has removed the plant from the DB.
  const harvestingPlots = useRef<Set<string>>(new Set());
  // Track plots with an auto-plant in-flight to avoid duplicate edge calls
  const plantingPlots = useRef<Set<string>>(new Set());
  // Throttle gear auto-actions to 1 per interval to prevent server race conditions
  const lastBellActionRef    = useRef(0);
  const lastPlanterActionRef = useRef(0);
  const GEAR_ACTION_INTERVAL_MS = 1500; // 1 action per 1.5 s per gear type

  const nextUpgrade = getNextUpgrade(state.farmRows, state.farmSize);
  const currentTier = getCurrentTier(state.farmRows, state.farmSize);

  // Smaller cells on mobile for larger farm sizes
  const cellSize =
    state.farmSize <= 4 ? "w-16 h-16" :
    state.farmSize === 5 ? "w-15 h-15 sm:w-16 sm:h-16" :
    "w-11 h-11 sm:w-16 sm:h-16"; // 6+ cols: compact on mobile

  // Auto-clear highlightSource when the gear tile it's tracking is removed or expires.
  // This runs in Garden (the owner of highlightSource) rather than in PlotTile's useEffect
  // so we never call a parent's setState from a child effect (React 18 concurrent-mode warning).
  useEffect(() => {
    if (!highlightSource) return;
    const plot = state.grid[highlightSource.row]?.[highlightSource.col];
    if (!plot?.gear || plot.gear.gearType !== highlightSource.gearType) {
      setHighlightSource(null);
    }
  }, [state.grid, highlightSource]);

  // Cells highlighted by the currently-inspected gear item
  const highlightedCells = useMemo((): Set<string> => {
    if (!highlightSource) return new Set();
    const { row, col, gearType } = highlightSource;
    // Look up direction from the placed gear (needed for fans)
    const direction = state.grid[row]?.[col]?.gear?.direction;
    const affected = getAffectedCells(gearType, row, col, state.farmRows, state.farmSize, direction);
    return new Set(affected.map(([r, c]) => `${r}-${c}`));
  }, [highlightSource, state.farmRows, state.farmSize, state.grid]);

  // Per-cell gear coverage — used for plant indicator icons
  const { regularSprinklerKeys, mutationSprinklerMap, scarecrowCoveredCells, composterCoveredCells, growLampKeys, fanCoveredCells, harvestBellCoveredCells, autoPlantCoveredCells } =
    useMemo(() => {
      const regular  = new Set<string>();
      const mutation = new Map<string, string[]>(); // cellKey → unique mutation emojis
      const scarecrow = new Set<string>();
      const composter = new Set<string>();
      const growLamp  = new Set<string>();
      const fan        = new Map<string, FanDirection>();
      const harvestBell  = new Set<string>();
      const autoPlanter  = new Set<string>();
      const now = Date.now();
      for (let ri = 0; ri < state.grid.length; ri++) {
        for (let ci = 0; ci < state.grid[ri].length; ci++) {
          const g = state.grid[ri][ci].gear;
          if (!g || isGearExpired(g, now)) continue;
          const def     = GEAR[g.gearType];
          const affected = getAffectedCells(g.gearType, ri, ci, state.farmRows, state.farmSize, g.direction);
          const keys    = affected.map(([r, c]) => `${r}-${c}`);
          if (def.category === "sprinkler_regular") {
            keys.forEach((k) => regular.add(k));
          } else if (def.category === "sprinkler_mutation" && def.mutationType) {
            const emoji = MUTATIONS[def.mutationType as MutationType]?.emoji ?? "✨";
            keys.forEach((k) => {
              const existing = mutation.get(k);
              if (!existing) mutation.set(k, [emoji]);
              else if (!existing.includes(emoji)) existing.push(emoji);
            });
          } else if (def.passiveSubtype === "scarecrow") {
            keys.forEach((k) => scarecrow.add(k));
          } else if (def.passiveSubtype === "composter") {
            keys.forEach((k) => composter.add(k));
          } else if (def.passiveSubtype === "grow_lamp") {
            keys.forEach((k) => growLamp.add(k));
          } else if (def.passiveSubtype === "fan") {
            const dir = g.direction ?? "right";
            keys.forEach((k) => fan.set(k, dir));
          } else if (def.passiveSubtype === "harvest_bell") {
            keys.forEach((k) => harvestBell.add(k));
          } else if (def.passiveSubtype === "auto_planter") {
            keys.forEach((k) => autoPlanter.add(k));
          }
        }
      }
      return { regularSprinklerKeys: regular, mutationSprinklerMap: mutation, scarecrowCoveredCells: scarecrow, composterCoveredCells: composter, growLampKeys: growLamp, fanCoveredCells: fan, harvestBellCoveredCells: harvestBell, autoPlantCoveredCells: autoPlanter };
    }, [state.grid, state.farmRows, state.farmSize]);

  function handlePlotClick(row: number, col: number) {
    const plot = state.grid[row][col];
    if (!plot.plant && !harvestingPlots.current.has(`${row}-${col}`)) {
      setSelectedPlot({ row, col });
    }
  }

  function handleSeedSelect(speciesId: string) {
    if (!selectedPlot) return;
    const { row, col } = selectedPlot;
    const optimistic = plantSeed(state, row, col, speciesId);
    if (optimistic) perform(optimistic, () => edgePlantSeed(row, col, speciesId));
    setSelectedPlot(null);
  }

  function handleGearSelect(gearType: GearType) {
    if (!selectedPlot) return;
    const def = GEAR[gearType];
    if (def.passiveSubtype === "fan") {
      // Fan needs a direction — show direction picker first
      setPendingFan({ gearType, row: selectedPlot.row, col: selectedPlot.col });
      setSelectedPlot(null);
      return;
    }
    placeGearAt(selectedPlot.row, selectedPlot.col, gearType);
    setSelectedPlot(null);
  }

  function placeGearAt(row: number, col: number, gearType: GearType, direction?: FanDirection) {
    const optimistic = placeGear(getState(), row, col, gearType, direction);
    if (!optimistic) return;
    perform(
      optimistic,
      () => edgePlaceGear(row, col, gearType, direction),
      undefined,
      {
        rollback: (cur) => ({
          ...cur,
          grid: cur.grid.map((r2, ri) =>
            r2.map((p, ci) =>
              ri === row && ci === col ? { ...p, gear: null } : p
            )
          ),
          gearInventory: (cur.gearInventory ?? []).map((g) =>
            g.gearType === gearType ? { ...g, quantity: g.quantity + 1 } : g
          ),
        }),
      }
    );
  }

  function handleUpgrade() {
    const optimistic = upgradeFarm(state);
    if (optimistic) perform(optimistic, () => edgeUpgradeFarm());
  }

  function handleCollectAll() {
    const currentState = getState();
    const bloomed: { row: number; col: number }[] = [];
    for (let ri = 0; ri < currentState.grid.length; ri++) {
      for (let ci = 0; ci < currentState.grid[ri].length; ci++) {
        const p = currentState.grid[ri][ci];
        if (p.plant && getCurrentStage(p.plant, Date.now(), activeWeather) === "bloom") {
          bloomed.push({ row: ri, col: ci });
        }
      }
    }
    if (bloomed.length === 0) return;

    for (const { row, col } of bloomed) {
      if (harvestingPlots.current.has(`${row}-${col}`)) continue;
      harvestingPlots.current.add(`${row}-${col}`);

      const cur = getState();
      const opt = harvestPlant(cur, row, col, activeWeather);
      if (!opt) {
        harvestingPlots.current.delete(`${row}-${col}`);
        continue;
      }
      const savedCell           = cur.grid[row][col];
      const harvestedSpeciesId  = savedCell.plant?.speciesId;
      const harvestedMutation   = savedCell.plant?.mutation ?? undefined;
      perform(
        opt.state,
        async () => {
          try {
            return await edgeHarvest(row, col);
          } finally {
            harvestingPlots.current.delete(`${row}-${col}`);
          }
        },
        undefined,
        {
          serialize: true,
          rollback: (c) => ({
            ...c,
            grid: c.grid.map((r2, ri2) =>
              r2.map((p2, ci2) => ri2 === row && ci2 === col ? savedCell : p2)
            ),
            inventory: harvestedSpeciesId
              ? c.inventory
                  .map((item) =>
                    item.speciesId === harvestedSpeciesId &&
                    item.mutation  === harvestedMutation  &&
                    !item.isSeed
                      ? { ...item, quantity: item.quantity - 1 }
                      : item
                  )
                  .filter((item) => item.quantity > 0)
              : c.inventory,
          }),
        }
      );
    }
  }

  async function handlePlantAll() {
    await awaitHarvests();

    const currentState = getState();
    const optimistic = plantAll(currentState);
    if (optimistic === currentState) return;

    const prev = currentState;
    update(optimistic);

    const planted: { row: number; col: number; speciesId: string }[] = [];
    for (let ri = 0; ri < optimistic.grid.length; ri++) {
      for (let ci = 0; ci < optimistic.grid[ri].length; ci++) {
        const wasEmpty  = !currentState.grid[ri]?.[ci]?.plant;
        const nowFilled = optimistic.grid[ri]?.[ci]?.plant;
        if (wasEmpty && nowFilled) {
          planted.push({ row: ri, col: ci, speciesId: nowFilled.speciesId });
        }
      }
    }
    try {
      for (const { row, col, speciesId } of planted) await edgePlantSeed(row, col, speciesId);
    } catch {
      update(prev);
    }
  }

  const bloomedCount = state.grid
    .flat()
    .filter((p) => p.plant && getCurrentStage(p.plant, Date.now(), activeWeather) === "bloom").length;

  // Exclude gear-occupied cells from "empty" count — they can't receive seeds
  const emptyPlotCount = state.grid.flat().filter((p) => !p.plant && !p.gear).length;
  const availSeedCount = state.inventory.filter((i) => i.isSeed && i.quantity > 0).length;

  return (
    <div className="flex flex-col items-center gap-6">

      {/* Farm tier label */}
      <div className="text-center">
        <p className="text-sm font-mono text-muted-foreground tracking-wide uppercase">
          {currentTier.label} — {state.farmRows}×{state.farmSize}
        </p>
        {(bloomedCount > 0 || (emptyPlotCount > 0 && availSeedCount > 0)) && (
          <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
            {bloomedCount > 0 && (
              <>
                <p className="text-xs text-primary animate-pulse">
                  {bloomedCount} flower{bloomedCount > 1 ? "s" : ""} ready!
                </p>
                <button
                  onClick={handleCollectAll}
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 transition-all"
                >
                  Collect All
                </button>
              </>
            )}
            {emptyPlotCount > 0 && availSeedCount > 0 && (
              <button
                onClick={handlePlantAll}
                className="px-3 py-1 rounded-full text-xs font-semibold bg-card border border-border text-muted-foreground hover:border-primary/50 hover:text-primary transition-all"
              >
                🌱 Plant All
              </button>
            )}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="relative">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${state.farmSize}, minmax(0, 1fr))` }}
        >
          {state.grid.flat().map((plot, i) => {
            const row = Math.floor(i / state.farmSize);
            const col = i % state.farmSize;
            return (
              <PlotTile
                key={plot.id}
                plot={plot}
                row={row}
                col={col}
                onEmptyClick={() => handlePlotClick(row, col)}
                onHarvest={(speciesId, mutation) => setHarvestPopup({ speciesId, mutation })}
                onHarvestStart={() => harvestingPlots.current.add(`${row}-${col}`)}
                onHarvestEnd={() => harvestingPlots.current.delete(`${row}-${col}`)}
                harvestPending={() => harvestingPlots.current.has(`${row}-${col}`)}
                isSelected={selectedPlot?.row === row && selectedPlot?.col === col}
                isHighlighted={highlightedCells.has(`${row}-${col}`)}
                isUnderSprinkler={regularSprinklerKeys.has(`${row}-${col}`)}
                sprinklerMutations={mutationSprinklerMap.get(`${row}-${col}`) ?? []}
                isUnderScarecrow={scarecrowCoveredCells.has(`${row}-${col}`)}
                isUnderComposter={composterCoveredCells.has(`${row}-${col}`)}
                isUnderGrowLamp={growLampKeys.has(`${row}-${col}`)}
                isUnderFan={fanCoveredCells.has(`${row}-${col}`)}
                fanDirection={fanCoveredCells.get(`${row}-${col}`)}
                isUnderHarvestBell={harvestBellCoveredCells.has(`${row}-${col}`)}
                isUnderAutoPlanter={autoPlantCoveredCells.has(`${row}-${col}`)}
                onGearInspect={(r, c, gt) => setHighlightSource({ row: r, col: c, gearType: gt })}
                onGearInspectClose={() => setHighlightSource(null)}
                cellSize={cellSize}
              />
            );
          })}
        </div>

        {/* Seed + Gear picker modal */}
        {selectedPlot && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
            onClick={() => setSelectedPlot(null)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <SeedPicker
                onSelect={handleSeedSelect}
                onGearSelect={handleGearSelect}
                onClose={() => setSelectedPlot(null)}
              />
            </div>
          </div>
        )}

        {/* Fan direction picker modal */}
        {pendingFan && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
            onClick={() => setPendingFan(null)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <FanDirectionPicker
                onDirection={(dir) => {
                  placeGearAt(pendingFan.row, pendingFan.col, pendingFan.gearType, dir);
                  setPendingFan(null);
                }}
                onClose={() => setPendingFan(null)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Farm upgrade */}
      {nextUpgrade && (
        <div className="text-center space-y-1">
          <button
            onClick={handleUpgrade}
            disabled={state.coins < nextUpgrade.cost}
            className={`
              px-5 py-2 rounded-full text-sm font-medium border transition-all duration-200
              ${state.coins >= nextUpgrade.cost
                ? "border-primary text-primary hover:bg-primary/10 hover:scale-105"
                : "border-border text-muted-foreground cursor-not-allowed opacity-50"
              }
            `}
          >
            Upgrade to {nextUpgrade.label} — {nextUpgrade.cost.toLocaleString()} 🟡
          </button>
          <p className="text-xs text-muted-foreground">{nextUpgrade.description}</p>
        </div>
      )}

      {nextUpgrade === null && (
        <p className="text-xs text-yellow-400 font-mono">✦ Max farm size reached</p>
      )}

      {harvestPopup && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2">
            <HarvestPopup
              speciesId={harvestPopup.speciesId}
              mutation={harvestPopup.mutation}
              onDone={() => setHarvestPopup(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Fan direction picker ───────────────────────────────────────────────────

function FanDirectionPicker({
  onDirection,
  onClose,
}: {
  onDirection: (dir: FanDirection) => void;
  onClose: () => void;
}) {

  return (
    <div className="bg-card border border-border rounded-xl p-4 w-64 shadow-xl z-50 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Which way does it blow?</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
      </div>
      <p className="text-xs text-muted-foreground">Choose the direction the fan faces.</p>
      <div className="grid grid-cols-3 gap-2">
        {/* Top row: just Up */}
        <div />
        <button
          onClick={() => onDirection("up")}
          className="flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/10 transition-all"
        >
          <span className="text-lg font-bold leading-none">↑</span>
          <span className="text-[10px] text-muted-foreground">Up</span>
        </button>
        <div />
        {/* Middle row: Left, Fan, Right */}
        <button
          onClick={() => onDirection("left")}
          className="flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/10 transition-all"
        >
          <span className="text-lg font-bold leading-none">←</span>
          <span className="text-[10px] text-muted-foreground">Left</span>
        </button>
        <div className="flex items-center justify-center text-2xl">💨</div>
        <button
          onClick={() => onDirection("right")}
          className="flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/10 transition-all"
        >
          <span className="text-lg font-bold leading-none">→</span>
          <span className="text-[10px] text-muted-foreground">Right</span>
        </button>
        {/* Bottom row: just Down */}
        <div />
        <button
          onClick={() => onDirection("down")}
          className="flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/10 transition-all"
        >
          <span className="text-lg font-bold leading-none">↓</span>
          <span className="text-[10px] text-muted-foreground">Down</span>
        </button>
        <div />
      </div>
    </div>
  );
}
