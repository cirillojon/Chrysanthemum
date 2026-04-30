import { useState, useEffect } from "react";
import { useGame } from "../store/GameContext";
import { getFlower, RARITY_CONFIG, MUTATIONS, FLOWER_TYPES } from "../data/flowers";
import type { FlowerType, MutationType } from "../data/flowers";
import {
  ALL_FLOWER_TYPES, UNIVERSAL_ESSENCE_DISPLAY, UNIVERSAL_ESSENCE_TYPE,
} from "../data/essences";
import { FlowerTypeBadges } from "./FlowerTypeBadges";
import { InventoryItemCard } from "./InventoryItemCard";
import { sellFlower, rollbackSellAll, applyEclipseTonic, type InventoryItem } from "../store/gameStore";
import { edgeSellAll, edgeUseEclipseTonic, edgeAlchemyCraftSeed, edgeActivateBoost } from "../lib/edgeFunctions";
import { FERTILIZERS } from "../data/upgrades";
import { GEAR } from "../data/gear";
import type { GearInventoryItem } from "../data/gear";
import { CONSUMABLE_RECIPE_MAP, ROMAN, type ConsumableId } from "../data/consumables";

type Tab = 0 | 1 | 2 | 3 | 4;
const TAB_LABELS = ["Seeds", "Blooms", "Supplies", "Consumables", "Essences"] as const;

interface Props {
  newSeeds?:    number;
  newBlooms?:   number;
  newSupplies?: number;
  onSubTabView?: (subTab: "seeds" | "blooms" | "supplies") => void;
}

