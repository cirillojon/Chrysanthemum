import { describe, expect, it } from "vitest";
import { FLOWERS, MUTATIONS } from "../../src/data/flowers";

describe("flower catalog (regression)", () => {
  it("has flowers defined", () => {
    expect(FLOWERS.length).toBeGreaterThan(0);
  });

  it("every flower id is unique", () => {
    const ids = FLOWERS.map((f) => f.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every flower has positive growth times and sell value", () => {
    for (const f of FLOWERS) {
      expect(f.growthTime.seed, `${f.id} seed`).toBeGreaterThan(0);
      expect(f.growthTime.sprout, `${f.id} sprout`).toBeGreaterThan(0);
      expect(f.sellValue, `${f.id} sellValue`).toBeGreaterThan(0);
      expect(f.shopWeight, `${f.id} shopWeight`).toBeGreaterThanOrEqual(0);
    }
  });

  it("every flower has emoji for all three stages", () => {
    for (const f of FLOWERS) {
      expect(f.emoji.seed).toBeTruthy();
      expect(f.emoji.sprout).toBeTruthy();
      expect(f.emoji.bloom).toBeTruthy();
    }
  });

  it("every flower rarity is a known rarity", () => {
    const rarities = new Set([
      "common",
      "uncommon",
      "rare",
      "legendary",
      "mythic",
      "exalted",
      "prismatic",
    ]);
    for (const f of FLOWERS) {
      expect(rarities.has(f.rarity), `${f.id} rarity ${f.rarity}`).toBe(true);
    }
  });

  it("all 9 mutations are present and have value multiplier > 1", () => {
    const expected = [
      "golden",
      "rainbow",
      "giant",
      "moonlit",
      "frozen",
      "scorched",
      "wet",
      "windstruck",
      "shocked",
    ];
    for (const id of expected) {
      const m = MUTATIONS[id as keyof typeof MUTATIONS];
      expect(m, `mutation ${id}`).toBeDefined();
      expect(m.valueMultiplier).toBeGreaterThan(1);
      expect(m.chance).toBeGreaterThan(0);
    }
  });
});
