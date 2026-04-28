import { describe, expect, it } from "vitest";
import { BOTANY_RARITY_ORDER, BOTANY_REQUIREMENTS, NEXT_RARITY } from "../../src/data/botany";
import { FLOWERS, type Rarity } from "../../src/data/flowers";

describe("BOTANY_REQUIREMENTS (regression)", () => {
  it("defines requirements for the convertible rarity chain", () => {
    for (const r of BOTANY_RARITY_ORDER) {
      expect(BOTANY_REQUIREMENTS[r], `${r}`).toBeGreaterThan(0);
    }
  });

  it("does not define a requirement for the terminal prismatic tier", () => {
    expect(BOTANY_REQUIREMENTS.prismatic).toBeUndefined();
  });
});

describe("NEXT_RARITY chain (regression)", () => {
  it("each convertible rarity points to a valid next tier", () => {
    for (const r of BOTANY_RARITY_ORDER) {
      const next = NEXT_RARITY[r];
      expect(next, `${r} -> next`).toBeTruthy();
    }
  });

  it("ends at prismatic and follows the canonical order", () => {
    const order: Rarity[] = ["common", "uncommon", "rare", "legendary", "mythic", "exalted"];
    for (let i = 0; i < order.length - 1; i++) {
      expect(NEXT_RARITY[order[i]]).toBe(order[i + 1]);
    }
    expect(NEXT_RARITY.exalted).toBe("prismatic");
    expect(NEXT_RARITY.prismatic).toBeUndefined();
  });

  it("every NEXT_RARITY target tier has at least one flower defined", () => {
    for (const target of Object.values(NEXT_RARITY)) {
      if (!target) continue;
      const found = FLOWERS.some((f) => f.rarity === target);
      expect(found, `no flowers of rarity ${target}`).toBe(true);
    }
  });
});
