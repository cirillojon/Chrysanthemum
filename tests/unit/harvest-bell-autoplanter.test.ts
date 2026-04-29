/**
 * v2.2.4 Regression Tests
 *
 * Covers the three bug-fixes shipped in v2.2.4:
 *   1. harvestPlant never awards coins (coins come from selling only)
 *   2. findHarvestBellTargets — grace period, expired gear, correct range
 *   3. findAutoPlantTargets   — inventory simulation, occupied-cell skipping
 *   4. simulateOfflineGarden  — bell + auto-planter run correctly on saved state
 *
 * These run in CI (vitest, jsdom) — no network required.
 */

import { describe, expect, it } from "vitest";
import {
  defaultState,
  harvestPlant,
  findHarvestBellTargets,
  findAutoPlantTargets,
  simulateOfflineGarden,
  makeGrid,
  type GameState,
  type PlantedFlower,
} from "../../src/store/gameStore";
import { FLOWERS, MUTATIONS } from "../../src/data/flowers";
import { GEAR } from "../../src/data/gear";

// ── Helpers ──────────────────────────────────────────────────────────────────

const fastFlower = FLOWERS.find((f) => f.id === "quickgrass")!;

function baseState(overrides: Partial<GameState> = {}): GameState {
  return { ...defaultState(), ...overrides };
}

/** A plant that is fully bloomed and old enough to pass the 5 s grace period. */
function oldBloom(speciesId: string, mutation?: keyof typeof MUTATIONS): PlantedFlower {
  const now = Date.now();
  return {
    speciesId,
    timePlanted:  now - 10_000_000,
    fertilizer:   null,
    bloomedAt:    now - 10_000,   // 10 s ago → clears the 5 s bell grace period
    sproutedAt:   now - 20_000,
    growthMs:     9_999_999,
    lastTickAt:   now - 10_000,
    mutation:     mutation as PlantedFlower["mutation"],
  };
}

/** A plant that JUST bloomed — within the 5 s grace period. */
function freshBloom(speciesId: string): PlantedFlower {
  const now = Date.now();
  return {
    speciesId,
    timePlanted: now - 10_000_000,
    fertilizer:  null,
    bloomedAt:   now - 1_000,   // 1 s ago — bell should skip this
    sproutedAt:  now - 20_000,
    growthMs:    9_999_999,
    lastTickAt:  now - 1_000,
    mutation:    null,
  };
}

const BELL_RARE     = GEAR["harvest_bell_rare"];
const PLANTER       = GEAR["auto_planter_prismatic"];

// ─────────────────────────────────────────────────────────────────────────────
// 1. harvestPlant — no coins at harvest
// ─────────────────────────────────────────────────────────────────────────────

