import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHOP_SLOTS,
  DEFAULT_SUPPLY_SLOTS,
  FARM_UPGRADES,
  FERTILIZERS,
  MAX_MARKETPLACE_SLOTS,
  MAX_SHOP_SLOTS,
  MAX_SUPPLY_SLOTS,
  MARKETPLACE_SLOT_UPGRADES,
  SHOP_SLOT_UPGRADES,
  SUPPLY_SLOT_UPGRADES,
  getCurrentTier,
  getNextMarketplaceSlotUpgrade,
  getNextShopSlotUpgrade,
  getNextSupplySlotUpgrade,
  getNextUpgrade,
} from "../../src/data/upgrades";

describe("FARM_UPGRADES (regression)", () => {
  it("starts at 3x3 with cost 0", () => {
    expect(FARM_UPGRADES[0]).toMatchObject({ rows: 3, cols: 3, cost: 0 });
  });

  it("upgrades are strictly more expensive than the previous tier", () => {
    for (let i = 1; i < FARM_UPGRADES.length; i++) {
      expect(FARM_UPGRADES[i].cost).toBeGreaterThan(FARM_UPGRADES[i - 1].cost);
    }
  });

  it("upgrades grow monotonically (rows then cols)", () => {
    for (let i = 1; i < FARM_UPGRADES.length; i++) {
      const prev = FARM_UPGRADES[i - 1];
      const curr = FARM_UPGRADES[i];
      const grew = curr.rows > prev.rows || (curr.rows === prev.rows && curr.cols > prev.cols);
      expect(grew, `tier ${i} did not grow vs ${i - 1}`).toBe(true);
    }
  });

  it("getNextUpgrade returns the next tier from the current one", () => {
    const next = getNextUpgrade(3, 3);
    expect(next).not.toBeNull();
    expect(next!.rows).toBeGreaterThanOrEqual(3);
  });

  it("getNextUpgrade returns null at max tier", () => {
    const last = FARM_UPGRADES[FARM_UPGRADES.length - 1];
    expect(getNextUpgrade(last.rows, last.cols)).toBeNull();
  });

  it("getCurrentTier returns the matching tier", () => {
    const tier = getCurrentTier(5, 5);
    expect(tier.rows).toBe(5);
    expect(tier.cols).toBe(5);
  });
});

describe("Shop slot upgrades (regression)", () => {
  it("default slots is below max", () => {
    expect(DEFAULT_SHOP_SLOTS).toBeLessThan(MAX_SHOP_SLOTS);
  });

  it("upgrades are sorted ascending and end at MAX_SHOP_SLOTS", () => {
    for (let i = 1; i < SHOP_SLOT_UPGRADES.length; i++) {
      expect(SHOP_SLOT_UPGRADES[i].slots).toBeGreaterThan(SHOP_SLOT_UPGRADES[i - 1].slots);
      expect(SHOP_SLOT_UPGRADES[i].cost).toBeGreaterThan(SHOP_SLOT_UPGRADES[i - 1].cost);
    }
    expect(SHOP_SLOT_UPGRADES[SHOP_SLOT_UPGRADES.length - 1].slots).toBe(MAX_SHOP_SLOTS);
  });

  it("getNextShopSlotUpgrade returns the next tier or null at max", () => {
    expect(getNextShopSlotUpgrade(DEFAULT_SHOP_SLOTS)?.slots).toBe(DEFAULT_SHOP_SLOTS + 1);
    expect(getNextShopSlotUpgrade(MAX_SHOP_SLOTS)).toBeNull();
  });
});

describe("Supply slot upgrades (regression)", () => {
  it("default supply slots is below the max", () => {
    expect(DEFAULT_SUPPLY_SLOTS).toBeLessThan(MAX_SUPPLY_SLOTS);
  });

  it("upgrades are sorted ascending in slots and cost", () => {
    for (let i = 1; i < SUPPLY_SLOT_UPGRADES.length; i++) {
      expect(SUPPLY_SLOT_UPGRADES[i].slots).toBeGreaterThan(SUPPLY_SLOT_UPGRADES[i - 1].slots);
      expect(SUPPLY_SLOT_UPGRADES[i].cost).toBeGreaterThan(SUPPLY_SLOT_UPGRADES[i - 1].cost);
    }
    expect(SUPPLY_SLOT_UPGRADES[SUPPLY_SLOT_UPGRADES.length - 1].slots).toBe(MAX_SUPPLY_SLOTS);
  });

  it("getNextSupplySlotUpgrade returns null at max", () => {
    expect(getNextSupplySlotUpgrade(MAX_SUPPLY_SLOTS)).toBeNull();
    expect(getNextSupplySlotUpgrade(DEFAULT_SUPPLY_SLOTS)?.slots).toBe(DEFAULT_SUPPLY_SLOTS + 1);
  });
});

describe("Marketplace slot upgrades (regression)", () => {
  it("upgrades are sorted ascending and end at MAX_MARKETPLACE_SLOTS", () => {
    for (let i = 1; i < MARKETPLACE_SLOT_UPGRADES.length; i++) {
      expect(MARKETPLACE_SLOT_UPGRADES[i].slots).toBeGreaterThan(MARKETPLACE_SLOT_UPGRADES[i - 1].slots);
      expect(MARKETPLACE_SLOT_UPGRADES[i].cost).toBeGreaterThan(MARKETPLACE_SLOT_UPGRADES[i - 1].cost);
    }
    expect(MARKETPLACE_SLOT_UPGRADES[MARKETPLACE_SLOT_UPGRADES.length - 1].slots).toBe(MAX_MARKETPLACE_SLOTS);
  });

  it("getNextMarketplaceSlotUpgrade returns null at max", () => {
    expect(getNextMarketplaceSlotUpgrade(MAX_MARKETPLACE_SLOTS)).toBeNull();
    expect(getNextMarketplaceSlotUpgrade(0)?.slots).toBe(1);
  });
});

describe("FERTILIZERS catalog (regression)", () => {
  it("speed multipliers are strictly increasing across tiers", () => {
    const order = ["basic", "advanced", "premium", "elite", "miracle"] as const;
    for (let i = 1; i < order.length; i++) {
      expect(FERTILIZERS[order[i]].speedMultiplier).toBeGreaterThan(
        FERTILIZERS[order[i - 1]].speedMultiplier,
      );
    }
  });

  it("shop prices are strictly increasing across tiers", () => {
    const order = ["basic", "advanced", "premium", "elite", "miracle"] as const;
    for (let i = 1; i < order.length; i++) {
      expect(FERTILIZERS[order[i]].shopPrice).toBeGreaterThan(
        FERTILIZERS[order[i - 1]].shopPrice,
      );
    }
  });

  it("each fertilizer has a positive shop weight", () => {
    for (const f of Object.values(FERTILIZERS)) {
      expect(f.shopWeight).toBeGreaterThan(0);
    }
  });
});
