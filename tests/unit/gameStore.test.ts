import { describe, expect, it } from "vitest";
import {
  buyWeatherForecastSlot,
  codexKey,
  defaultState,
  FORECAST_SLOT_COSTS,
  getSpeciesCompletion,
  getTotalCodexEntries,
  harvestPlant,
  isDiscovered,
  isSpeciesMastered,
  makeGrid,
  MAX_FORECAST_SLOTS,
  plantSeed,
  removePlant,
  resizeGrid,
  sellFlower,
  type GameState,
  type PlantedFlower,
} from "../../src/store/gameStore";
import { FLOWERS, MUTATIONS } from "../../src/data/flowers";

// Pick a fast-growing common flower for deterministic tests.
const fastFlower = FLOWERS.find((f) => f.id === "quickgrass")!;

function bloomedPlant(speciesId: string, mutation?: keyof typeof MUTATIONS): PlantedFlower {
  return {
    speciesId,
    timePlanted: Date.now() - 10_000_000,
    fertilizer: null,
    bloomedAt: Date.now() - 1000,
    sproutedAt: Date.now() - 2000,
    growthMs: 9_999_999_999,
    lastTickAt: Date.now() - 1000,
    mutation: mutation as PlantedFlower["mutation"],
  };
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  const state = defaultState();
  return { ...state, ...overrides };
}

describe("grid helpers (regression)", () => {
  it("makeGrid produces correct shape with empty plots", () => {
    const grid = makeGrid(3, 4);
    expect(grid.length).toBe(3);
    expect(grid[0].length).toBe(4);
    for (const row of grid) {
      for (const plot of row) {
        expect(plot.plant).toBeNull();
        expect(plot.id).toMatch(/^\d+-\d+$/);
      }
    }
  });

  it("resizeGrid preserves overlapping plots and adds empty new ones", () => {
    const old = makeGrid(2, 2);
    old[0][0].plant = { speciesId: fastFlower.id, timePlanted: 1, fertilizer: null };
    const resized = resizeGrid(old, 3, 3);
    expect(resized.length).toBe(3);
    expect(resized[0].length).toBe(3);
    expect(resized[0][0].plant?.speciesId).toBe(fastFlower.id);
    expect(resized[2][2].plant).toBeNull();
  });
});

describe("codex helpers (regression)", () => {
  it("codexKey formats base and mutation keys", () => {
    expect(codexKey("rose")).toBe("rose");
    expect(codexKey("rose", "golden")).toBe("rose:golden");
  });

  it("isDiscovered checks both base and mutation keys", () => {
    const discovered = ["rose", "rose:golden"];
    expect(isDiscovered(discovered, "rose")).toBe(true);
    expect(isDiscovered(discovered, "rose", "golden")).toBe(true);
    expect(isDiscovered(discovered, "rose", "frozen")).toBe(false);
    expect(isDiscovered(discovered, "tulip")).toBe(false);
  });

  it("getSpeciesCompletion counts base + mutations correctly", () => {
    const { found, total } = getSpeciesCompletion(["quickgrass", "quickgrass:golden"], "quickgrass");
    expect(total).toBe(10); // 1 base + 9 mutations
    expect(found).toBe(2);
  });

  it("isSpeciesMastered requires all 10 entries", () => {
    const allMutations = Object.keys(MUTATIONS);
    const partial = ["quickgrass", "quickgrass:golden"];
    expect(isSpeciesMastered(partial, "quickgrass")).toBe(false);

    const full = ["quickgrass", ...allMutations.map((m) => `quickgrass:${m}`)];
    expect(isSpeciesMastered(full, "quickgrass")).toBe(true);
  });

  it("getTotalCodexEntries equals FLOWERS.length * 10", () => {
    expect(getTotalCodexEntries()).toBe(FLOWERS.length * (1 + Object.keys(MUTATIONS).length));
  });
});

describe("defaultState (regression)", () => {
  it("returns a fresh 3x3 game with starter inventory", () => {
    const s = defaultState();
    expect(s.coins).toBe(100);
    expect(s.farmSize).toBe(3);
    expect(s.farmRows).toBe(3);
    expect(s.grid.length).toBe(3);
    expect(s.grid[0].length).toBe(3);
    expect(s.inventory).toEqual([]);
    expect(s.fertilizers).toEqual([{ type: "basic", quantity: 3 }]);
    expect(s.discovered).toEqual([]);
    expect(s.weatherForecastSlots).toBe(0);
    expect(s.marketplaceSlots).toBe(0);
    expect(s.shop.length).toBeGreaterThan(0);
  });
});

