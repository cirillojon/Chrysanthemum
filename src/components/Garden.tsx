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
  stampStageTransitions,
  placeGear,
} from "../store/gameStore";
import { edgePlantSeed, edgeUpgradeFarm, edgeHarvest, edgePlaceGear } from "../lib/edgeFunctions";
import { getNextUpgrade, getCurrentTier } from "../data/upgrades";
import { getAffectedCells, GEAR, isGearExpired } from "../data/gear";
import type { MutationType } from "../data/flowers";
import type { GearType } from "../data/gear";

export function Garden() {
  const { state, update, perform, getState, awaitHarvests, activeWeather } = useGame();
  useGrowthTick(5_000);

  // Every render: stamp transitions, roll weather mutations, roll sprinkler mutations
  useEffect(() => {
    const now     = Date.now();
    const weather = activeWeather ?? "clear";
    let next = stampStageTransitions(state, now, weather);
    next = tickWeatherMutations(next, weather);
    next = tickSprinklerMutations(next, weather);
    next = assignBloomMutations(next, weather);
    if (next !== state) update(next);
  });

  const [selectedPlot, setSelectedPlot]     = useState<{ row: number; col: number } | null>(null);
  const [harvestPopup, setHarvestPopup]     = useState<{ speciesId: string; mutation?: MutationType } | null>(null);
  /** Which gear cell has its tooltip open — used to highlight affected cells */
  const [highlightSource, setHighlightSource] = useState<{ row: number; col: number; gearType: GearType } | null>(null);

  // Track plots with a harvest in-flight so we don't open the seed picker
  // before the server has removed the plant from the DB.
  const harvestingPlots = useRef<Set<string>>(new Set());

  const nextUpgrade = getNextUpgrade(state.farmRows, state.farmSize);
  const currentTier = getCurrentTier(state.farmRows, state.farmSize);

  // Smaller cells on mobile for larger farm sizes
  const cellSize =
    state.farmSize <= 4 ? "w-16 h-16" :
    state.farmSize === 5 ? "w-15 h-15 sm:w-16 sm:h-16" :
    "w-11 h-11 sm:w-16 sm:h-16"; // 6+ cols: compact on mobile

  // Cells highlighted by the currently-inspected gear item
  const highlightedCells = useMemo((): Set<string> => {
    if (!highlightSource) return new Set();
    const { row, col, gearType } = highlightSource;
    const affected = getAffectedCells(gearType, row, col, state.farmRows, state.farmSize);
    return new Set(affected.map(([r, c]) => `${r}-${c}`));
  }, [highlightSource, state.farmRows, state.farmSize]);

  // All cells covered by at least one active (non-expired) sprinkler — used for the 💧 indicator
  const sprinklerCoveredCells = useMemo((): Set<string> => {
    const covered = new Set<string>();
    const now = Date.now();
    for (let ri = 0; ri < state.grid.length; ri++) {
      for (let ci = 0; ci < state.grid[ri].length; ci++) {
        const g = state.grid[ri][ci].gear;
        if (!g || isGearExpired(g, now)) continue;
        const def = GEAR[g.gearType];
        if (def.category !== "sprinkler" && def.category !== "sprinkler_mutation") continue;
        const affected = getAffectedCells(g.gearType, ri, ci, state.farmRows, state.farmSize);
        for (const [r, c] of affected) covered.add(`${r}-${c}`);
      }
    }
    return covered;
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
    const { row, col } = selectedPlot;
    const optimistic = placeGear(getState(), row, col, gearType);
    if (!optimistic) return;
    perform(
      optimistic,
      () => edgePlaceGear(row, col, gearType),
      undefined,
      {
        rollback: (cur) => ({
          ...cur,
          grid: cur.grid.map((r2, ri) =>
            r2.map((p, ci) =>
              ri === row && ci === col ? { ...p, gear: undefined } : p
            )
          ),
          gearInventory: (cur.gearInventory ?? []).map((g) =>
            g.gearType === gearType ? { ...g, quantity: g.quantity + 1 } : g
          ),
        }),
      }
    );
    setSelectedPlot(null);
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
                isUnderSprinkler={sprinklerCoveredCells.has(`${row}-${col}`)}
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
