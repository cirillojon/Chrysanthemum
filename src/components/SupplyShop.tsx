import { useEffect, useState, useMemo } from "react";
import { useGame } from "../store/GameContext";
import {
  msUntilSupplyReset,
  buyFromSupplyShop,
  upgradeSupplySlots,
} from "../store/gameStore";
import {
  edgeBuyFromSupplyShop,
  edgeUpgradeSupplySlots,
} from "../lib/edgeFunctions";
import {
  RARITY_CONFIG,
  MUTATIONS,
} from "../data/flowers";
import type { Rarity } from "../data/flowers";
import { FERTILIZERS } from "../data/upgrades";
import { GEAR, getMaxSupplyRarity, SUPPLY_RARITY_WEIGHTS, isRarityUnlocked } from "../data/gear";
import {
  getNextSupplySlotUpgrade,
  MAX_SUPPLY_SLOTS,
  SUPPLY_SLOT_UPGRADES,
} from "../data/upgrades";
import type { ShopSlot } from "../store/gameStore";
import { RatesModal } from "./RatesModal";
import type { RateRow } from "./RatesModal";

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1_000));
  const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1_000);
  const h = Math.floor(totalSec / 3_600);
  const m = Math.floor((totalSec % 3_600) / 60);
  if (h > 0 && m > 0) return `${h}hr ${m}m`;
  if (h > 0)          return `${h}hr`;
  return `${m}m`;
}

// ── Individual supply slot card ─────────────────────────────────────────────