describe("harvestPlant — coins policy (regression)", () => {
  it("does not change coin balance when harvesting an unmutated bloom", () => {
    const s = baseState({ coins: 500 });
    s.grid[0][0].plant = oldBloom(fastFlower.id);
    const result = harvestPlant(s, 0, 0, "clear")!;
    expect(result).not.toBeNull();
    expect(result.state.coins).toBe(500);   // unchanged
  });

  it("does not award bonus coins when harvesting a mutated bloom", () => {
    // Prior to v2.2.4 this would credit sellValue × (multiplier - 1) coins.
    const s = baseState({ coins: 0 });
    s.grid[0][0].plant = oldBloom(fastFlower.id, "golden");
    const result = harvestPlant(s, 0, 0, "clear")!;
    expect(result.state.coins).toBe(0);   // no bonus — bonus only applies at sell
  });

  it("still adds the bloom to inventory regardless of mutation", () => {
    const s = baseState({ coins: 0 });
    s.grid[0][0].plant = oldBloom(fastFlower.id, "frozen");
    const result = harvestPlant(s, 0, 0, "clear")!;
    expect(result.state.inventory).toContainEqual(
      expect.objectContaining({ speciesId: fastFlower.id, mutation: "frozen", quantity: 1, isSeed: false })
    );
  });

  it("still discovers the mutation codex entry on harvest", () => {
    const s = baseState({ coins: 0 });
    s.grid[0][0].plant = oldBloom(fastFlower.id, "golden");
    const result = harvestPlant(s, 0, 0, "clear")!;
    expect(result.mutation).toBe("golden");
    expect(result.state.discovered).toContain(`${fastFlower.id}:golden`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. findHarvestBellTargets
// ─────────────────────────────────────────────────────────────────────────────

describe("findHarvestBellTargets (regression)", () => {
  /** Build a 3×3 grid with the bell at (0,0) and a bloomed plant at (0,1). */
  function stateWithBell(overrides: { bloomedAt?: number; gearPlacedAt?: number } = {}): GameState {
    const now        = Date.now();
    const gearPlacedAt = overrides.gearPlacedAt ?? now;
    const bloomedAt    = overrides.bloomedAt    ?? now - 10_000;

    const grid = makeGrid(3, 3);
    grid[0][0].gear  = { gearType: "harvest_bell_rare", placedAt: gearPlacedAt };
    grid[0][1].plant = {
      speciesId:   fastFlower.id,
      timePlanted: now - 10_000_000,
      fertilizer:  null,
      bloomedAt,
      sproutedAt:  now - 20_000,
      growthMs:    9_999_999,
      lastTickAt:  bloomedAt,
      mutation:    null,
    };

    return baseState({ grid, farmRows: 3, farmSize: 3 });
  }

  it("returns the bloomed cell when it is in range and past the grace period", () => {
    const s       = stateWithBell({ bloomedAt: Date.now() - 10_000 });
    const targets = findHarvestBellTargets(s, "clear");
    expect(targets.length).toBeGreaterThan(0);
    expect(targets).toContainEqual({ row: 0, col: 1 });
  });

  it("skips blooms that are within the 5-second grace period", () => {
    const s       = stateWithBell({ bloomedAt: Date.now() - 1_000 });   // 1 s ago
    const targets = findHarvestBellTargets(s, "clear");
    expect(targets).not.toContainEqual({ row: 0, col: 1 });
  });

  it("skips the bell's own cell", () => {
    const s       = stateWithBell();
    const targets = findHarvestBellTargets(s, "clear");
    expect(targets).not.toContainEqual({ row: 0, col: 0 });
  });

  it("returns no targets when no bell is placed", () => {
    const s = baseState();
    // Default grid has no gear
    expect(findHarvestBellTargets(s, "clear")).toHaveLength(0);
  });

  it("returns no targets when the bell has expired", () => {
    const expiredAt = Date.now() - BELL_RARE.durationMs! - 1_000;
    const s         = stateWithBell({ gearPlacedAt: expiredAt });
    expect(findHarvestBellTargets(s, "clear")).toHaveLength(0);
  });

  it("returns no targets when the cell in range is empty (no plant)", () => {
    const grid = makeGrid(3, 3);
    grid[0][0].gear = { gearType: "harvest_bell_rare", placedAt: Date.now() };
    // No plant anywhere
    const s = baseState({ grid, farmRows: 3, farmSize: 3 });
    expect(findHarvestBellTargets(s, "clear")).toHaveLength(0);
  });

  it("returns no targets when the plant in range is not yet bloomed", () => {
    const grid = makeGrid(3, 3);
    grid[0][0].gear  = { gearType: "harvest_bell_rare", placedAt: Date.now() };
    grid[0][1].plant = {
      speciesId:   fastFlower.id,
      timePlanted: Date.now() - 100,  // just planted — still seeding
      fertilizer:  null,
      mutation:    undefined,
    };
    const s = baseState({ grid, farmRows: 3, farmSize: 3 });
    expect(findHarvestBellTargets(s, "clear")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. findAutoPlantTargets
// ─────────────────────────────────────────────────────────────────────────────

describe("findAutoPlantTargets (regression)", () => {
  /** 3×3 grid with auto-planter at (1,1) and seeds in inventory. */
  function stateWithPlanter(
    seedQty = 5,
    gearPlacedAt = Date.now(),
  ): GameState {
    const grid = makeGrid(3, 3);
    grid[1][1].gear = { gearType: "auto_planter_prismatic", placedAt: gearPlacedAt };

    return baseState({
      grid,
      farmRows: 3,
      farmSize: 3,
      inventory: seedQty > 0
        ? [{ speciesId: fastFlower.id, quantity: seedQty, isSeed: true }]
        : [],
    });
  }

  it("returns empty-plot targets when seeds are available", () => {
    const s       = stateWithPlanter(5);
    const targets = findAutoPlantTargets(s);
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) {
      expect(t).toHaveProperty("speciesId", fastFlower.id);
    }
  });

  it("never targets the cell occupied by the planter gear itself", () => {
    const s       = stateWithPlanter(5);
    const targets = findAutoPlantTargets(s);
    expect(targets).not.toContainEqual(expect.objectContaining({ row: 1, col: 1 }));
  });

  it("never targets a cell that already has a plant", () => {
    const grid = makeGrid(3, 3);
    grid[1][1].gear  = { gearType: "auto_planter_prismatic", placedAt: Date.now() };
    grid[0][0].plant = {
      speciesId: fastFlower.id, timePlanted: Date.now(), fertilizer: null, mutation: undefined,
    };
    const s = baseState({
      grid, farmRows: 3, farmSize: 3,
      inventory: [{ speciesId: fastFlower.id, quantity: 5, isSeed: true }],
    });
    const targets = findAutoPlantTargets(s);
    expect(targets).not.toContainEqual(expect.objectContaining({ row: 0, col: 0 }));
  });

  it("returns no targets when there are no seeds", () => {
    const s = stateWithPlanter(0);
    expect(findAutoPlantTargets(s)).toHaveLength(0);
  });

  it("returns no targets when the planter has expired", () => {
    const expiredAt = Date.now() - PLANTER.durationMs! - 1_000;
    const s         = stateWithPlanter(5, expiredAt);
    expect(findAutoPlantTargets(s)).toHaveLength(0);
  });

  it("does not over-allocate seeds beyond available quantity", () => {
    // Only 1 seed — should return at most 1 target
    const s       = stateWithPlanter(1);
    const targets = findAutoPlantTargets(s);
    expect(targets.length).toBeLessThanOrEqual(1);
  });

  it("simulates inventory depletion so the same seed slot isn't double-spent", () => {
    const s       = stateWithPlanter(2);
    const targets = findAutoPlantTargets(s);
    // 2 seeds → at most 2 targets, each consuming one
    expect(targets.length).toBeLessThanOrEqual(2);
    // All targets should have a valid speciesId
    for (const t of targets) expect(t.speciesId).toBe(fastFlower.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. simulateOfflineGarden
// ─────────────────────────────────────────────────────────────────────────────

describe("simulateOfflineGarden (regression)", () => {
  it("harvests a bloom that is in bell range (offline simulation)", () => {
    const now  = Date.now();
    const grid = makeGrid(3, 3);
    grid[0][0].gear  = { gearType: "harvest_bell_rare", placedAt: now };
    grid[0][1].plant = {
      speciesId:   fastFlower.id,
      timePlanted: now - 10_000_000,
      fertilizer:  null,
      // Bloomed well before "now - 6 s" threshold simulateOfflineGarden uses
      bloomedAt:   now - 60_000,
      sproutedAt:  now - 20_000,
      growthMs:    9_999_999,
      lastTickAt:  now - 60_000,
      mutation:    null,
    };

    const s      = baseState({ grid, farmRows: 3, farmSize: 3 });
    const result = simulateOfflineGarden(s);

    // Plant should be cleared
    expect(result.grid[0][1].plant).toBeNull();
    // Bloom should appear in inventory
    expect(result.inventory).toContainEqual(
      expect.objectContaining({ speciesId: fastFlower.id, isSeed: false, quantity: 1 })
    );
  });

  it("auto-planter fills an empty plot from inventory (offline simulation)", () => {
    const now  = Date.now();
    const grid = makeGrid(3, 3);
    grid[1][1].gear = { gearType: "auto_planter_prismatic", placedAt: now };

    const s = baseState({
      grid,
      farmRows:  3,
      farmSize:  3,
      inventory: [{ speciesId: fastFlower.id, quantity: 3, isSeed: true }],
    });
    const result = simulateOfflineGarden(s);

    const planted = result.grid.flat().filter((p) => p.plant?.speciesId === fastFlower.id);
    expect(planted.length).toBeGreaterThan(0);
    // Seeds should have been consumed from inventory
    const seedsLeft = result.inventory.find((i) => i.speciesId === fastFlower.id && i.isSeed);
    expect((seedsLeft?.quantity ?? 0)).toBeLessThan(3);
  });

  it("leaves an empty grid unchanged when no gear is placed", () => {
    const s      = baseState();
    const result = simulateOfflineGarden(s);
    expect(result.grid.flat().every((p) => !p.plant)).toBe(true);
  });

  it("prunes expired gear during simulation", () => {
    const now       = Date.now();
    const expiredAt = now - BELL_RARE.durationMs! - 1_000;
    const grid      = makeGrid(3, 3);
    grid[0][0].gear  = { gearType: "harvest_bell_rare", placedAt: expiredAt };
    // Bloomed plant in range that would be harvested if gear were active
    grid[0][1].plant = {
      speciesId: fastFlower.id, timePlanted: now - 10_000_000,
      fertilizer: null, bloomedAt: now - 60_000,
      sproutedAt: now - 20_000, growthMs: 9_999_999, lastTickAt: now - 60_000,
      mutation: null,
    };

    const s      = baseState({ grid, farmRows: 3, farmSize: 3 });
    const result = simulateOfflineGarden(s);

    // Expired bell → plant should still be there (not harvested)
    expect(result.grid[0][1].plant).not.toBeNull();
    // Expired gear should be pruned from grid
    expect(result.grid[0][0].gear).toBeNull();
  });
});
