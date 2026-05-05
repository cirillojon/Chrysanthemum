import { describe, expect, it } from "vitest";
import {
  applyFertilizer,
  buyAllFertilizer,
  buyAllFromShop,
  buyFertilizer,
  buyFromShop,
  buyFromSupplyShop,
  collectFromComposter,
  defaultState,
  getEffectiveGrowthMultiplier,
  getExpiredGear,
  getPassiveGrowthMultiplier,
  harvestAll,
  msUntilSupplyReset,
  placeGear,
  plantAll,
  pruneExpiredGear,
  removeGear,
  setFanDirection,
  SUPPLY_RESET_INTERVAL,
  upgradeFarm,
  upgradeMarketplaceSlots,
  upgradeShopSlots,
  upgradeSupplySlots,
  type GameState,
} from "../../src/store/gameStore";
import { GEAR } from "../../src/data/gear";
import { FLOWERS } from "../../src/data/flowers";

function baseState(overrides: Partial<GameState> = {}): GameState {
  return { ...defaultState(), ...overrides };
}

const fastFlower = FLOWERS.find((f) => f.id === "quickgrass")!;

// ── Gear placement / removal ─────────────────────────────────────────────

describe("placeGear / removeGear / setFanDirection (regression)", () => {
  it("placeGear places an owned gear and decrements inventory", () => {
    const s0 = baseState({
      gearInventory: [{ gearType: "sprinkler_rare", quantity: 2 }],
    });
    const s1 = placeGear(s0, 0, 0, "sprinkler_rare");
    expect(s1).not.toBeNull();
    expect(s1!.grid[0][0].gear?.gearType).toBe("sprinkler_rare");
    expect(s1!.gearInventory[0].quantity).toBe(1);
  });

  it("placeGear fails if no inventory", () => {
    const s0 = baseState({ gearInventory: [] });
    expect(placeGear(s0, 0, 0, "sprinkler_rare")).toBeNull();
  });

  it("placeGear fails if plot already has plant or gear", () => {
    const s0 = baseState({
      gearInventory: [{ gearType: "sprinkler_rare", quantity: 1 }],
      grid: [
        [
          { id: "0-0", plant: null, gear: { gearType: "sprinkler_rare", placedAt: Date.now() } },
          { id: "0-1", plant: null, gear: null },
        ],
        [
          { id: "1-0", plant: null, gear: null },
          { id: "1-1", plant: null, gear: null },
        ],
      ],
      farmRows: 2,
      farmSize: 2,
    });
    expect(placeGear(s0, 0, 0, "sprinkler_rare")).toBeNull();
  });

  it("placeGear stores fan direction when provided", () => {
    const fanGear = Object.values(GEAR).find((g) => g.passiveSubtype === "fan")!;
    const s0 = baseState({ gearInventory: [{ gearType: fanGear.id, quantity: 1 }] });
    const s1 = placeGear(s0, 0, 0, fanGear.id, "right");
    expect(s1!.grid[0][0].gear?.direction).toBe("right");
  });

  it("setFanDirection updates a placed fan only", () => {
    const fanGear = Object.values(GEAR).find((g) => g.passiveSubtype === "fan")!;
    const s0 = baseState({
      grid: [
        [
          { id: "0-0", plant: null, gear: { gearType: fanGear.id, placedAt: Date.now(), direction: "up" } },
          { id: "0-1", plant: null, gear: { gearType: "sprinkler_rare", placedAt: Date.now() } },
          { id: "0-2", plant: null, gear: null },
        ],
      ],
      farmRows: 1,
      farmSize: 3,
    });
    const turned = setFanDirection(s0, 0, 0, "down");
    expect(turned!.grid[0][0].gear?.direction).toBe("down");

    // Non-fan gear: returns null
    expect(setFanDirection(s0, 0, 1, "down")).toBeNull();
    // Empty plot: returns null
    expect(setFanDirection(s0, 0, 2, "down")).toBeNull();
  });

  it("removeGear destroys the gear and clears the plot (no refund)", () => {
    const s0 = baseState({
      grid: [
        [{ id: "0-0", plant: null, gear: { gearType: "sprinkler_rare", placedAt: Date.now() } }],
      ],
      farmRows: 1,
      farmSize: 1,
      gearInventory: [],
    });
    const s1 = removeGear(s0, 0, 0)!;
    expect(s1.grid[0][0].gear).toBeNull();
    // Gear is destroyed on removal (security fix) — never returned to inventory
    const inv = s1.gearInventory.find((g) => g.gearType === "sprinkler_rare");
    expect(inv).toBeUndefined();
  });

  it("removeGear of a composter also returns its stored fertilizers", () => {
    const composterId = (Object.values(GEAR).find((g) => g.passiveSubtype === "composter")?.id) as string | undefined;
    if (!composterId) return; // skip if no composter defined
    const s0 = baseState({
      grid: [
        [
          {
            id: "0-0",
            plant: null,
            gear: { gearType: composterId, placedAt: Date.now(), storedFertilizers: ["basic", "advanced"] },
          },
        ],
      ],
      farmRows: 1,
      farmSize: 1,
      gearInventory: [],
      fertilizers: [],
    });
    const s1 = removeGear(s0, 0, 0)!;
    expect(s1.fertilizers.find((f) => f.type === "basic")?.quantity).toBe(1);
    expect(s1.fertilizers.find((f) => f.type === "advanced")?.quantity).toBe(1);
  });
});