export function Inventory({ newSeeds = 0, newBlooms = 0, newSupplies = 0, onSubTabView }: Props) {
  const { state, perform, getState, awaitHarvests, update } = useGame();
  const [tab,                 setTab]                 = useState<Tab>(0);
  const [usingEclipse,        setUsingEclipse]        = useState<string | null>(null);
  const [openingPouch,        setOpeningPouch]        = useState<string | null>(null);
  const [activatingBoost,     setActivatingBoost]     = useState<string | null>(null);
  const [pouchResult,         setPouchResult]         = useState<{ speciesId: string } | null>(null);
  const [pouchResultVisible,  setPouchResultVisible]  = useState(false);

  const items           = state.inventory.filter((i) => i.quantity > 0);
  const seeds           = items.filter((i) => i.isSeed);
  const blooms          = items.filter((i) => !i.isSeed);
  const fertilizers     = state.fertilizers.filter((f) => f.quantity > 0);
  const gearItems       = (state.gearInventory ?? []).filter((g) => g.quantity > 0);
  const consumableItems = (state.consumables ?? []).filter((c) => c.quantity > 0);

  const seedCount        = seeds.reduce((s, i) => s + i.quantity, 0);
  const bloomCount       = blooms.reduce((s, i) => s + i.quantity, 0);
  const supplyCount      = fertilizers.reduce((s, f) => s + f.quantity, 0)
                         + gearItems.reduce((s, g) => s + g.quantity, 0);
  const consumableCount  = consumableItems.reduce((s, c) => s + c.quantity, 0);
  const essenceItems     = (state.essences ?? []).filter((e) => e.amount > 0);
  const essenceCount     = essenceItems.reduce((s, e) => s + e.amount, 0);

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

    // Snapshot the coin delta so the rollback can subtract exactly what was
    // optimistically added — without touching coins gained from concurrent
    // actions (a harvest sell card, a marketplace claim, etc.).
    const earned = optimistic.coins - current.coins;

    // Single atomic server write — one CAS check, no partial-failure rollback risk.
    // perform() auto-merges the SellAllResult (coins + inventory) on success.
    // On failure, rollbackSellAll undoes only the sold blooms + earnings against
    // whatever state looks like AT rollback time, leaving concurrent harvests
    // and other changes intact.
    await perform(
      optimistic,
      () => edgeSellAll(items),
      undefined,
      { rollback: (c) => rollbackSellAll(c, items, earned) }
    );
  }

  async function handleUseEclipseTonic(consumableId: ConsumableId) {
    if (usingEclipse) return;
    const recipe = CONSUMABLE_RECIPE_MAP[consumableId];
    if (!recipe?.advanceHours) return;
    const cur = getState();
    const optimistic = applyEclipseTonic(cur, consumableId, recipe.advanceHours);
    if (!optimistic) return;
    const savedConsumables = cur.consumables;
    const savedGrid        = cur.grid;
    setUsingEclipse(consumableId);
    perform(
      optimistic,
      () => edgeUseEclipseTonic(consumableId),
      () => setUsingEclipse(null),
      {
        rollback: (c) => ({
          ...c,
          grid: savedGrid,
          consumables: savedConsumables,
          lastEclipseTonic: cur.lastEclipseTonic,
        }),
      }
    );
  }

  // Auto-dismiss pouch result toast
  useEffect(() => {
    if (!pouchResult) return;
    const frame = requestAnimationFrame(() => setPouchResultVisible(true));
    const timer = setTimeout(() => {
      setPouchResultVisible(false);
      setTimeout(() => setPouchResult(null), 400);
    }, 4_000);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [pouchResult]);

  async function handleOpenPouch(consumableId: ConsumableId) {
    if (openingPouch) return;
    setOpeningPouch(consumableId);
    try {
      const res = await edgeAlchemyCraftSeed(consumableId);
      const cur = getState();
      update({ ...cur, inventory: res.inventory, consumables: res.consumables, serverUpdatedAt: res.serverUpdatedAt });
      setPouchResult({ speciesId: res.outputSpeciesId });
    } catch {
      // silent — pouch stays in inventory on failure
    } finally {
      setOpeningPouch(null);
    }
  }

  // Phase 5a — activate a Verdant Rush / Forge Haste / Resonance Draft.
  // No optimistic state because the duration depends on consumable tier and we
  // already trust the server response. Roundtrip is one quick edge call.
  async function handleActivateBoost(consumableId: ConsumableId) {
    if (activatingBoost) return;
    setActivatingBoost(consumableId);
    try {
      const res = await edgeActivateBoost(consumableId);
      const cur = getState();
      update({
        ...cur,
        consumables:     res.consumables,
        activeBoosts:    res.activeBoosts,
        serverUpdatedAt: res.serverUpdatedAt,
      });
    } catch {
      // silent — server rejected (e.g. CAS miss); the consumable wasn't deducted
    } finally {
      setActivatingBoost(null);
    }
  }

  const isEmpty = items.length === 0 && fertilizers.length === 0 && gearItems.length === 0
               && consumableItems.length === 0;

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
    <>
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
          const count    = i === 0 ? seedCount
                         : i === 1 ? bloomCount
                         : i === 2 ? supplyCount
                         : i === 3 ? consumableCount
                         : essenceCount;
          const newCount = i === 0 ? newSeeds
                         : i === 1 ? newBlooms
                         : i === 2 ? newSupplies
                         : 0;
          const subKey   = (i === 0 ? "seeds" : i === 1 ? "blooms" : "supplies") as "seeds" | "blooms" | "supplies";
          return (
            <button
              key={label}
              onClick={() => {
                setTab(i as Tab);
                if (i < 3) onSubTabView?.(subKey);
              }}
              className={`
                flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-semibold transition-all relative
                ${tab === i
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground"
                }
              `}
            >
              {label}
              {count > 0 && (
                <span className={`text-[10px] font-mono px-1 py-0.5 rounded-full ${
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

        {/* ── Consumables ─────────────────────────────────────────────────── */}
        {tab === 3 && (
          consumableItems.length > 0 ? (
            <ConsumablesTabContent
              consumables={consumableItems}
              lastEclipseTonic={state.lastEclipseTonic}
              usingEclipse={usingEclipse}
              openingPouch={openingPouch}
              activatingBoost={activatingBoost}
              activeBoosts={state.activeBoosts ?? []}
              onUseEclipse={handleUseEclipseTonic}
              onOpenPouch={handleOpenPouch}
              onActivateBoost={handleActivateBoost}
            />
          ) : (
            <EmptyTab emoji="🧪" message="No consumables" hint="Craft consumables in the Alchemy lab." />
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

        {/* ── Essences ────────────────────────────────────────────────────── */}
        {tab === 4 && (() => {
          // Always show all 12 elementals + Universal in the same fixed order
          // as the EssenceBank widget. Empty rows dim to 40% so the player can
          // see what's missing — same pattern as the bank tile grid.
          const amountByType = new Map<string, number>(
            (state.essences ?? []).map((e) => [e.type, e.amount])
          );
          const rows = [
            ...ALL_FLOWER_TYPES.map((type) => ({
              type, amount: amountByType.get(type) ?? 0,
              cfg: FLOWER_TYPES[type as FlowerType],
              isUniversal: false,
            })),
            {
              type: UNIVERSAL_ESSENCE_TYPE,
              amount: amountByType.get(UNIVERSAL_ESSENCE_TYPE) ?? 0,
              cfg: UNIVERSAL_ESSENCE_DISPLAY,
              isUniversal: true,
            },
          ];
          return (
            <>
              <p className="text-[11px] text-muted-foreground px-1 pb-1">
                Essences are earned by sacrificing flowers in the Alchemy lab. Combine all 12 elementals into a Universal Essence in Craft → Other.
              </p>
              {rows.map((r) => (
                <EssenceInventoryRow
                  key={r.type}
                  type={r.type}
                  amount={r.amount}
                  emoji={r.cfg.emoji}
                  name={r.cfg.name}
                  color={r.cfg.color}
                  bgColor={r.cfg.bgColor}
                  borderColor={r.cfg.borderColor}
                  isUniversal={r.isUniversal}
                />
              ))}
            </>
          );
        })()}

      </div>

    </div>

    {/* ── Pouch result toast ── */}

    {pouchResult && (() => {
      const flower = getFlower(pouchResult.speciesId);
      return (
        <div
          className={`
            fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none
            transition-all duration-400
            ${pouchResultVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
          `}
        >
          <div className="flex items-center gap-3 bg-card border border-primary/40 rounded-2xl px-5 py-4 shadow-2xl shadow-primary/10 min-w-64">
            <span className="text-2xl">{flower?.emoji.seed ?? "🎁"}</span>
            <div>
              <p className="text-sm font-bold text-primary mb-0.5">Pouch opened!</p>
              <p className="text-[11px] text-muted-foreground">
                {flower?.name ?? pouchResult.speciesId} seed
              </p>
            </div>
          </div>
        </div>
      );
    })()}
    </>
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

function EssenceInventoryRow({
  type, amount, emoji, name, color, bgColor, borderColor, isUniversal,
}: {
  type: string; amount: number; emoji: string; name: string;
  color: string; bgColor: string; borderColor: string; isUniversal: boolean;
}) {
  const empty = amount <= 0;
  // Universal Essence gets the prismatic rainbow treatment; others use their
  // flower-type config. Empty rows dim to 40% but stay visible so the player
  // can see which types they're missing.
  const card = isUniversal
    ? "rainbow-tile border"
    : `bg-card/60 border ${borderColor}`;
  const bg   = isUniversal ? "" : bgColor; // bgColor would conflict with rainbow-tile's animated bg
  const accent = isUniversal ? "rainbow-text" : color;
  return (
    <div
      key={type}
      className={`flex items-center gap-4 rounded-xl px-4 py-3 transition-opacity ${card} ${bg} ${empty ? "opacity-40" : ""}`}
    >
      <span className="text-3xl flex-shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-sm">{name} Essence</h3>
          {isUniversal && (
            <span className="text-xs font-mono rainbow-text">Prismatic</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          ×{amount.toLocaleString()}
          {isUniversal
            ? " · Used in legendary+ cross-breed recipes"
            : " · Sacrifice flowers to earn more"}
        </p>
      </div>
    </div>
  );
}

function GearInventoryRow({ item }: { item: GearInventoryItem }) {
  const def    = GEAR[item.gearType];
  if (!def) return null; // orphan from a removed gear type (cleaned up on next applyOfflineTick)
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

// ── Consumables tab ──────────────────────────────────────────────────────────

const USAGE_CONTEXT: Record<string, string> = {
  bloom_burst:    "Use in Garden (tap a plant)",
  heirloom_charm: "Use in Garden (tap a bloomed plant)",
  purity_vial:    "Use in Garden (tap a plant)",
  giant_vial:     "Use in Garden (tap a plant)",
  frost_vial:     "Use in Garden (tap a plant)",
  ember_vial:     "Use in Garden (tap a plant)",
  storm_vial:     "Use in Garden (tap a plant)",
  moon_vial:      "Use in Garden (tap a plant)",
  golden_vial:    "Use in Garden (tap a plant)",
  rainbow_vial:   "Use in Garden (tap a plant)",
  eclipse_tonic:  "Use below — advances all garden plants",
  wind_shear:     "Use in Supply Shop",
  slot_lock:      "Use in Supply Shop",
  seed_pouch:     "Open below to reveal your mystery seed",
};

function getConsumablePrefix(id: string): string {
  // Trim trailing _1 … _5
  return id.replace(/_\d+$/, "");
}

interface ConsumablesTabProps {
  consumables:      { id: string; quantity: number }[];
  lastEclipseTonic: string | null;
  usingEclipse:     string | null;
  openingPouch:     string | null;
  activatingBoost:  string | null;
  activeBoosts:     { type: string; expiresAt: string; consumableId: string }[];
  onUseEclipse:     (id: ConsumableId) => void;
  onOpenPouch:      (id: ConsumableId) => void;
  onActivateBoost:  (id: ConsumableId) => void;
}

function ConsumablesTabContent({
  consumables, lastEclipseTonic, usingEclipse, openingPouch, activatingBoost, activeBoosts,
  onUseEclipse, onOpenPouch, onActivateBoost,
}: ConsumablesTabProps) {
  const today = new Date().toISOString().slice(0, 10);
  const alreadyUsedToday = lastEclipseTonic === today;

  return (
    <div className="space-y-3">
      {consumables.map((c) => {
        const recipe = CONSUMABLE_RECIPE_MAP[c.id as ConsumableId];
        if (!recipe) return null;
        const prefix    = getConsumablePrefix(c.id);
        const context   = USAGE_CONTEXT[prefix] ?? "Use contextually";
        const isEclipse = c.id.startsWith("eclipse_tonic_");
        const isPouch   = c.id.startsWith("seed_pouch_");
        const isBoost   = recipe.category === "speed_boost";
        const busy      = usingEclipse === c.id;
        const usedToday = isEclipse && alreadyUsedToday;
        const opening   = openingPouch === c.id;
        const activating = activatingBoost === c.id;

        // Surface "currently active" if a boost of this type is live
        const boostType =
          c.id.startsWith("verdant_rush_")    ? "growth"     :
          c.id.startsWith("forge_haste_")     ? "craft"      :
          c.id.startsWith("resonance_draft_") ? "attunement" : null;
        const nowMs       = Date.now();
        const liveBoost   = boostType
          ? activeBoosts.find((b) => b.type === boostType && new Date(b.expiresAt).getTime() > nowMs)
          : null;

        return (
          <div
            key={c.id}
            className="flex items-start gap-3 bg-card/60 border border-border rounded-xl px-4 py-3"
          >
            <span className="text-2xl flex-shrink-0 mt-0.5">{recipe.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm">{recipe.name}</h3>
                {recipe.tier !== null && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${RARITY_CONFIG[recipe.rarity]?.color ?? ""} border-current bg-current/10`}>
                    {RARITY_CONFIG[recipe.rarity]?.label ?? recipe.rarity}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{recipe.description}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">×{c.quantity} · {context}</p>

              {isEclipse && (
                <button
                  onClick={() => onUseEclipse(c.id as ConsumableId)}
                  disabled={busy || usedToday}
                  className={`mt-2 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    usedToday
                      ? "bg-card border border-border text-muted-foreground cursor-not-allowed"
                      : busy
                      ? "bg-primary/20 text-primary"
                      : "bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30"
                  }`}
                >
                  {busy ? "Advancing…" : usedToday ? "Used today" : `🌒 Use (${recipe.advanceHours}h advance)`}
                </button>
              )}

              {isPouch && (
                <button
                  onClick={() => onOpenPouch(c.id as ConsumableId)}
                  disabled={!!openingPouch}
                  className={`mt-2 px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    opening
                      ? "border-primary/40 bg-primary/20 text-primary"
                      : "border-primary/50 text-primary hover:bg-primary/10"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {opening ? "Opening…" : "🎁 Open"}
                </button>
              )}

              {isBoost && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => onActivateBoost(c.id as ConsumableId)}
                    disabled={!!activatingBoost}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                      activating
                        ? "border-primary/40 bg-primary/20 text-primary"
                        : "border-primary/50 text-primary hover:bg-primary/10"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {activating ? "Activating…" : "✨ Activate"}
                  </button>
                  {liveBoost && (
                    <span className="text-[10px] text-amber-400">
                      Active until {new Date(liveBoost.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
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
