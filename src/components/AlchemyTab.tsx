import { useState, useMemo, useEffect } from "react";
import { useGame } from "../store/GameContext";
import { FLOWER_TYPES, RARITY_CONFIG, getFlower, MUTATIONS } from "../data/flowers";
import {
  ESSENCE_YIELD, calculateEssenceYield, mergeEssences,
  UNIVERSAL_ESSENCE_DISPLAY, UNIVERSAL_ESSENCE_COST_PER_TYPE,
  universalEssenceCraftable, ALL_FLOWER_TYPES,
} from "../data/essences";
import {
  CONSUMABLE_RECIPES, CONSUMABLE_RECIPE_MAP, INFUSER_RECIPES,
  canCraftConsumable, canCraftInfuser,
  applyCraftConsumable, applyCraftInfuser,
  TIER_RARITIES, ROMAN,
  type ConsumableId, type ConsumableCategory,
} from "../data/consumables";
import { sacrificeFlowers, type SacrificeEntry } from "../store/gameStore";
import { edgeAlchemySacrifice, edgeCraftUniversalEssence, edgeAlchemyCraft } from "../lib/edgeFunctions";
import type { MutationType, Rarity, FlowerType } from "../data/flowers";
import type { EssenceItem } from "../data/essences";

// ── Types ─────────────────────────────────────────────────────────────────

type SacrificeMap = Map<string, number>; // key: "speciesId||mutation"

function mapKey(speciesId: string, mutation?: MutationType): string {
  return `${speciesId}||${mutation ?? ""}`;
}

function parseKey(key: string): { speciesId: string; mutation?: MutationType } {
  const [speciesId, mutStr] = key.split("||");
  return { speciesId, mutation: (mutStr || undefined) as MutationType | undefined };
}

// ── Sub-component: Essence wallet ─────────────────────────────────────────