// ── Composter ─────────────────────────────────────────────────────────────

describe("collectFromComposter (regression)", () => {
  const composter = Object.values(GEAR).find((g) => g.passiveSubtype === "composter");

  it("clears stored fertilizers and adds them to player inventory", () => {
    if (!composter) return;
    const s0 = baseState({
      grid: [
        [
          {
            id: "0-0",
            plant: null,
            gear: { gearType: composter.id, placedAt: Date.now(), storedFertilizers: ["basic", "basic"] },
          },
        ],
      ],
      farmRows: 1,
      farmSize: 1,
      fertilizers: [],
    });
    const s1 = collectFromComposter(s0, 0, 0)!;
    expect(s1).not.toBeNull();
    expect(s1.grid[0][0].gear?.storedFertilizers).toEqual([]);
    expect(s1.fertilizers.find((f) => f.type === "basic")?.quantity).toBe(2);
  });

  it("returns null when nothing is stored or plot is not a composter", () => {
    if (!composter) return;
    const s0 = baseState({
      grid: [
        [
          { id: "0-0", plant: null, gear: { gearType: composter.id, placedAt: Date.now(), storedFertilizers: [] } },
          { id: "0-1", plant: null, gear: { gearType: "sprinkler_rare", placedAt: Date.now() } },
          { id: "0-2", plant: null, gear: null },
        ],
      ],
      farmRows: 1,
      farmSize: 3,
    });
    expect(collectFromComposter(s0, 0, 0)).toBeNull(); // empty
    expect(collectFromComposter(s0, 0, 1)).toBeNull(); // not a composter
    expect(collectFromComposter(s0, 0, 2)).toBeNull(); // empty plot
  });
});

// ── Supply shop ───────────────────────────────────────────────────────────

describe("supply shop (regression)", () => {
  it("buyFromSupplyShop deducts coins and adds the right item", () => {
    const fertSlot = {
      speciesId: "supply_test_basic",
      price: 100,
      quantity: 2,
      isFertilizer: true,
      fertilizerType: "basic" as const,
    };
    const s0 = baseState({ coins: 1000, supplyShop: [fertSlot], fertilizers: [] });
    const s1 = buyFromSupplyShop(s0, "supply_test_basic")!;
    expect(s1.coins).toBe(900);
    expect(s1.supplyShop[0].quantity).toBe(1);
    expect(s1.fertilizers.find((f) => f.type === "basic")?.quantity).toBe(1);
  });

  it("buyFromSupplyShop returns null when can't afford", () => {
    const slot = {
      speciesId: "supply_test_gear",
      price: 1000,
      quantity: 1,
      isGear: true,
      gearType: "sprinkler_rare" as const,
    };
    const s0 = baseState({ coins: 50, supplyShop: [slot] });
    expect(buyFromSupplyShop(s0, "supply_test_gear")).toBeNull();
  });

  it("buyFromSupplyShop adds a gear slot purchase to gearInventory", () => {
    const slot = {
      speciesId: "supply_test_gear",
      price: 100,
      quantity: 1,
      isGear: true,
      gearType: "sprinkler_rare" as const,
    };
    const s0 = baseState({ coins: 1000, supplyShop: [slot], gearInventory: [] });
    const s1 = buyFromSupplyShop(s0, "supply_test_gear")!;
    expect(s1.gearInventory.find((g) => g.gearType === "sprinkler_rare")?.quantity).toBe(1);
    expect(s1.supplyShop[0].quantity).toBe(0);
  });

  it("msUntilSupplyReset clamps to zero when overdue", () => {
    const s0 = baseState({ lastSupplyReset: Date.now() - SUPPLY_RESET_INTERVAL - 5_000 });
    expect(msUntilSupplyReset(s0)).toBe(0);
    const s1 = baseState({ lastSupplyReset: Date.now() });
    expect(msUntilSupplyReset(s1)).toBeGreaterThan(0);
  });
});

