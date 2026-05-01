import { useEffect, useState } from "react";
import { useGame } from "../store/GameContext";
import { msUntilShopReset, upgradeShopSlots, SHOP_RARITY_WEIGHTS } from "../store/gameStore";
import { edgeUpgradeShopSlots } from "../lib/edgeFunctions";
import { getNextShopSlotUpgrade, MAX_SHOP_SLOTS } from "../data/upgrades";
import { ShopSlotCard } from "./ShopSlotCard";
import { SupplyShop } from "./SupplyShop";
import { RatesModal } from "./RatesModal";
import type { RateRow } from "./RatesModal";
import type { Rarity } from "../data/flowers";

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

const SEED_RATE_ROWS: RateRow[] = [
  // Rarities that actually roll in the seed shop
  ...(Object.entries(SHOP_RARITY_WEIGHTS) as [Rarity, number][]).map(
    ([rarity, weight]) => ({ rarity, weight })
  ),
  // Rarities that never appear in the seed shop
  { rarity: "exalted"   as Rarity, weight: 0, unavailable: true },
  { rarity: "prismatic" as Rarity, weight: 0, unavailable: true },
];

interface ShopProps {
  view: "seeds" | "supply";
}

export function Shop({ view }: ShopProps) {
  const { state, perform, user, requestSignIn } = useGame();
  const [countdown,  setCountdown]  = useState(() => msUntilShopReset(state));
  const [showRates,  setShowRates]  = useState(false);

  useEffect(() => {
    const id = setInterval(() => setCountdown(msUntilShopReset(state)), 1_000);
    return () => clearInterval(id);
  }, [state.lastShopReset]);

  const flowerSlots = state.shop.filter((s) => !s.isFertilizer);
  const activeCount = flowerSlots.filter((s) => !s.isEmpty).length;

  const nextSlotUpgrade = getNextShopSlotUpgrade(state.shopSlots);
  const canAffordSlot   = nextSlotUpgrade ? state.coins >= nextSlotUpgrade.cost : false;
  const atMaxSlots      = state.shopSlots >= MAX_SHOP_SLOTS;

  function handleUpgradeShopSlots() {
    if (!user) { requestSignIn("to upgrade your shop slots"); return; }
    const optimistic = upgradeShopSlots(state);
    if (optimistic) perform(optimistic, () => edgeUpgradeShopSlots());
  }

  // Supply view is self-contained
  if (view === "supply") return <SupplyShop />;

  return (
    <div className="flex flex-col gap-6">

      {showRates && (
        <RatesModal
          title="Seed shop drop rates"
          subtitle="Chance per slot roll each restock"
          rows={SEED_RATE_ROWS}
          onClose={() => setShowRates(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Seeds</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {`${activeCount} seed${activeCount !== 1 ? "s" : ""} available`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRates(true)}
            className="text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg border border-border hover:border-primary/40"
            title="View drop rates"
          >
            📊 Rates
          </button>
          <div className="text-right">
            <p className="text-xs text-muted-foreground font-mono">Restocks in</p>
            <p className="text-sm font-mono font-semibold text-primary">
              {formatCountdown(countdown)}
            </p>
          </div>
        </div>
      </div>

      {/* Coins */}
      <div className="flex items-center gap-2 bg-card/40 border border-border rounded-lg px-4 py-2.5">
        <span className="text-lg">🟡</span>
        <span className="text-sm font-mono font-medium">
          {state.coins.toLocaleString()} coins
        </span>
      </div>

      {flowerSlots.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {flowerSlots.map((slot) => (
            <ShopSlotCard key={slot.speciesId} slot={slot} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-12">No seeds in stock right now.</p>
      )}

      {/* Shop slot upgrade */}
      <div className="border border-border rounded-xl p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Expand Shop</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {atMaxSlots
              ? `Maximum size reached (${MAX_SHOP_SLOTS} slots)`
              : `${state.shopSlots} seed slots — upgrade to ${nextSlotUpgrade!.slots}`}
          </p>
        </div>
        {!atMaxSlots && (
          <button
            onClick={handleUpgradeShopSlots}
            disabled={!canAffordSlot}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all
              ${canAffordSlot
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "bg-card border border-border text-muted-foreground cursor-not-allowed opacity-50"
              }`}
          >
            🟡 {nextSlotUpgrade!.cost.toLocaleString()}
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center pb-4">
        Shop stock is random every 10 minutes. Rarer flowers appear less often.
      </p>
    </div>
  );
}
