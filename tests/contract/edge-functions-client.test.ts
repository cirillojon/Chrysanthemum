import { describe, expect, it } from "vitest";
import * as edgeFunctions from "../../src/lib/edgeFunctions";

/**
 * Frontend ↔ backend contract guard.
 *
 * The application calls a fixed set of edge-function wrappers from
 * `src/lib/edgeFunctions.ts`. This test fails if any of those wrappers is
 * accidentally renamed, removed, or has its function shape changed (going
 * from a function to a non-function export). It does NOT execute network
 * calls — no Supabase environment is required.
 */

const REQUIRED_EXPORTS = [
  // Core gameplay
  "edgeHarvest",
  "edgePlantSeed",
  "edgeRemovePlant",
  "edgeApplyFertilizer",
  // Shop
  "edgeBuyFlower",
  "edgeBuyFertilizer",
  "edgeSellFlower",
  "edgeSyncShop",
  // Upgrades
  "edgeUpgradeFarm",
  "edgeUpgradeShopSlots",
  "edgeUpgradeSupplySlots",
  // Gear
  "edgePlaceGear",
  "edgeRemoveGear",
  "edgeCollectFromComposter",
  "edgeSetFanDirection",
  // Supply shop
  "edgeBuyFromSupplyShop",
  "edgeSyncSupplyShop",
  // Bulk sell
  "edgeSellAll",
  // Botany
  "edgeBotanyConvert",
  "edgeBotanyConvertAll",
  // Gifting
  "edgeSendGift",
  "edgeClaimGift",
  // Alchemy
  "edgeAlchemySacrifice",
  // Cross-breeding
  "edgeCrossBreed",
  // Marketplace + mailbox
  "edgeMarketplaceCreateListing",
  "edgeMarketplaceCreateFertilizerListing",
  "edgeMarketplaceCreateGearListing",
  "edgeMarketplaceUpgradeSlots",
  "edgeMarketplaceBuy",
  "edgeMarketplaceCancel",
  "edgeClaimMail",
] as const;

describe("edgeFunctions client contract (regression)", () => {
  for (const name of REQUIRED_EXPORTS) {
    it(`exports ${name} as a function`, () => {
      const fn = (edgeFunctions as unknown as Record<string, unknown>)[name];
      expect(fn, `${name} is missing`).toBeDefined();
      expect(typeof fn, `${name} should be a function`).toBe("function");
    });
  }

  it("does not export any unexpected callable wrappers without test coverage", () => {
    // All wrappers should start with "edge" by convention. This catches stray
    // helpers that shadow the wrapper namespace.
    const callable = Object.entries(edgeFunctions)
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k);

    for (const name of callable) {
      expect(name.startsWith("edge"), `${name} should start with "edge"`).toBe(true);
    }

    // Every exported wrapper should be in the expected list — flags new ones.
    const missingFromList = callable.filter(
      (name) => !(REQUIRED_EXPORTS as readonly string[]).includes(name),
    );
    expect(
      missingFromList,
      `New edge wrappers detected — add them to REQUIRED_EXPORTS so CI tracks them: ${missingFromList.join(", ")}`,
    ).toEqual([]);
  });
});