// ── Upgrades ──────────────────────────────────────────────────────────────

describe("upgrade actions (regression)", () => {
  it("upgradeFarm grows the grid and pays the cost", () => {
    const s0 = baseState({ coins: 100_000, farmRows: 3, farmSize: 3 });
    const s1 = upgradeFarm(s0)!;
    expect(s1).not.toBeNull();
    expect(s1.coins).toBeLessThan(s0.coins);
    expect(s1.grid.length).toBeGreaterThanOrEqual(3);
    expect(s1.grid[0].length).toBeGreaterThanOrEqual(3);
  });

  it("upgradeFarm returns null if can't afford", () => {
    const s0 = baseState({ coins: 0 });
    expect(upgradeFarm(s0)).toBeNull();
  });

  it("upgradeShopSlots inserts empty slots and pays the cost", () => {
    const s0 = baseState({ coins: 1_000_000, shopSlots: 4 });
    const s1 = upgradeShopSlots(s0)!;
    expect(s1.shopSlots).toBe(5);
    expect(s1.coins).toBeLessThan(s0.coins);
  });

  it("upgradeMarketplaceSlots advances and pays", () => {
    const s0 = baseState({ coins: 10_000_000, marketplaceSlots: 0 });
    const s1 = upgradeMarketplaceSlots(s0)!;
    expect(s1.marketplaceSlots).toBe(1);
    expect(s1.coins).toBeLessThan(s0.coins);
  });

  it("upgradeSupplySlots adds an empty placeholder", () => {
    const s0 = baseState({ coins: 100_000_000, supplySlots: 2, supplyShop: [] });
    const s1 = upgradeSupplySlots(s0)!;
    expect(s1.supplySlots).toBe(3);
    expect(s1.supplyShop.length).toBe(1);
    expect(s1.supplyShop[0].isEmpty).toBe(true);
  });
});

// ── Passive growth & expired gear ────────────────────────────────────────

