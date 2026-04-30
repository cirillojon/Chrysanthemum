import { describe, expect, it } from "vitest";
import {
  GEAR,
  SUPPLY_POOLS,
  SUPPLY_RARITY_WEIGHTS,
  getAffectedCells,
  getGearAffectingCell,
  getMaxSupplyRarity,
  isAegis,
  isAutoPlanter,
  isComposter,
  isCropsticks,
  isFan,
  isGearExpired,
  isGrowLamp,
  isHarvestBell,
  isMutationSprinkler,
  isRarityUnlocked,
  isRegularSprinkler,
  isScarecrow,
  rollComposterFertilizer,
  type FanDirection,
  type GearType,
  type PlacedGear,
} from "../../src/data/gear";
import type { Rarity } from "../../src/data/flowers";

const ALL_GEAR_IDS = Object.keys(GEAR) as GearType[];

const KNOWN_RARITIES = new Set<Rarity>([
  "common",
  "uncommon",
  "rare",
  "legendary",
  "mythic",
  "exalted",
  "prismatic",
]);

describe("GEAR catalog (regression)", () => {
  it("has gear defined", () => {
    expect(ALL_GEAR_IDS.length).toBeGreaterThan(0);
  });

  it("each gear definition has consistent id and required fields", () => {
    for (const id of ALL_GEAR_IDS) {
      const def = GEAR[id];
      expect(def.id, `${id}.id`).toBe(id);
      expect(def.name).toBeTruthy();
      expect(def.emoji).toBeTruthy();
      expect(KNOWN_RARITIES.has(def.rarity)).toBe(true);
      expect(def.shopPrice, `${id}.shopPrice`).toBeGreaterThan(0);
      expect(["sprinkler_regular", "sprinkler_mutation", "passive"]).toContain(def.category);
    }
  });

  it("sprinklers have a positive duration and a radius", () => {
    for (const id of ALL_GEAR_IDS) {
      const def = GEAR[id];
      if (def.category === "passive") continue;
      expect(def.durationMs, `${id}.durationMs`).toBeGreaterThan(0);
      // Sprinklers and (non-fan) passive gear use radiusOffsets
      expect(def.radiusOffsets, `${id}.radiusOffsets`).toBeDefined();
      expect(def.radiusOffsets!.length).toBeGreaterThan(0);
    }
  });

  it("regular sprinklers have a growth multiplier > 1 and a wet chance", () => {
    for (const id of ALL_GEAR_IDS) {
      const def = GEAR[id];
      if (!isRegularSprinkler(def)) continue;
      expect(def.growthMultiplier, `${id}.growthMultiplier`).toBeGreaterThan(1);
      expect(def.wetChancePerTick, `${id}.wetChancePerTick`).toBeGreaterThan(0);
      expect(def.wetChancePerTick!).toBeLessThan(1);
    }
  });

  it("mutation sprinklers have a mutation type and per-tick chance", () => {
    for (const id of ALL_GEAR_IDS) {
      const def = GEAR[id];
      if (!isMutationSprinkler(def)) continue;
      expect(def.mutationType, `${id}.mutationType`).toBeTruthy();
      expect(def.mutationChancePerTick, `${id}.mutationChancePerTick`).toBeGreaterThan(0);
      expect(def.mutationChancePerTick!).toBeLessThan(1);
    }
  });

  it("passive gear declares a passiveSubtype", () => {
    for (const id of ALL_GEAR_IDS) {
      const def = GEAR[id];
      if (def.category !== "passive") continue;
      expect(def.passiveSubtype, `${id}.passiveSubtype`).toBeTruthy();
    }
  });

  it("predicates partition the catalog without overlap", () => {
    for (const id of ALL_GEAR_IDS) {
      const def = GEAR[id];
      const flags = [
        isRegularSprinkler(def),
        isMutationSprinkler(def),
        isGrowLamp(def),
        isScarecrow(def),
        isComposter(def),
        isFan(def),
        isHarvestBell(def),
        isAutoPlanter(def),
        isAegis(def),
        isCropsticks(def),
      ];
      expect(flags.filter(Boolean).length, `${id} should match exactly one predicate`).toBe(1);
    }
  });
});

