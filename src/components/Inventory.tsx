import { useState } from "react";
import { useGame } from "../store/GameContext";
import { getFlower, RARITY_CONFIG, MUTATIONS } from "../data/flowers";
import type { MutationType } from "../data/flowers";
import { FlowerTypeBadges } from "./FlowerTypeBadges";
import { InventoryItemCard } from "./InventoryItemCard";
import { sellFlower, type InventoryItem } from "../store/gameStore";
import { edgeSellAll } from "../lib/edgeFunctions";
import { FERTILIZERS } from "../data/upgrades";
import { GEAR } from "../data/gear";
import type { GearInventoryItem } from "../data/gear";

type Tab = 0 | 1 | 2;
const TAB_LABELS = ["Seeds", "Blooms", "Supplies"] as const;

interface Props {
  newSeeds?:    number;
  newBlooms?:   number;
  newSupplies?: number;
  onSubTabView?: (subTab: "seeds" | "blooms" | "supplies") => void;
}

export function Inventory({ newSeeds = 0, newBlooms = 0, newSupplies = 0, onSubTabView }: Props) {
  const { state, perform, getState, awaitHarvests } = useGame();
  const [tab, setTab] = useState<Tab>(0);

  const items       = state.inventory.filter((i) => i.quantity > 0);
  const seeds       = items.filter((i) => i.isSeed);
  const blooms      = items.filter((i) => !i.isSeed);
  const fertilizers = state.fertilizers.filter((f) => f.quantity > 0);
  const gearItems   = (state.gearInventory ?? []).filter((g) => g.quantity > 0);

  const seedCount   = seeds.reduce((s, i) => s + i.quantity, 0);
  const bloomCount  = blooms.reduce((s, i) => s + i.quantity, 0);
  const supplyCount = fertilizers.reduce((s, f) => s + f.quantity, 0)
                    + gearItems.reduce((s, g) => s + g.quantity, 0);

  const totalBloomValue = blooms.reduce((sum, item) => {
    const species = getFlower(item.speciesId);
    const mut     = item.mutation ? MUTATIONS[item.mutation as MutationType] : null;
    return sum + Math.floor((species?.sellValue ?? 0) * (mut?.valueMultiplier ?? 1)) * item.quantity;
  }, 0);

  async function handleSellAll() {
    // Wait for any in-flight serialized harvests to finish before reading/writing
    // the DB — avoids 409 conflicts from concurrent updated_at changes.
    await awaitHarvests();

    const current = getState();
    const currentBlooms = current.inventory.filter((i) => i.quantity > 0 && !i.isSeed);
    if (currentBlooms.length === 0) return;

    // Build a single optimistic state with all blooms sold
    let optimistic = current;
    for (const item of currentBlooms) {
      const next = sellFlower(optimistic, item.speciesId, item.quantity, item.mutation as MutationType | undefined);
      if (next) optimistic = next;
    }

    const items = currentBlooms.map((i) => ({
      speciesId: i.speciesId,
      mutation:  i.mutation as string | undefined,
      quantity:  i.quantity,
    }));

    // Single atomic server write — one CAS check, no partial-failure rollback risk.
    // perform() auto-merges the SellAllResult (coins + inventory) on success.
    await perform(
      optimistic,
      () => edgeSellAll(items),
      undefined,
      {
        rollback: (c) => ({
          ...c,
          coins:     current.coins,
          inventory: current.inventory,
        }),
      }
    );
  }

  const isEmpty = items.length === 0 && fertilizers.length === 0 && gearItems.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <span className="text-5xl">🎒</span>
        <p className="font-medium text-muted-foreground">Your inventory is empty</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Buy seeds from the Shop, plant them in your Garden, then harvest bloomed flowers here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Inventory</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {seedCount} seed{seedCount !== 1 ? "s" : ""} ·{" "}
            {bloomCount} bloom{bloomCount !== 1 ? "s" : ""}
            {supplyCount > 0 && <> · {supplyCount} supplies</>}
          </p>
        </div>
      </div>

      {/* Coins */}
      <div className="flex items-center gap-2 bg-card/40 border border-border rounded-lg px-4 py-2.5">
        <span className="text-lg">🟡</span>
        <span className="text-sm font-mono font-medium">
          {state.coins.toLocaleString()} coins
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-card/40 border border-border rounded-xl p-1">
        {TAB_LABELS.map((label, i) => {
          const count    = i === 0 ? seedCount : i === 1 ? bloomCount : supplyCount;
          const newCount = i === 0 ? newSeeds  : i === 1 ? newBlooms  : newSupplies;
          const subKey   = (i === 0 ? "seeds" : i === 1 ? "blooms" : "supplies") as "seeds" | "blooms" | "supplies";
          return (
            <button
              key={label}
              onClick={() => {
                setTab(i as Tab);
                onSubTabView?.(subKey);
              }}
              className={`
                flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all relative
                ${tab === i
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground"
                }
              `}
            >
              {label}
              {count > 0 && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                  tab === i ? "bg-primary/20 text-primary" : "bg-border text-muted-foreground"
                }`}>
                  {count}
                </span>
              )}
              {newCount > 0 && tab !== i && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full text-[10px] text-primary-foreground flex items-center justify-center font-bold">
                  {newCount > 9 ? "9+" : newCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="space-y-3">

        {/* ── Seeds ───────────────────────────────────────────────────────── */}
        {tab === 0 && (
          seeds.length > 0 ? (
            seeds.map((item, i) => (
              <SeedInventoryRow key={`seed-${item.speciesId}-${i}`} item={item} />
            ))
          ) : (
            <EmptyTab emoji="🌱" message="No seeds in inventory" hint="Buy seeds from the Shop to get started." />
          )
        )}

        {/* ── Blooms ──────────────────────────────────────────────────────── */}
        {tab === 1 && (
          blooms.length > 0 ? (
            <>
              <button
                onClick={handleSellAll}
                className="w-full py-2.5 rounded-xl border border-primary text-primary text-sm font-semibold hover:bg-primary/10 transition-colors text-center"
              >
                Sell All — {totalBloomValue.toLocaleString()} 🟡
              </button>
              {blooms.map((item, i) => (
                <InventoryItemCard
                  key={`bloom-${item.speciesId}-${item.mutation ?? "none"}-${i}`}
                  item={item}
                />
              ))}
            </>
          ) : (
            <EmptyTab emoji="🌸" message="No blooms to sell" hint="Harvest fully-grown flowers from your Garden." />
          )
        )}

        {/* ── Supplies ────────────────────────────────────────────────────── */}
        {tab === 2 && (
          fertilizers.length > 0 || gearItems.length > 0 ? (
            <>
              {fertilizers.map((f) => {
                const fert = FERTILIZERS[f.type];
                return (
                  <div
                    key={f.type}
                    className={`flex items-center gap-4 bg-card/60 border rounded-xl px-4 py-3 ${fert.cardBorder}`}
                  >
                    <span className="text-3xl flex-shrink-0">{fert.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm">{fert.name}</h3>
                        <span className={`text-xs font-mono ${fert.color}`}>
                          {fert.speedMultiplier}× speed
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ×{f.quantity} · Apply to a growing plant in the garden
                      </p>
                    </div>
                  </div>
                );
              })}
              {gearItems.map((g) => (
                <GearInventoryRow key={g.gearType} item={g} />
              ))}
            </>
          ) : (
            <EmptyTab emoji="🧪" message="No supplies" hint="Buy fertilizers and gear from the Supply Shop." />
          )
        )}

      </div>

    </div>
  );
}

function EmptyTab({ emoji, message, hint }: { emoji: string; message: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <span className="text-4xl">{emoji}</span>
      <p className="font-medium text-muted-foreground text-sm">{message}</p>
      <p className="text-xs text-muted-foreground max-w-xs">{hint}</p>
    </div>
  );
}

function GearInventoryRow({ item }: { item: GearInventoryItem }) {
  const def    = GEAR[item.gearType];
  const rarity = RARITY_CONFIG[def.rarity];
  return (
    <div className={`flex items-center gap-4 bg-card/60 border rounded-xl px-4 py-3 ${def.rarity === "prismatic" ? "rainbow-border rainbow-glow" : `${rarity?.glow ?? ""} border-border`}`}>
      <span className="text-3xl flex-shrink-0">{def.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{def.name}</h3>
          <span className={`text-xs font-mono ${rarity?.color}`}>{rarity?.label}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{def.description}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          ×{item.quantity} · Place in your garden to activate
        </p>
      </div>
    </div>
  );
}

function SeedInventoryRow({ item }: { item: InventoryItem }) {
  const species = getFlower(item.speciesId);
  const rarity  = species ? RARITY_CONFIG[species.rarity] : null;
  if (!species) return null;

  return (
    <div className={`flex items-center gap-4 bg-card/60 border rounded-xl px-4 py-3 ${rarity?.glow ?? ""} border-border`}>
      <span className="text-3xl flex-shrink-0">{species.emoji.seed}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{species.name} Seed</h3>
          <span className={`text-xs font-mono ${rarity?.color}`}>{rarity?.label}</span>
        </div>
        <FlowerTypeBadges types={species.types} className="mt-1" />
        <p className="text-xs text-muted-foreground mt-0.5">
          ×{item.quantity} · Plant in your garden to grow
        </p>
      </div>
    </div>
  );
}