function EssenceWallet({ essences }: { essences: EssenceItem[] }) {
  if (essences.length === 0) {
    return (
      <div className="text-center py-4 text-xs text-muted-foreground">
        No essences yet — sacrifice flowers to earn them.
      </div>
    );
  }

  const flowerTypeOrder = Object.keys(FLOWER_TYPES);

  // Flower essences first (by FLOWER_TYPES order), then universal last
  const sorted = [...essences].sort((a, b) => {
    if (a.type === "universal") return 1;
    if (b.type === "universal") return -1;
    return flowerTypeOrder.indexOf(a.type) - flowerTypeOrder.indexOf(b.type);
  });

  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
      {sorted.map(({ type, amount }) => {
        const cfg = type === "universal"
          ? UNIVERSAL_ESSENCE_DISPLAY
          : FLOWER_TYPES[type as FlowerType];
        return (
          <div
            key={type}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs ${cfg.bgColor} ${cfg.borderColor}`}
          >
            <span className="text-sm shrink-0">{cfg.emoji}</span>
            <div className="min-w-0">
              <p className={`font-semibold leading-none ${cfg.color}`}>{amount}</p>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5 truncate">{cfg.name}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Sub-component: Sacrifice preview strip ────────────────────────────────

function SacrificePreview({ selections }: { selections: SacrificeMap }) {
  const preview = useMemo(() => {
    let acc: EssenceItem[] = [];
    for (const [key, qty] of selections) {
      if (qty <= 0) continue;
      const { speciesId } = parseKey(key);
      const flower = getFlower(speciesId);
      if (!flower) continue;
      const yields = calculateEssenceYield(flower.types, flower.rarity, qty);
      acc = mergeEssences(acc, yields);
    }
    return acc;
  }, [selections]);

  if (preview.length === 0) return null;

  return (
    <div className="bg-card/60 border border-border rounded-xl px-3 py-2.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
        You will receive
      </p>
      <div className="flex flex-wrap gap-1.5">
        {preview.map(({ type, amount }) => {
          const cfg = FLOWER_TYPES[type];
          return (
            <span
              key={type}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${cfg.bgColor} ${cfg.borderColor} ${cfg.color}`}
            >
              {cfg.emoji} {amount}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── CraftView component ───────────────────────────────────────────────────

interface CraftViewProps {
  essences:      EssenceItem[];
  consumables:   { id: string; quantity: number }[];
  infusers:      { rarity: string; quantity: number }[];
  craftingItemId: string | null;
  itemCraftError: string | null;
  onCraft:       (craftType: "consumable" | "infuser", id: string) => void;
}

function CostChips({
  cost,
  essences,
  consumables,
  infusers,
}: {
  cost: { kind: string; amounts?: { type: string; amount: number }[]; id?: string; quantity?: number; tier?: number };
  essences:    { type: string; amount: number }[];
  consumables: { id: string; quantity: number }[];
  infusers:    { rarity: string; quantity: number }[];
}) {
  if (cost.kind === "essence" && cost.amounts) {
    return (
      <div className="flex flex-wrap gap-1">
        {cost.amounts.map(({ type, amount }) => {
          const have = essences.find((e) => e.type === type)?.amount ?? 0;
          const ok   = have >= amount;
          const cfg  = type === "universal" ? UNIVERSAL_ESSENCE_DISPLAY : FLOWER_TYPES[type as FlowerType];
          return (
            <span
              key={type}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[10px] font-medium
                ${ok ? `${cfg.bgColor} ${cfg.borderColor} ${cfg.color}` : "bg-border/10 border-border/40 text-muted-foreground/50"}`}
            >
              {cfg.emoji} {amount}
              {!ok && <span className="text-[9px] opacity-60"> ({have})</span>}
            </span>
          );
        })}
      </div>
    );
  }
  if (cost.kind === "consumable" && cost.id) {
    const recipe = CONSUMABLE_RECIPE_MAP[cost.id as ConsumableId];
    const have   = consumables.find((c) => c.id === cost.id)?.quantity ?? 0;
    const ok     = have >= (cost.quantity ?? 2);
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${ok ? "text-foreground" : "text-muted-foreground/50"}`}>
        {recipe?.emoji ?? "?"} ×{cost.quantity} {recipe?.name ?? cost.id}
        <span className={`text-[9px] ${ok ? "text-muted-foreground" : "text-muted-foreground/40"}`}>({have} owned)</span>
      </span>
    );
  }
  if (cost.kind === "infuser" && cost.tier != null) {
    const prevRarity = TIER_RARITIES[cost.tier as 1 | 2 | 3 | 4 | 5];
    const have = infusers.find((i) => i.rarity === prevRarity)?.quantity ?? 0;
    const ok   = have >= (cost.quantity ?? 2);
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${ok ? "text-foreground" : "text-muted-foreground/50"}`}>
        🥢 ×{cost.quantity} Infuser {ROMAN[cost.tier as 1 | 2 | 3 | 4 | 5]}
        <span className={`text-[9px] ${ok ? "text-muted-foreground" : "text-muted-foreground/40"}`}>({have} owned)</span>
      </span>
    );
  }
  return null;
}

function RecipeCard({
  emoji, name, rarity, description, owned, canAfford, isCrafting, cost,
  essences, consumables, infusers, onCraft,
}: {
  emoji: string; name: string; rarity: Rarity; description: string;
  owned: number; canAfford: boolean; isCrafting: boolean;
  cost: Parameters<typeof CostChips>[0]["cost"];
  essences: CraftViewProps["essences"]; consumables: CraftViewProps["consumables"];
  infusers: CraftViewProps["infusers"]; onCraft: () => void;
}) {
  const rc = RARITY_CONFIG[rarity];
  return (
    <div className={`rounded-xl border p-3 transition-colors ${canAfford ? "border-border bg-card/60" : "border-border/40 bg-card/20 opacity-60"}`}>
      <div className="flex items-start gap-2.5 mb-2">
        <span className="text-xl mt-0.5 shrink-0">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold flex items-center gap-1.5 flex-wrap">
            {name}
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${rc.color} border-current bg-current/10`}>
              {rc.label}
            </span>
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
        </div>
      </div>

      <CostChips cost={cost} essences={essences} consumables={consumables} infusers={infusers} />

      <div className="flex items-center justify-between mt-2.5">
        <span className="text-[10px] text-muted-foreground">Owned: <span className="text-foreground font-semibold">{owned}</span></span>
        <button
          onClick={onCraft}
          disabled={!canAfford || isCrafting}
          className="px-3 py-1 rounded-lg text-[11px] font-semibold border transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
            border-primary/50 text-primary hover:bg-primary/10 enabled:hover:scale-[1.02]"
        >
          {isCrafting ? "…" : "Craft"}
        </button>
      </div>
    </div>
  );
}

const CRAFT_CATEGORIES: { id: ConsumableCategory | "infuser"; label: string; emoji: string }[] = [
  { id: "infuser",        label: "Infusers",        emoji: "🥢" },
  { id: "growth",         label: "Growth",          emoji: "🌱" },
  { id: "mutation_boost", label: "Mutation Boosts",  emoji: "🧪" },
  { id: "utility",        label: "Utility",          emoji: "⚙️" },
  { id: "seed_pouch",     label: "Seed Pouches",     emoji: "🎁" },
];

function CraftView({ essences, consumables, infusers, craftingItemId, itemCraftError, onCraft }: CraftViewProps) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[11px] text-muted-foreground">
        Craft consumable items and infusers from your essence bank. Tier I items cost essence; higher tiers upgrade from 2 of the previous tier.
      </p>

      {itemCraftError && (
        <div className="bg-destructive/10 border border-destructive/40 rounded-xl px-3 py-2 text-xs text-destructive">
          {itemCraftError}
        </div>
      )}

      {CRAFT_CATEGORIES.map(({ id: catId, label, emoji: catEmoji }) => {
        const isInfuser = catId === "infuser";

        const cards = isInfuser
          ? INFUSER_RECIPES.map((recipe) => {
              const owned     = infusers.find((i) => i.rarity === recipe.rarity)?.quantity ?? 0;
              const affordable = canCraftInfuser(recipe, essences, infusers);
              return (
                <RecipeCard
                  key={`infuser-${recipe.tier}`}
                  emoji="🥢"
                  name={recipe.name}
                  rarity={recipe.rarity}
                  description={recipe.description}
                  owned={owned}
                  canAfford={affordable}
                  isCrafting={craftingItemId === String(recipe.tier)}
                  cost={recipe.cost as Parameters<typeof CostChips>[0]["cost"]}
                  essences={essences}
                  consumables={consumables}
                  infusers={infusers}
                  onCraft={() => onCraft("infuser", String(recipe.tier))}
                />
              );
            })
          : CONSUMABLE_RECIPES
              .filter((r) => r.category === catId)
              .map((recipe) => {
                const owned      = consumables.find((c) => c.id === recipe.id)?.quantity ?? 0;
                const affordable = canCraftConsumable(recipe, essences, consumables);
                return (
                  <RecipeCard
                    key={recipe.id}
                    emoji={recipe.emoji}
                    name={recipe.name}
                    rarity={recipe.rarity}
                    description={recipe.description}
                    owned={owned}
                    canAfford={affordable}
                    isCrafting={craftingItemId === recipe.id}
                    cost={recipe.cost as Parameters<typeof CostChips>[0]["cost"]}
                    essences={essences}
                    consumables={consumables}
                    infusers={infusers}
                    onCraft={() => onCraft("consumable", recipe.id)}
                  />
                );
              });

        return (
          <div key={catId}>
            <p className="text-xs font-semibold mb-2">{catEmoji} {label}</p>
            <div className="grid grid-cols-1 gap-2">
              {cards}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main AlchemyTab component ─────────────────────────────────────────────

type AlchemyView = "sacrifice" | "essences" | "craft";

export function AlchemyTab() {
  const { state, perform, getState, update } = useGame();

  const [view, setView]             = useState<AlchemyView>("sacrifice");
  const [selections, setSelections] = useState<SacrificeMap>(new Map());
  const [activeRarities, setActiveRarities] = useState<Rarity[]>([]);
  const [activeTypes,    setActiveTypes]    = useState<FlowerType[]>([]);
  const [sacrificing,    setSacrificing]    = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [success,        setSuccess]        = useState<EssenceItem[] | null>(null);
  const [successVisible, setSuccessVisible] = useState(false);

  // Universal Essence craft panel state
  const [craftQty,      setCraftQty]      = useState(1);
  const [crafting,      setCrafting]      = useState(false);
  const [craftError,    setCraftError]    = useState<string | null>(null);
  const [craftSuccess,  setCraftSuccess]  = useState<number | null>(null);
  const [craftSuccessVisible, setCraftSuccessVisible] = useState(false);

  // Consumable / infuser craft state
  const [craftingItemId,        setCraftingItemId]        = useState<string | null>(null);
  const [itemCraftError,        setItemCraftError]        = useState<string | null>(null);
  const [itemCraftSuccess,      setItemCraftSuccess]      = useState<{ name: string; emoji: string } | null>(null);
  const [itemCraftSuccessVisible, setItemCraftSuccessVisible] = useState(false);


  // Auto-dismiss success toast
  useEffect(() => {
    if (!success) return;
    const frame = requestAnimationFrame(() => setSuccessVisible(true));
    const timer = setTimeout(() => {
      setSuccessVisible(false);
      setTimeout(() => setSuccess(null), 400);
    }, 3_000);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [success]);

  // Auto-dismiss craft success
  useEffect(() => {
    if (!craftSuccess) return;
    const frame = requestAnimationFrame(() => setCraftSuccessVisible(true));
    const timer = setTimeout(() => {
      setCraftSuccessVisible(false);
      setTimeout(() => setCraftSuccess(null), 400);
    }, 3_000);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [craftSuccess]);

  // Inventory of harvested (non-seed) flowers grouped by rarity
  const sacrificableByRarity = useMemo(() => {
    const map = new Map<Rarity, typeof state.inventory[number][]>();
    for (const item of state.inventory) {
      if (item.isSeed || item.quantity <= 0) continue;
      const flower = getFlower(item.speciesId);
      if (!flower) continue;
      const list = map.get(flower.rarity) ?? [];
      list.push(item);
      map.set(flower.rarity, list);
    }
    return map;
  }, [state.inventory]);

  const rarityOrder: Rarity[] = ["common", "uncommon", "rare", "legendary", "mythic", "exalted", "prismatic"];

  // Items after rarity filter (before type filter) — used to compute available types
  const rarityFiltered = useMemo(() => {
    if (activeRarities.length === 0) return rarityOrder.flatMap((r) => sacrificableByRarity.get(r) ?? []);
    return activeRarities.flatMap((r) => sacrificableByRarity.get(r) ?? []);
  }, [activeRarities, sacrificableByRarity]);

  // Which types have at least one item in the current rarity selection
  const availableTypes = useMemo(() => {
    const set = new Set<FlowerType>();
    for (const item of rarityFiltered) {
      const flower = getFlower(item.speciesId);
      flower?.types.forEach((t) => set.add(t));
    }
    return set;
  }, [rarityFiltered]);

  const typeOrder = Object.keys(FLOWER_TYPES) as FlowerType[];

  const filteredItems = useMemo(() => {
    if (activeTypes.length === 0) return rarityFiltered;
    return rarityFiltered.filter((item) => {
      const flower = getFlower(item.speciesId);
      return flower?.types.some((t) => activeTypes.includes(t)) ?? false;
    });
  }, [activeTypes, rarityFiltered]);

  const totalSelected = useMemo(() =>
    Array.from(selections.values()).reduce((sum, n) => sum + n, 0),
    [selections]
  );

  function setQty(speciesId: string, mutation: MutationType | undefined, qty: number) {
    const key = mapKey(speciesId, mutation);
    setSelections((prev) => {
      const next = new Map(prev);
      if (qty <= 0) next.delete(key);
      else next.set(key, qty);
      return next;
    });
  }

  function getQty(speciesId: string, mutation: MutationType | undefined): number {
    return selections.get(mapKey(speciesId, mutation)) ?? 0;
  }

  function handleSelectAll() {
    const next = new Map(selections);
    for (const item of filteredItems) {
      const available = item.quantity - (next.get(mapKey(item.speciesId, item.mutation)) ?? 0);
      if (available > 0) {
        next.set(mapKey(item.speciesId, item.mutation), item.quantity);
      }
    }
    setSelections(next);
  }

  function handleClearRarity() {
    const next = new Map(selections);
    for (const item of filteredItems) {
      next.delete(mapKey(item.speciesId, item.mutation));
    }
    setSelections(next);
  }

  async function handleSacrifice() {
    if (sacrificing || totalSelected === 0) return;
    setSacrificing(true);
    setError(null);

    const sacrifices: SacrificeEntry[] = [];
    for (const [key, quantity] of selections) {
      if (quantity <= 0) continue;
      const { speciesId, mutation } = parseKey(key);
      sacrifices.push({ speciesId, mutation, quantity });
    }

    const optimistic = sacrificeFlowers(state, sacrifices);
    if (!optimistic) {
      setError("Invalid selection — check your inventory.");
      setSacrificing(false);
      return;
    }

    // Snapshot essences before the sacrifice so we can compute the gain delta
    const prevEssences = state.essences ?? [];

    let succeeded = false;

    await perform(
      optimistic,
      () => edgeAlchemySacrifice(
        sacrifices.map((s) => ({
          speciesId: s.speciesId,
          mutation:  s.mutation as string | undefined,
          quantity:  s.quantity,
        }))
      ),
      (result) => {
        // Show only what was gained, not the entire bank
        const gained = result.essences
          .map((e) => ({
            type:   e.type,
            amount: e.amount - (prevEssences.find((p) => p.type === e.type)?.amount ?? 0),
          }))
          .filter((e) => e.amount > 0);
        setSuccess(gained);
        setSelections(new Map());
        succeeded = true;
      },
    );

    if (!succeeded) {
      setError("Sacrifice failed — please try again.");
    }

    setSacrificing(false);
  }

  // Auto-dismiss item craft success toast
  useEffect(() => {
    if (!itemCraftSuccess) return;
    const frame = requestAnimationFrame(() => setItemCraftSuccessVisible(true));
    const timer = setTimeout(() => {
      setItemCraftSuccessVisible(false);
      setTimeout(() => setItemCraftSuccess(null), 400);
    }, 2_500);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [itemCraftSuccess]);

  async function handleCraftItem(craftType: "consumable" | "infuser", id: string) {
    if (craftingItemId) return;
    setCraftingItemId(id);
    setItemCraftError(null);

    const cur = getState();
    const essences    = cur.essences    ?? [];
    const consumables = cur.consumables ?? [];
    const infusers    = cur.infusers    ?? [];

    let optimistic: typeof cur | null = null;
    let displayName = "";
    let displayEmoji = "";

    if (craftType === "consumable") {
      const recipe = CONSUMABLE_RECIPE_MAP[id as ConsumableId];
      if (!recipe) { setItemCraftError("Unknown recipe."); setCraftingItemId(null); return; }
      const result = applyCraftConsumable(recipe, essences, consumables);
      if (!result) { setItemCraftError("Not enough ingredients."); setCraftingItemId(null); return; }
      optimistic = { ...cur, essences: result.essences, consumables: result.consumables };
      displayName  = recipe.name;
      displayEmoji = recipe.emoji;
    } else {
      const tier   = parseInt(id, 10) as 1 | 2 | 3 | 4 | 5;
      const recipe = INFUSER_RECIPES.find((r) => r.tier === tier);
      if (!recipe) { setItemCraftError("Unknown infuser tier."); setCraftingItemId(null); return; }
      const result = applyCraftInfuser(recipe, essences, infusers);
      if (!result) { setItemCraftError("Not enough ingredients."); setCraftingItemId(null); return; }
      optimistic = { ...cur, essences: result.essences, infusers: result.infusers };
      displayName  = recipe.name;
      displayEmoji = "🥢";
    }

    try {
      perform(
        optimistic!,
        () => edgeAlchemyCraft(craftType, id),
        (res) => {
          const fresh = getState();
          update({ ...fresh, essences: res.essences, consumables: res.consumables, infusers: res.infusers, serverUpdatedAt: res.serverUpdatedAt });
          setItemCraftSuccess({ name: displayName, emoji: displayEmoji });
        },
      );
    } catch (e: unknown) {
      setItemCraftError(e instanceof Error ? e.message : "Craft failed.");
    } finally {
      setCraftingItemId(null);
    }
  }

  // Universal Essence craftable count
  const universalCraftable = universalEssenceCraftable(state.essences ?? []);

  async function handleCraftUniversal() {
    if (crafting || craftQty <= 0 || craftQty > universalCraftable) return;
    setCrafting(true);
    setCraftError(null);
    try {
      const res = await edgeCraftUniversalEssence(craftQty);
      const cur = getState();
      update({ ...cur, essences: res.essences, serverUpdatedAt: res.serverUpdatedAt });
      setCraftSuccess(craftQty);
      setCraftQty(1);
    } catch (e: unknown) {
      setCraftError(e instanceof Error ? e.message : "Craft failed — please try again.");
    } finally {
      setCrafting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">

      {/* Tab switcher: Sacrifice | Essences | Craft */}
      <div className="flex rounded-xl border border-border bg-card/40 p-0.5 gap-0.5">
        {(["sacrifice", "essences", "craft"] as AlchemyView[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`
              flex-1 py-1.5 rounded-[10px] text-xs font-semibold text-center capitalize transition-all duration-150
              ${view === v
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
              }
            `}
          >
            {v === "sacrifice" ? "⚗️ Sacrifice" : v === "essences" ? "✨ Essences" : "🔨 Craft"}
          </button>
        ))}
      </div>

      {/* ── ESSENCES view ── */}
      {view === "essences" && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold mb-0.5">Essence Bank</p>
            <p className="text-[11px] text-muted-foreground">
              Essences are earned by sacrificing flowers. Combine all 12 elemental essences into a Universal Essence for cross-breeding recipes.
            </p>
          </div>
          <EssenceWallet essences={state.essences ?? []} />

          {/* Universal Essence craft panel */}
          <div className="rounded-xl border border-slate-200/20 bg-slate-200/5 px-4 py-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-200">✦ Craft Universal Essence</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Costs {UNIVERSAL_ESSENCE_COST_PER_TYPE} of each elemental essence per craft.
              </p>
            </div>

            {/* Ingredient chips — all 12 types */}
            <div className="flex flex-wrap gap-1">
              {ALL_FLOWER_TYPES.map((type) => {
                const cfg  = FLOWER_TYPES[type];
                const have = (state.essences ?? []).find((e) => e.type === type)?.amount ?? 0;
                const need = UNIVERSAL_ESSENCE_COST_PER_TYPE * craftQty;
                const ok   = have >= need;
                return (
                  <span
                    key={type}
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[10px] font-medium
                      ${ok ? `${cfg.bgColor} ${cfg.borderColor} ${cfg.color}` : "bg-border/10 border-border/40 text-muted-foreground/50"}`}
                  >
                    {cfg.emoji} {have}/{need}
                  </span>
                );
              })}
            </div>

            {/* Craftable count + qty selector + button */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                Craftable: <span className="text-slate-200 font-semibold">{universalCraftable}</span>
              </span>
              <div className="flex items-center gap-1 ml-auto">
                <button
                  onClick={() => setCraftQty((q) => Math.max(1, q - 1))}
                  disabled={craftQty <= 1}
                  className="w-6 h-6 rounded-md border border-border text-muted-foreground text-xs flex items-center justify-center hover:border-primary/50 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  −
                </button>
                <span className="w-6 text-center text-xs font-mono text-foreground">{craftQty}</span>
                <button
                  onClick={() => setCraftQty((q) => Math.min(universalCraftable, q + 1))}
                  disabled={craftQty >= universalCraftable}
                  className="w-6 h-6 rounded-md border border-border text-muted-foreground text-xs flex items-center justify-center hover:border-primary/50 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  +
                </button>
                <button
                  onClick={() => setCraftQty(universalCraftable)}
                  disabled={craftQty >= universalCraftable || universalCraftable === 0}
                  className="ml-1 text-[9px] text-primary font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Max
                </button>
              </div>
              <button
                onClick={handleCraftUniversal}
                disabled={crafting || universalCraftable === 0}
                className="px-3 py-1.5 rounded-lg bg-slate-200/10 border border-slate-200/25 text-slate-200 text-xs font-semibold hover:bg-slate-200/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {crafting ? "Crafting…" : "Craft"}
              </button>
            </div>

            {craftError && (
              <p className="text-[10px] text-destructive">{craftError}</p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card/40 px-4 py-3">
            <p className="text-xs font-semibold mb-2">Essence Yield Table</p>
            <div className="space-y-1">
              {rarityOrder.map((rarity) => {
                const cfg = RARITY_CONFIG[rarity];
                return (
                  <div key={rarity} className="flex items-center justify-between text-xs">
                    <span className={cfg.color}>{cfg.label}</span>
                    <span className="text-muted-foreground font-mono">
                      {ESSENCE_YIELD[rarity]} per flower
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── SACRIFICE view ── */}
      {view === "sacrifice" && (
        <div className="flex flex-col gap-4">

          {/* Description */}
          <p className="text-[11px] text-muted-foreground">
            Sacrifice harvested flowers to extract their elemental essence. Higher rarity yields more essence.
          </p>

          {/* Essence bank — always visible at top */}
          {(state.essences ?? []).length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
                Essence Bank
              </p>
              <EssenceWallet essences={state.essences ?? []} />
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/40 rounded-xl px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Rarity filter tabs */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
              Filter by rarity
            </p>
            <div className="flex flex-wrap gap-1.5">
              {/* All button */}
              <button
                onClick={() => setActiveRarities([])}
                className={`
                  px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all duration-150
                  ${activeRarities.length === 0
                    ? "border-foreground bg-foreground/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                  }
                `}
              >
                All
              </button>
              {rarityOrder.map((rarity) => {
                const cfg      = RARITY_CONFIG[rarity];
                const hasAny   = (sacrificableByRarity.get(rarity)?.length ?? 0) > 0;
                const isActive = activeRarities.includes(rarity);
                return (
                  <button
                    key={rarity}
                    onClick={() => setActiveRarities((prev) =>
                      isActive ? prev.filter((r) => r !== rarity) : [...prev, rarity]
                    )}
                    disabled={!hasAny}
                    className={`
                      px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all duration-150
                      ${isActive
                        ? `border-current bg-current/10 ${cfg.color}`
                        : hasAny
                          ? `border-border text-muted-foreground hover:border-current hover:${cfg.color}`
                          : "border-border/30 text-muted-foreground/30 cursor-not-allowed"
                      }
                    `}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Type filter */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
              Filter by type
            </p>
            <div className="flex flex-wrap gap-1.5">
              {typeOrder.map((type) => {
                const cfg      = FLOWER_TYPES[type];
                const hasAny   = availableTypes.has(type);
                const isActive = activeTypes.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => setActiveTypes((prev) =>
                      isActive ? prev.filter((t) => t !== type) : [...prev, type]
                    )}
                    disabled={!hasAny}
                    className={`
                      inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold transition-all duration-150
                      ${isActive
                        ? `${cfg.bgColor} ${cfg.borderColor} ${cfg.color}`
                        : hasAny
                          ? `border-border text-muted-foreground hover:${cfg.bgColor} hover:${cfg.borderColor} hover:${cfg.color}`
                          : "border-border/30 text-muted-foreground/30 cursor-not-allowed"
                      }
                    `}
                  >
                    {cfg.emoji} {cfg.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Flower grid */}
          {filteredItems.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">
                  {activeRarities.length === 0 && activeTypes.length === 0
                    ? "All flowers"
                    : <>
                        {activeRarities.map((r) => (
                          <span key={r} className={`${RARITY_CONFIG[r].color} mr-1`}>{RARITY_CONFIG[r].label}</span>
                        ))}
                        {activeTypes.map((t) => (
                          <span key={t} className={`${FLOWER_TYPES[t].color} mr-1`}>{FLOWER_TYPES[t].emoji} {FLOWER_TYPES[t].name}</span>
                        ))}
                        <span>flowers</span>
                      </>
                  }
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleSelectAll}
                    className="text-[10px] text-primary hover:text-primary/80 font-semibold"
                  >
                    Select all
                  </button>
                  <button
                    onClick={() => { handleClearRarity(); }}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Clear selection
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {filteredItems.map((item) => {
                  const flower  = getFlower(item.speciesId);
                  if (!flower) return null;
                  const mut     = item.mutation ? MUTATIONS[item.mutation as MutationType] : null;
                  const qty     = getQty(item.speciesId, item.mutation as MutationType | undefined);
                  const avail   = item.quantity;
                  const isSelected = qty > 0;

                  return (
                    <div
                      key={`${item.speciesId}${item.mutation ?? ""}`}
                      className={`
                        relative rounded-xl border p-3 transition-all duration-150
                        ${isSelected
                          ? "border-primary/60 bg-primary/10"
                          : "border-border bg-card/60"
                        }
                      `}
                    >
                      {/* Top row */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">{flower.emoji.bloom}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {mut ? <span className={mut.color}>{mut.emoji} </span> : null}
                            {flower.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            <span className={RARITY_CONFIG[flower.rarity].color}>{RARITY_CONFIG[flower.rarity].label}</span>
                            {" · "}{avail} available
                            {isSelected && ` · ${qty} selected`}
                          </p>
                        </div>
                      </div>

                      {/* Type pills */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {flower.types.map((t) => {
                          const tc = FLOWER_TYPES[t];
                          return (
                            <span
                              key={t}
                              className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${tc.bgColor} ${tc.borderColor} ${tc.color}`}
                            >
                              {tc.emoji} {tc.name}
                            </span>
                          );
                        })}
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setQty(item.speciesId, item.mutation as MutationType | undefined, qty - 1)}
                          disabled={qty <= 0}
                          className="w-6 h-6 rounded-md border border-border text-muted-foreground text-xs flex items-center justify-center hover:border-primary/50 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          −
                        </button>
                        <span className="flex-1 text-center text-xs font-mono text-muted-foreground">
                          {qty}
                        </span>
                        <button
                          onClick={() => setQty(item.speciesId, item.mutation as MutationType | undefined, Math.min(qty + 1, avail))}
                          disabled={qty >= avail}
                          className="w-6 h-6 rounded-md border border-border text-muted-foreground text-xs flex items-center justify-center hover:border-primary/50 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          +
                        </button>
                        <button
                          onClick={() => setQty(item.speciesId, item.mutation as MutationType | undefined, avail)}
                          disabled={qty >= avail}
                          className="ml-1 text-[9px] text-primary font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Max
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state — no flowers in inventory at all */}
          {filteredItems.length === 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground space-y-1">
              <p className="text-2xl">⚗️</p>
              <p>Harvest some flowers to sacrifice them.</p>
            </div>
          )}

          {/* Preview */}
          <SacrificePreview selections={selections} />

          {/* Summary + Sacrifice button */}
          {totalSelected > 0 && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-center text-xs text-muted-foreground">
                {totalSelected} flower{totalSelected !== 1 ? "s" : ""} selected
              </p>
              <button
                onClick={handleSacrifice}
                disabled={sacrificing}
                className={`
                  px-10 py-3 rounded-full text-sm font-semibold border transition-all duration-200
                  ${sacrificing
                    ? "border-border text-muted-foreground opacity-50 cursor-not-allowed"
                    : "border-destructive/60 text-destructive hover:bg-destructive/10 hover:scale-[1.02]"
                  }
                `}
              >
                {sacrificing ? "Sacrificing…" : `Sacrifice ${totalSelected} flower${totalSelected !== 1 ? "s" : ""}`}
              </button>
            </div>
          )}

        </div>
      )}

      {/* ── CRAFT view ── */}
      {view === "craft" && (
        <CraftView
          essences={state.essences ?? []}
          consumables={state.consumables ?? []}
          infusers={state.infusers ?? []}
          craftingItemId={craftingItemId}
          itemCraftError={itemCraftError}
          onCraft={handleCraftItem}
        />
      )}

      {/* ── Item craft success toast ── */}
      {itemCraftSuccess && (
        <div
          className={`
            fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none
            transition-all duration-400
            ${itemCraftSuccessVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
          `}
        >
          <div className="flex items-center gap-3 bg-card border border-primary/40 rounded-2xl px-5 py-4 shadow-2xl shadow-primary/10 min-w-56">
            <span className="text-2xl">{itemCraftSuccess.emoji}</span>
            <div>
              <p className="text-sm font-bold text-primary mb-0.5">Crafted!</p>
              <p className="text-[11px] text-muted-foreground">{itemCraftSuccess.name}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Universal Essence craft success toast ── */}
      {craftSuccess && (
        <div
          className={`
            fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none
            transition-all duration-400
            ${craftSuccessVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
          `}
        >
          <div className="flex items-center gap-3 bg-card border border-slate-200/30 rounded-2xl px-5 py-4 shadow-2xl min-w-64">
            <span className="text-2xl">✦</span>
            <div>
              <p className="text-sm font-bold text-slate-200 mb-0.5">Crafted!</p>
              <p className="text-[11px] text-muted-foreground">+{craftSuccess} Universal Essence</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Success toast (floating, auto-dismiss) ── */}
      {success && (
        <div
          className={`
            fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none
            transition-all duration-400
            ${successVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
          `}
        >
          <div className="flex items-center gap-3 bg-card border border-primary/40 rounded-2xl px-5 py-4 shadow-2xl shadow-primary/10 min-w-64">
            <span className="text-2xl">⚗️</span>
            <div>
              <p className="text-sm font-bold text-primary mb-1.5">Sacrifice complete!</p>
              <div className="flex flex-wrap gap-1.5">
                {success.filter((e) => e.amount > 0).map(({ type, amount }) => {
                  const cfg = type === "universal"
                    ? UNIVERSAL_ESSENCE_DISPLAY
                    : FLOWER_TYPES[type as FlowerType];
                  return (
                    <span
                      key={type}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${cfg.bgColor} ${cfg.borderColor} ${cfg.color}`}
                    >
                      {cfg.emoji} +{amount}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