describe("isGearExpired (regression)", () => {
  it("gear without a durationMs never expires", () => {
    const def = Object.values(GEAR).find((g) => g.durationMs === undefined);
    if (!def) return; // catalog has no permanent gear; nothing to assert
    const placed: PlacedGear = { gearType: def.id, placedAt: 0 };
    expect(isGearExpired(placed, Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it("sprinkler expires once now exceeds placedAt + durationMs", () => {
    const def = Object.values(GEAR).find((g) => g.category === "sprinkler_regular")!;
    const placed: PlacedGear = { gearType: def.id, placedAt: 1_000 };
    expect(isGearExpired(placed, 1_000)).toBe(false);
    expect(isGearExpired(placed, 1_000 + def.durationMs! - 1)).toBe(false);
    expect(isGearExpired(placed, 1_000 + def.durationMs!)).toBe(true);
  });
});

describe("getAffectedCells (regression)", () => {
  it("cross sprinkler covers up/down/left/right but not corners", () => {
    const cells = getAffectedCells("sprinkler_rare", 5, 5, 10, 10);
    const set = new Set(cells.map(([r, c]) => `${r},${c}`));
    expect(set.has("4,5")).toBe(true);
    expect(set.has("6,5")).toBe(true);
    expect(set.has("5,4")).toBe(true);
    expect(set.has("5,6")).toBe(true);
    expect(set.has("4,4")).toBe(false);
    expect(set.has("6,6")).toBe(false);
    expect(set.has("5,5")).toBe(false); // never includes itself
  });

  it("clamps to grid edges", () => {
    const cells = getAffectedCells("sprinkler_rare", 0, 0, 3, 3);
    for (const [r, c] of cells) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(3);
      expect(c).toBeLessThan(3);
    }
    // From corner (0,0), only (1,0) and (0,1) of the cross fit
    expect(cells.length).toBe(2);
  });

  it("fan returns a line in the chosen direction", () => {
    const fanGear = Object.values(GEAR).find((g) => g.passiveSubtype === "fan")!;
    const range = fanGear.fanRange ?? 0;
    expect(range).toBeGreaterThan(0);

    const dirs: FanDirection[] = ["up", "down", "left", "right"];
    for (const dir of dirs) {
      const cells = getAffectedCells(fanGear.id, 5, 5, 12, 12, dir);
      expect(cells.length).toBe(range);
      for (const [r, c] of cells) {
        if (dir === "up") expect(c).toBe(5);
        if (dir === "down") expect(c).toBe(5);
        if (dir === "left") expect(r).toBe(5);
        if (dir === "right") expect(r).toBe(5);
      }
    }
  });

  it("fan returns empty when direction is missing", () => {
    const fanGear = Object.values(GEAR).find((g) => g.passiveSubtype === "fan")!;
    expect(getAffectedCells(fanGear.id, 5, 5, 10, 10)).toEqual([]);
  });
});

describe("getGearAffectingCell (regression)", () => {
  function makeGrid(rows: number, cols: number) {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ gear: null as PlacedGear | null })),
    );
  }

  it("finds a cross sprinkler that covers a neighbour cell", () => {
    const grid = makeGrid(3, 3);
    grid[1][1].gear = { gearType: "sprinkler_rare", placedAt: 0 };
    const sources = getGearAffectingCell(grid, 0, 1, 0);
    expect(sources.length).toBe(1);
    expect(sources[0].gearType).toBe("sprinkler_rare");
    expect(sources[0].sourceRow).toBe(1);
    expect(sources[0].sourceCol).toBe(1);
  });

  it("ignores expired sprinklers", () => {
    const grid = makeGrid(3, 3);
    const def = GEAR.sprinkler_rare;
    grid[1][1].gear = { gearType: "sprinkler_rare", placedAt: 0 };
    const sources = getGearAffectingCell(grid, 0, 1, def.durationMs! + 1);
    expect(sources.length).toBe(0);
  });

  it("returns nothing for cells outside the radius", () => {
    const grid = makeGrid(5, 5);
    grid[0][0].gear = { gearType: "sprinkler_rare", placedAt: 0 };
    expect(getGearAffectingCell(grid, 4, 4, 0).length).toBe(0);
  });
});

describe("Supply pools and rarity gating (regression)", () => {
  it("every supply pool entry references a known fertilizer or gear type", () => {
    for (const items of Object.values(SUPPLY_POOLS)) {
      if (!items) continue;
      for (const item of items) {
        if (item.kind === "gear") {
          expect(GEAR[item.gearType], `unknown gear ${item.gearType}`).toBeDefined();
        } else {
          expect(item.fertilizerType).toBeTruthy();
        }
      }
    }
  });

  it("SUPPLY_RARITY_WEIGHTS sums to a positive total", () => {
    const total = Object.values(SUPPLY_RARITY_WEIGHTS).reduce<number>((s, w) => s + (w ?? 0), 0);
    expect(total).toBeGreaterThan(0);
  });

  it("getMaxSupplyRarity unlocks tiers as slot count grows", () => {
    expect(getMaxSupplyRarity(1)).toBe("rare");
    expect(getMaxSupplyRarity(2)).toBe("rare");
    expect(getMaxSupplyRarity(3)).toBe("legendary");
    expect(getMaxSupplyRarity(4)).toBe("mythic");
    expect(getMaxSupplyRarity(5)).toBe("exalted");
    expect(getMaxSupplyRarity(6)).toBe("prismatic");
  });

  it("isRarityUnlocked respects the supply slot tier", () => {
    expect(isRarityUnlocked("common", 1)).toBe(true);
    expect(isRarityUnlocked("rare", 1)).toBe(true);
    expect(isRarityUnlocked("legendary", 2)).toBe(false);
    expect(isRarityUnlocked("legendary", 3)).toBe(true);
    expect(isRarityUnlocked("prismatic", 5)).toBe(false);
    expect(isRarityUnlocked("prismatic", 6)).toBe(true);
  });
});

describe("rollComposterFertilizer (regression)", () => {
  it("always returns a valid fertilizer type for every input rarity", () => {
    const validTypes = new Set(["basic", "advanced", "premium", "elite", "miracle"]);
    const rarities: Rarity[] = [
      "common",
      "uncommon",
      "rare",
      "legendary",
      "mythic",
      "exalted",
      "prismatic",
    ];
    for (const r of rarities) {
      for (let i = 0; i < 50; i++) {
        const result = rollComposterFertilizer(r);
        expect(validTypes.has(result), `${r} produced ${result}`).toBe(true);
      }
    }
  });
});