describe("getPassiveGrowthMultiplier / expired gear (regression)", () => {
  it("returns 1.0 for an empty grid", () => {
    const s0 = baseState();
    expect(getPassiveGrowthMultiplier(s0.grid, 0, 0, Date.now())).toBe(1.0);
  });

  it("uses the highest covering sprinkler's growth multiplier", () => {
    const sprinklerDef = Object.values(GEAR).find((g) => g.category === "sprinkler_regular" && g.growthMultiplier)!;
    const s0 = baseState({
      grid: [
        [
          { id: "0-0", plant: null, gear: null },
          { id: "0-1", plant: null, gear: { gearType: sprinklerDef.id, placedAt: Date.now() } },
          { id: "0-2", plant: null, gear: null },
        ],
      ],
      farmRows: 1,
      farmSize: 3,
    });
    // Sprinkler at (0,1) with cross/diamond/3x3 will cover at least one neighbour
    const mult = getPassiveGrowthMultiplier(s0.grid, 0, 0, Date.now());
    expect(mult).toBeGreaterThanOrEqual(1.0);
  });

  it("ignores expired sprinklers", () => {
    const sprinklerDef = Object.values(GEAR).find((g) => g.category === "sprinkler_regular" && g.growthMultiplier)!;
    const placedAt = 0;
    const now = placedAt + sprinklerDef.durationMs! + 1_000;
    const s0 = baseState({
      grid: [
        [
          { id: "0-0", plant: null, gear: null },
          { id: "0-1", plant: null, gear: { gearType: sprinklerDef.id, placedAt } },
        ],
      ],
      farmRows: 1,
      farmSize: 2,
    });
    expect(getPassiveGrowthMultiplier(s0.grid, 0, 0, now)).toBe(1.0);
  });

  it("getExpiredGear / pruneExpiredGear identify and remove expired sprinklers", () => {
    const def = Object.values(GEAR).find((g) => g.category === "sprinkler_regular")!;
    const now = def.durationMs! + 10_000;
    const s0 = baseState({
      grid: [[{ id: "0-0", plant: null, gear: { gearType: def.id, placedAt: 0 } }]],
      farmRows: 1,
      farmSize: 1,
    });
    expect(getExpiredGear(s0.grid, now).length).toBe(1);
    const pruned = pruneExpiredGear(s0.grid, now);
    expect(pruned[0][0].gear).toBeNull();
  });

  it("pruneExpiredGear returns the same reference when nothing changed", () => {
    const s0 = baseState();
    const same = pruneExpiredGear(s0.grid, Date.now());
    expect(same).toBe(s0.grid);
  });
});

// ── Plant all / harvest all ──────────────────────────────────────────────

describe("plantAll / harvestAll (regression)", () => {
  it("plantAll uses available seeds across empty plots", () => {
    const s0 = baseState({
      inventory: [{ speciesId: fastFlower.id, quantity: 5, isSeed: true }],
    });
    const s1 = plantAll(s0);
    const planted = s1.grid.flat().filter((p) => p.plant?.speciesId === fastFlower.id).length;
    expect(planted).toBeGreaterThan(0);
    const seedLeft = s1.inventory.find((i) => i.speciesId === fastFlower.id && i.isSeed);
    expect((seedLeft?.quantity ?? 0)).toBeLessThan(5);
  });

  it("plantAll is a no-op when there are no seeds", () => {
    const s0 = baseState({ inventory: [] });
    const s1 = plantAll(s0);
    expect(s1.grid.flat().every((p) => !p.plant)).toBe(true);
  });

  it("plantAll skips plots that have gear", () => {
    const sprinklerDef = Object.values(GEAR).find((g) => g.category === "sprinkler_regular")!;
    const s0 = baseState({
      grid: [
        [
          { id: "0-0", plant: null, gear: { gearType: sprinklerDef.id, placedAt: Date.now() } },
          { id: "0-1", plant: null, gear: null },
        ],
      ],
      farmRows: 1,
      farmSize: 2,
      inventory: [{ speciesId: fastFlower.id, quantity: 5, isSeed: true }],
    });
    const s1 = plantAll(s0);
    expect(s1.grid[0][0].plant).toBeNull();
    expect(s1.grid[0][1].plant?.speciesId).toBe(fastFlower.id);
  });

  it("harvestAll is a no-op when nothing has bloomed", () => {
    const s0 = baseState();
    const s1 = harvestAll(s0);
    expect(s1.grid.flat().every((p) => !p.plant || !p.plant.bloomedAt)).toBe(true);
  });
});

// ── Shop / fertilizer purchasing ─────────────────────────────────────────