function SupplyCard({ slot }: { slot: ShopSlot }) {
  const { state, perform } = useGame();
  const [justBought, setJustBought] = useState(false);

  // ── Empty placeholder ─────────────────────────────────────────────────────
  if (slot.isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 bg-card/20 border border-dashed border-border/50 rounded-xl p-4 min-h-[140px] opacity-60">
        <span className="text-2xl">🧪</span>
        <p className="text-xs text-muted-foreground text-center">New slot — fills on next restock</p>
      </div>
    );
  }

  const canAfford  = state.coins >= slot.price;
  const outOfStock = slot.quantity < 1;

  function handleBuy() {
    const optimistic = buyFromSupplyShop(state, slot.speciesId);
    if (!optimistic) return;
    perform(
      optimistic,
      () => edgeBuyFromSupplyShop(slot.speciesId),
      undefined,
      {
        rollback: (cur) => {
          const restoredShop = (cur.supplyShop ?? []).map((s) =>
            s.speciesId === slot.speciesId ? { ...s, quantity: s.quantity + 1 } : s
          );
          if (slot.isFertilizer && slot.fertilizerType) {
            return {
              ...cur,
              coins: cur.coins + slot.price,
              supplyShop: restoredShop,
              fertilizers: cur.fertilizers
                .map((f) =>
                  f.type === slot.fertilizerType
                    ? { ...f, quantity: f.quantity - 1 }
                    : f
                )
                .filter((f) => f.quantity > 0),
            };
          }
          if (slot.isGear && slot.gearType) {
            return {
              ...cur,
              coins: cur.coins + slot.price,
              supplyShop: restoredShop,
              gearInventory: (cur.gearInventory ?? [])
                .map((g) =>
                  g.gearType === slot.gearType
                    ? { ...g, quantity: g.quantity - 1 }
                    : g
                )
                .filter((g) => g.quantity > 0),
            };
          }
          return { ...cur, coins: cur.coins + slot.price, supplyShop: restoredShop };
        },
      }
    );
    setJustBought(true);
    setTimeout(() => setJustBought(false), 800);
  }

  // ── Fertilizer card ────────────────────────────────────────────────────────
  if (slot.isFertilizer && slot.fertilizerType) {
    const fert = FERTILIZERS[slot.fertilizerType];
    return (
      <div
        className={`
          flex flex-col gap-3 bg-card/60 border rounded-xl p-4 transition-all duration-200
          ${outOfStock ? "border-border opacity-50"
            : justBought ? "border-green-400/70 bg-green-400/5"
            : "border-border hover:border-primary/40"}
        `}
      >
        <div className="flex items-start justify-between">
          <span className="text-3xl">{fert.emoji}</span>
          <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${fert.color} border-current bg-current/10`}>
            Fertilizer
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold">{fert.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{fert.description}</p>
        </div>
        <div className="flex items-center justify-between mt-auto pt-1">
          <span className="text-xs text-muted-foreground">
            {outOfStock ? "Out of stock" : `${slot.quantity} left`}
          </span>
          <button
            onClick={handleBuy}
            disabled={!canAfford || outOfStock}
            className={`
              px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150
              ${justBought
                ? "bg-green-500 text-white scale-105"
                : canAfford && !outOfStock
                ? "bg-primary text-primary-foreground hover:scale-105"
                : "bg-secondary text-muted-foreground cursor-not-allowed"
              }
            `}
          >
            {justBought ? "✓ Bought!" : `${slot.price.toLocaleString()} 🟡`}
          </button>
        </div>
      </div>
    );
  }

  // ── Gear card ──────────────────────────────────────────────────────────────
  if (slot.isGear && slot.gearType) {
    const def    = GEAR[slot.gearType];
    const rarity = RARITY_CONFIG[def.rarity];

    return (
      <div
        className={`
          flex flex-col gap-3 bg-card/60 border rounded-xl p-4 transition-all duration-200
          ${outOfStock ? "border-border opacity-50"
            : justBought ? "border-green-400/70 bg-green-400/5"
            : `border-border hover:border-primary/40 ${rarity.glow}`}
        `}
      >
        <div className="flex items-start justify-between">
          <span className="text-3xl relative">
            {def.emoji}
            {def.category === "sprinkler_mutation" && def.mutationType && (
              <span className="absolute -bottom-0.5 -right-1 text-sm leading-none">
                {MUTATIONS[def.mutationType].emoji}
              </span>
            )}
          </span>
          <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${rarity.color} border-current bg-current/10`}>
            {rarity.label}
          </span>
        </div>

        <div>
          <p className="text-sm font-semibold">{def.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
        </div>

        {def.durationMs && (
          <p className="text-xs text-muted-foreground font-mono">
            Duration: {formatDuration(def.durationMs)}
          </p>
        )}
        {!def.durationMs && (
          <p className="text-xs text-muted-foreground font-mono">Permanent (until removed)</p>
        )}

        <div className="flex items-center justify-between mt-auto pt-1">
          <span className="text-xs text-muted-foreground">
            {outOfStock ? "Out of stock" : `${slot.quantity} left`}
          </span>
          <button
            onClick={handleBuy}
            disabled={!canAfford || outOfStock}
            className={`
              px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150
              ${justBought
                ? "bg-green-500 text-white scale-105"
                : canAfford && !outOfStock
                ? "bg-primary text-primary-foreground hover:scale-105"
                : "bg-secondary text-muted-foreground cursor-not-allowed"
              }
            `}
          >
            {justBought ? "✓ Bought!" : `${slot.price.toLocaleString()} 🟡`}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ── Supply Shop ─────────────────────────────────────────────────────────────

/** Returns the supply slot count at which `rarity` first becomes available */
function supplyUnlockSlots(rarity: Rarity): number | null {
  // Rarities available from the start (1–2 slots unlock up to Rare)
  if (isRarityUnlocked(rarity, 2)) return null;
  const upgrade = SUPPLY_SLOT_UPGRADES.find((u) => isRarityUnlocked(rarity, u.slots));
  return upgrade?.slots ?? null;
}

export function SupplyShop() {
  const { state, perform } = useGame();
  const [countdown,  setCountdown]  = useState(() => msUntilSupplyReset(state));
  const [showRates,  setShowRates]  = useState(false);

  useEffect(() => {
    const id = setInterval(() => setCountdown(msUntilSupplyReset(state)), 1_000);
    return () => clearInterval(id);
  }, [state.lastSupplyReset]);

  const supplySlots     = state.supplySlots ?? 2;
  const nextSlotUpgrade = getNextSupplySlotUpgrade(supplySlots);
  const canAffordSlot   = nextSlotUpgrade ? state.coins >= nextSlotUpgrade.cost : false;
  const atMaxSlots      = supplySlots >= MAX_SUPPLY_SLOTS;
  const maxRarity       = getMaxSupplyRarity(supplySlots);
  const maxRarityConfig = RARITY_CONFIG[maxRarity];

  // Build rate rows — locked tiers show the slot count needed to unlock them
  const rateRows = useMemo((): RateRow[] =>
    (Object.entries(SUPPLY_RARITY_WEIGHTS) as [Rarity, number][]).map(([rarity, weight]) => {
      const unlockAt = supplyUnlockSlots(rarity);
      const locked   = !isRarityUnlocked(rarity, supplySlots);
      return {
        rarity,
        weight,
        unlocksAt: locked && unlockAt ? `${unlockAt} supply slots` : undefined,
      };
    }),
  [supplySlots]);

  function handleUpgradeSlots() {
    if (!nextSlotUpgrade) return;
    const optimistic = upgradeSupplySlots(state);
    if (!optimistic) return;
    const prevSlots = state.supplySlots ?? 2;
    const prevShop  = state.supplyShop;
    const cost      = nextSlotUpgrade.cost;
    perform(
      optimistic,
      () => edgeUpgradeSupplySlots(),
      undefined,
      {
        rollback: (cur) => ({
          ...cur,
          coins:       cur.coins + cost,
          supplySlots: prevSlots,
          supplyShop:  prevShop,
        }),
      }
    );
  }

  const slots = state.supplyShop ?? [];

  return (
    <div className="flex flex-col gap-6">

      {showRates && (
        <RatesModal
          title="Supply shop drop rates"
          subtitle="Chance per slot roll each restock"
          rows={rateRows}
          onClose={() => setShowRates(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Supply Shop</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fertilizers &amp; gear — restocks every 10 min
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

      {/* Slot grid */}
      {slots.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {slots.map((slot) => (
            <SupplyCard key={slot.speciesId} slot={slot} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-12">Nothing in stock right now.</p>
      )}

      {/* Slot upgrade */}
      <div className="border border-border rounded-xl p-4 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Expand Supply Shop</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {atMaxSlots
              ? `Maximum size reached (${MAX_SUPPLY_SLOTS} slots)`
              : `${state.supplySlots ?? 2} slots · up to `}
            {!atMaxSlots && (
              <span className={`font-mono ${maxRarityConfig.color}`}>{maxRarityConfig.label}</span>
            )}
            {!atMaxSlots && (
              <> tier — upgrade to {nextSlotUpgrade!.slots} slots, unlock{" "}
                <span className={`font-mono ${RARITY_CONFIG[getMaxSupplyRarity(nextSlotUpgrade!.slots)].color}`}>
                  {RARITY_CONFIG[getMaxSupplyRarity(nextSlotUpgrade!.slots)].label}
                </span>
              </>
            )}
          </p>
        </div>
        {!atMaxSlots && (
          <button
            onClick={handleUpgradeSlots}
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
        Higher-rarity gear appears less often. Unlock more slots for rarer items.
      </p>
    </div>
  );
}