describe("weather forecast slot purchase (regression)", () => {
  it("deducts cost and increments slot count", () => {
    const s = baseState({ coins: 10_000, weatherForecastSlots: 0 });
    const next = buyWeatherForecastSlot(s);
    expect(next).not.toBeNull();
    expect(next!.weatherForecastSlots).toBe(1);
    expect(next!.coins).toBe(10_000 - FORECAST_SLOT_COSTS[0]);
  });

  it("returns null when player cannot afford", () => {
    const s = baseState({ coins: 0, weatherForecastSlots: 0 });
    expect(buyWeatherForecastSlot(s)).toBeNull();
  });

  it("returns null when already at the cap", () => {
    const s = baseState({ coins: 10_000_000, weatherForecastSlots: MAX_FORECAST_SLOTS });
    expect(buyWeatherForecastSlot(s)).toBeNull();
  });
});

describe("plantSeed (regression)", () => {
  it("plants when a seed is available and the plot is empty", () => {
    const s = baseState({
      inventory: [{ speciesId: fastFlower.id, quantity: 2, isSeed: true }],
    });
    const next = plantSeed(s, 0, 0, fastFlower.id);
    expect(next).not.toBeNull();
    expect(next!.grid[0][0].plant?.speciesId).toBe(fastFlower.id);
    expect(next!.inventory[0].quantity).toBe(1);
  });

  it("returns null when no seed is in inventory", () => {
    const s = baseState({ inventory: [] });
    expect(plantSeed(s, 0, 0, fastFlower.id)).toBeNull();
  });

  it("returns null when the plot is already occupied", () => {
    const s = baseState({
      inventory: [{ speciesId: fastFlower.id, quantity: 1, isSeed: true }],
    });
    const next = plantSeed(s, 0, 0, fastFlower.id)!;
    expect(plantSeed(next, 0, 0, fastFlower.id)).toBeNull();
  });

  it("removePlant returns seed to inventory and clears the plot", () => {
    const s = baseState({
      inventory: [{ speciesId: fastFlower.id, quantity: 1, isSeed: true }],
    });
    const planted = plantSeed(s, 0, 0, fastFlower.id)!;
    const removed = removePlant(planted, 0, 0)!;
    expect(removed.grid[0][0].plant).toBeNull();
    const seed = removed.inventory.find((i) => i.speciesId === fastFlower.id && i.isSeed);
    expect(seed?.quantity).toBe(1);
  });
});

describe("harvestPlant (regression)", () => {
  it("returns null when the plant is not yet bloomed", () => {
    const s = baseState();
    s.grid[0][0].plant = {
      speciesId: fastFlower.id,
      timePlanted: Date.now(),
      fertilizer: null,
    };
    expect(harvestPlant(s, 0, 0, "clear")).toBeNull();
  });

  it("harvests a bloom: clears plot, adds inventory, and discovers species", () => {
    const s = baseState();
    s.grid[0][0].plant = bloomedPlant(fastFlower.id);
    const result = harvestPlant(s, 0, 0, "clear");
    expect(result).not.toBeNull();
    expect(result!.state.grid[0][0].plant).toBeNull();
    expect(result!.state.inventory).toContainEqual({
      speciesId: fastFlower.id,
      quantity: 1,
      mutation: undefined,
      isSeed: false,
    });
    expect(result!.state.discovered).toContain(fastFlower.id);
    expect(result!.mutation).toBeUndefined();
  });

  it("harvesting a mutated bloom credits bonus coins and codex mutation entry", () => {
    const s = baseState({ coins: 0 });
    s.grid[0][0].plant = bloomedPlant(fastFlower.id, "golden");
    const result = harvestPlant(s, 0, 0, "clear")!;
    const expectedBonus = Math.floor(
      fastFlower.sellValue * (MUTATIONS.golden.valueMultiplier - 1),
    );
    expect(result.state.coins).toBe(expectedBonus);
    expect(result.mutation).toBe("golden");
    expect(result.state.discovered).toContain(`${fastFlower.id}:golden`);
  });
});

describe("sellFlower (regression)", () => {
  it("computes earnings using mutation multiplier and removes inventory", () => {
    const s = baseState({
      coins: 0,
      inventory: [
        { speciesId: fastFlower.id, quantity: 2, mutation: "golden", isSeed: false },
      ],
    });
    const next = sellFlower(s, fastFlower.id, 1, "golden");
    expect(next).not.toBeNull();
    const expectedEarn = Math.floor(fastFlower.sellValue * MUTATIONS.golden.valueMultiplier);
    expect(next!.coins).toBe(expectedEarn);
    expect(
      next!.inventory.find((i) => i.speciesId === fastFlower.id && i.mutation === "golden")
        ?.quantity,
    ).toBe(1);
  });

  it("returns null when quantity exceeds owned amount", () => {
    const s = baseState({
      inventory: [{ speciesId: fastFlower.id, quantity: 1, isSeed: false }],
    });
    expect(sellFlower(s, fastFlower.id, 5)).toBeNull();
  });
});