describe("shop and fertilizer purchases (regression)", () => {
  it("buyFromShop deducts coins and adds a seed", () => {
    const s0 = baseState({
      coins: 1000,
      shop: [{ speciesId: fastFlower.id, price: 50, quantity: 3 }],
      inventory: [],
    });
    const s1 = buyFromShop(s0, fastFlower.id)!;
    expect(s1.coins).toBe(950);
    expect(s1.inventory.find((i) => i.speciesId === fastFlower.id && i.isSeed)?.quantity).toBe(1);
    expect(s1.shop[0].quantity).toBe(2);
  });

  it("buyFromShop returns null on insufficient coins", () => {
    const s0 = baseState({
      coins: 1,
      shop: [{ speciesId: fastFlower.id, price: 50, quantity: 3 }],
    });
    expect(buyFromShop(s0, fastFlower.id)).toBeNull();
  });

  it("buyAllFromShop buys up to stock or affordability", () => {
    const s0 = baseState({
      coins: 200,
      shop: [{ speciesId: fastFlower.id, price: 50, quantity: 10 }],
      inventory: [],
    });
    const s1 = buyAllFromShop(s0, fastFlower.id)!;
    expect(s1.shop[0].quantity).toBe(10 - 4);
    expect(s1.coins).toBe(0);
    expect(s1.inventory.find((i) => i.speciesId === fastFlower.id)?.quantity).toBe(4);
  });

  it("buyFertilizer / buyAllFertilizer adjust state correctly", () => {
    const slot = {
      speciesId: "fertilizer_basic",
      price: 25,
      quantity: 5,
      isFertilizer: true,
      fertilizerType: "basic" as const,
    };
    const s0 = baseState({ coins: 200, shop: [slot], fertilizers: [] });
    const s1 = buyFertilizer(s0, "basic")!;
    expect(s1.coins).toBe(175);
    expect(s1.fertilizers[0]).toEqual({ type: "basic", quantity: 1 });

    const s2 = buyAllFertilizer(s0, "basic")!;
    expect(s2.shop[0].quantity).toBe(0);
    expect(s2.fertilizers[0].quantity).toBe(5);
    expect(s2.coins).toBe(75);
  });
});

// ── Apply fertilizer ─────────────────────────────────────────────────────

describe("applyFertilizer (regression)", () => {
  it("applies fertilizer to a growing plant and consumes one stack", () => {
    const s0 = baseState({
      grid: [
        [
          {
            id: "0-0",
            plant: { speciesId: fastFlower.id, timePlanted: Date.now(), fertilizer: null },
            gear: null,
          },
        ],
      ],
      farmRows: 1,
      farmSize: 1,
      fertilizers: [{ type: "basic", quantity: 2 }],
    });
    const s1 = applyFertilizer(s0, 0, 0, "basic")!;
    expect(s1.grid[0][0].plant?.fertilizer).toBe("basic");
    expect(s1.fertilizers[0].quantity).toBe(1);
  });

  it("returns null if no plant or no fertilizer in inventory", () => {
    const s0 = baseState({
      grid: [[{ id: "0-0", plant: null, gear: null }]],
      farmRows: 1,
      farmSize: 1,
      fertilizers: [{ type: "basic", quantity: 2 }],
    });
    expect(applyFertilizer(s0, 0, 0, "basic")).toBeNull();

    const s1 = baseState({
      grid: [
        [
          {
            id: "0-0",
            plant: { speciesId: fastFlower.id, timePlanted: Date.now(), fertilizer: null },
            gear: null,
          },
        ],
      ],
      farmRows: 1,
      farmSize: 1,
      fertilizers: [],
    });
    expect(applyFertilizer(s1, 0, 0, "basic")).toBeNull();
  });

  it("returns null if a plant already has fertilizer", () => {
    const s0 = baseState({
      grid: [
        [
          {
            id: "0-0",
            plant: { speciesId: fastFlower.id, timePlanted: Date.now(), fertilizer: "basic" },
            gear: null,
          },
        ],
      ],
      farmRows: 1,
      farmSize: 1,
      fertilizers: [{ type: "basic", quantity: 2 }],
    });
    expect(applyFertilizer(s0, 0, 0, "basic")).toBeNull();
  });

  it("returns null if the plant is already bloomed (v2.3.0 regression)", () => {
    // Fertilizer must only be applicable to seeds and sprouts — never to blooms.
    const s0 = baseState({
      grid: [
        [
          {
            id: "0-0",
            plant: {
              speciesId:   fastFlower.id,
              timePlanted: Date.now() - 10_000_000,
              fertilizer:  null,
              bloomedAt:   Date.now() - 1_000,
              growthMs:    9_999_999_999,
              lastTickAt:  Date.now() - 1_000,
            },
            gear: null,
          },
        ],
      ],
      farmRows: 1,
      farmSize: 1,
      fertilizers: [{ type: "basic", quantity: 2 }],
    });
    expect(applyFertilizer(s0, 0, 0, "basic")).toBeNull();
  });
});

