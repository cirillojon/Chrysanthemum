import { describe, expect, it } from "vitest";
import { getNextStage, growthStageOrder } from "../../src/utils/growth";

describe("growth utils (regression)", () => {
  it("growth stage order is seed → sprout → bloom", () => {
    expect(growthStageOrder).toEqual(["seed", "sprout", "bloom"]);
  });

  it("getNextStage advances seed → sprout → bloom → null", () => {
    expect(getNextStage("seed")).toBe("sprout");
    expect(getNextStage("sprout")).toBe("bloom");
    expect(getNextStage("bloom")).toBeNull();
  });
});