// ── getEffectiveGrowthMultiplier (Bug #222 regression) ───────────────────

describe("getEffectiveGrowthMultiplier (regression)", () => {
  // Find a sprinkler with a known duration and growth multiplier
  const sprinklerDef = Object.values(GEAR).find(
    (g) => g.category === "sprinkler_regular" && g.growthMultiplier && g.durationMs,
  )!;

  function gridWithSprinklerAt(placedAt: number) {
    // Sprinkler at (0,1) affects (0,0) via its radius
    return [
      [
        { id: "0-0", plant: null, gear: null },
        { id: "0-1", plant: null, gear: { gearType: sprinklerDef.id, placedAt } },
        { id: "0-2", plant: null, gear: null },
      ],
    ] as ReturnType<typeof defaultState>["grid"];
  }

  it("returns 1.0 for a zero-width window (from >= to)", () => {
    const grid = gridWithSprinklerAt(0);
    const now = Date.now();
    expect(getEffectiveGrowthMultiplier(grid, 0, 0, now, now)).toBe(1.0);
    expect(getEffectiveGrowthMultiplier(grid, 0, 0, now + 1, now)).toBe(1.0);
  });

  it("matches getPassiveGrowthMultiplier when no gear expires mid-window", () => {
    // Gear was placed recently and has plenty of duration left
    const placedAt = Date.now();
    const grid = gridWithSprinklerAt(placedAt);
    const from = placedAt + 1_000;
    const to   = placedAt + 2_000;
    const effective = getEffectiveGrowthMultiplier(grid, 0, 0, from, to);
    const passive   = getPassiveGrowthMultiplier(grid, 0, 0, to);
    expect(effective).toBeCloseTo(passive, 6);
  });

  it("returns 1.0 across the board when gear is already expired at `from`", () => {
    const placedAt = 0;
    const expiry   = placedAt + sprinklerDef.durationMs!;
    const grid = gridWithSprinklerAt(placedAt);
    // Window starts after expiry — gear was gone for the whole delta
    const from = expiry + 1_000;
    const to   = expiry + 2_000;
    expect(getEffectiveGrowthMultiplier(grid, 0, 0, from, to)).toBe(1.0);
  });

  it("returns a time-weighted average when gear expires mid-window (Bug #222 core case)", () => {
    // Gear placed at t=0, expires at t=durationMs.
    // Window spans [durationMs - 500ms, durationMs + 500ms] — half active, half expired.
    const placedAt = 0;
    const expiry   = sprinklerDef.durationMs!;          // e.g. 3 600 000 ms
    const from     = expiry - 500;
    const to       = expiry + 500;

    const grid = gridWithSprinklerAt(placedAt);

    const effective = getEffectiveGrowthMultiplier(grid, 0, 0, from, to);
    const preMult   = getPassiveGrowthMultiplier(grid, 0, 0, from);    // boosted
    const postMult  = getPassiveGrowthMultiplier(grid, 0, 0, expiry);  // 1.0

    const expected = (preMult * 500 + postMult * 500) / 1_000;
    expect(effective).toBeCloseTo(expected, 6);

    // Must be strictly between post (1.0) and pre (>1.0) — never snaps to either extreme
    expect(effective).toBeGreaterThan(postMult);
    expect(effective).toBeLessThan(preMult);
  });

  it("returns the full boost when gear expires exactly at `to`", () => {
    // Expiry sits at the very end of the window — entire delta should be boosted
    const placedAt = 0;
    const expiry   = sprinklerDef.durationMs!;
    const from     = expiry - 1_000;
    const to       = expiry;                             // expires at the boundary

    const grid = gridWithSprinklerAt(placedAt);

    const effective = getEffectiveGrowthMultiplier(grid, 0, 0, from, to);
    const preMult   = getPassiveGrowthMultiplier(grid, 0, 0, from);
    // The entire 1000ms window the gear was alive — result should equal preMult
    expect(effective).toBeCloseTo(preMult, 6);
  });
});
