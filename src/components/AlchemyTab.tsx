import { useState, useMemo, useEffect, useCallback } from "react";
import { useGame } from "../store/GameContext";
import { FLOWER_TYPES, RARITY_CONFIG, getFlower, MUTATIONS } from "../data/flowers";
import {
  ESSENCE_YIELD, calculateEssenceYield, mergeEssences,
  UNIVERSAL_ESSENCE_DISPLAY,
} from "../data/essences";
import {
  CONSUMABLE_RECIPES, CONSUMABLE_RECIPE_MAP, ATTUNEMENT_RECIPES,
  canCraftConsumable, canCraftAttunement,
  applyCraftConsumable, applyCraftAttunement,
  TIER_RARITIES, ROMAN,
  type ConsumableId, type ConsumableCategory,
} from "../data/consumables";
import { sacrificeFlowers, type SacrificeEntry } from "../store/gameStore";
import { edgeAlchemySacrifice, edgeAlchemyCraft, edgeAlchemyAttune, edgeAlchemyStrip, edgeCraftGear } from "../lib/edgeFunctions";
import { GEAR_RECIPES, canCraftGear, type GearIngredient, type GearRecipe } from "../data/gear-recipes";
import { GEAR, type GearType } from "../data/gear";
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

// ── Typed pouch type labels ────────────────────────────────────────────────

const TYPED_POUCH_TYPES = [
  "blaze", "tide", "grove", "frost", "storm", "lunar",
  "solar", "fairy", "shadow", "arcane", "stellar", "zephyr",
] as const;
type TypedPouchType = typeof TYPED_POUCH_TYPES[number];

// ── CraftView props ────────────────────────────────────────────────────────

interface CraftViewProps {
  essences:      EssenceItem[];
  consumables:   { id: string; quantity: number }[];
  infusers:      { rarity: string; quantity: number }[];
  gearInventory: { gearType: string; quantity: number }[];
  craftingItemId:   string | null;
  itemCraftError:   string | null;
  craftingGearType: string | null;
  gearCraftError:   string | null;
  onCraft:       (craftType: "consumable" | "attunement", id: string) => void;
  onCraftGear:   (outputGearType: string) => void;
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
  if (cost.kind === "attunement" && cost.tier != null) {
    const prevRarity = TIER_RARITIES[cost.tier as 1 | 2 | 3 | 4 | 5];
    const have = infusers.find((i) => i.rarity === prevRarity)?.quantity ?? 0;
    const ok   = have >= (cost.quantity ?? 2);
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${ok ? "text-foreground" : "text-muted-foreground/50"}`}>
        🥢 ×{cost.quantity} Attunement {ROMAN[cost.tier as 1 | 2 | 3 | 4 | 5]}
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

// ── Gear ingredient chips (multi-ingredient) ──────────────────────────────

function GearIngredientChips({
  ingredients,
  essences,
  gearInventory,
  consumables,
}: {
  ingredients:   GearIngredient[];
  essences:      { type: string; amount: number }[];
  gearInventory: { gearType: string; quantity: number }[];
  consumables:   { id: string; quantity: number }[];
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {ingredients.map((ing, i) => {
        if (ing.kind === "essence") {
          const have = essences.find((e) => e.type === ing.essenceType)?.amount ?? 0;
          const ok   = have >= ing.amount;
          const cfg  = ing.essenceType === "universal"
            ? UNIVERSAL_ESSENCE_DISPLAY
            : FLOWER_TYPES[ing.essenceType as FlowerType];
          return (
            <span
              key={i}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[10px] font-medium
                ${ok ? `${cfg.bgColor} ${cfg.borderColor} ${cfg.color}` : "bg-border/10 border-border/40 text-muted-foreground/50"}`}
            >
              {cfg.emoji} {ing.amount}
              {!ok && <span className="text-[9px] opacity-60"> ({have})</span>}
            </span>
          );
        }
        if (ing.kind === "gear") {
          const def  = GEAR[ing.gearType as GearType];
          const have = gearInventory.find((g) => g.gearType === ing.gearType)?.quantity ?? 0;
          const ok   = have >= ing.quantity;
          const rc   = def ? RARITY_CONFIG[def.rarity] : null;
          return (
            <span
              key={i}
              className={`inline-flex items-center gap-1 text-[10px] font-medium ${ok ? "text-foreground" : "text-muted-foreground/50"}`}
            >
              <span className={rc ? rc.color : ""}>{def?.emoji ?? "⚙️"}</span>
              ×{ing.quantity} {def?.name ?? ing.gearType}
              <span className={`text-[9px] ${ok ? "text-muted-foreground" : "text-muted-foreground/40"}`}>({have} owned)</span>
            </span>
          );
        }
        // consumable
        const recipe = CONSUMABLE_RECIPE_MAP[ing.consumableId as ConsumableId];
        const have   = consumables.find((c) => c.id === ing.consumableId)?.quantity ?? 0;
        const ok     = have >= ing.quantity;
        return (
          <span
            key={i}
            className={`inline-flex items-center gap-1 text-[10px] font-medium ${ok ? "text-foreground" : "text-muted-foreground/50"}`}
          >
            {recipe?.emoji ?? "🧪"} ×{ing.quantity} {recipe?.name ?? ing.consumableId}
            <span className={`text-[9px] ${ok ? "text-muted-foreground" : "text-muted-foreground/40"}`}>({have} owned)</span>
          </span>
        );
      })}
    </div>
  );
}

// ── Gear recipe card ──────────────────────────────────────────────────────────

function GearRecipeCard({
  recipe,
  essences,
  gearInventory,
  consumables,
  isCrafting,
  onCraft,
}: {
  recipe:        GearRecipe;
  essences:      { type: string; amount: number }[];
  gearInventory: { gearType: string; quantity: number }[];
  consumables:   { id: string; quantity: number }[];
  isCrafting:    boolean;
  onCraft:       () => void;
}) {
  const def      = GEAR[recipe.outputGearType as GearType];
  const rc       = RARITY_CONFIG[def.rarity];
  const affordable = canCraftGear(recipe, essences, gearInventory, consumables);
  const owned    = gearInventory.find((g) => g.gearType === recipe.outputGearType)?.quantity ?? 0;

  return (
    <div className={`rounded-xl border p-3 transition-colors ${affordable ? "border-border bg-card/60" : "border-border/40 bg-card/20 opacity-60"}`}>
      <div className="flex items-start gap-2.5 mb-2">
        <span className="text-xl mt-0.5 shrink-0">{def.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold flex items-center gap-1.5 flex-wrap">
            {def.name}
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${rc.color} border-current bg-current/10`}>
              {rc.label}
            </span>
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{def.description}</p>
        </div>
      </div>

      <GearIngredientChips
        ingredients={recipe.ingredients}
        essences={essences}
        gearInventory={gearInventory}
        consumables={consumables}
      />

      <div className="flex items-center justify-between mt-2.5">
        <span className="text-[10px] text-muted-foreground">
          Owned: <span className="text-foreground font-semibold">{owned}</span>
        </span>
        <button
          onClick={onCraft}
          disabled={!affordable || isCrafting}
          className="px-3 py-1 rounded-lg text-[11px] font-semibold border transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
            border-primary/50 text-primary hover:bg-primary/10 enabled:hover:scale-[1.02]"
        >
          {isCrafting ? "…" : "⚒️ Craft"}
        </button>
      </div>
    </div>
  );
}

// ── Gear sub-categories ───────────────────────────────────────────────────────

type GearSubCat = "sprinkler" | "mutation" | "passive";

const GEAR_SUB_CATS: { id: GearSubCat; label: string; emoji: string }[] = [
  { id: "sprinkler", label: "Sprinklers", emoji: "🚿" },
  { id: "mutation",  label: "Mutation",   emoji: "🧪" },
  { id: "passive",   label: "Passive",    emoji: "⚙️" },
];

function gearSubCat(gearType: GearType): GearSubCat {
  const cat = GEAR[gearType].category;
  if (cat === "sprinkler_regular")  return "sprinkler";
  if (cat === "sprinkler_mutation") return "mutation";
  return "passive";
}

const CRAFT_CATEGORIES: { id: ConsumableCategory | "attunement" | "gear"; label: string; emoji: string }[] = [
  { id: "attunement",     label: "Attunements",     emoji: "🥢" },
  { id: "gear",           label: "Gear",             emoji: "⚒️" },
  { id: "growth",         label: "Growth",          emoji: "🌱" },
  { id: "mutation_boost", label: "Mutation Boosts",  emoji: "🧪" },
  { id: "utility",        label: "Utility",          emoji: "⚙️" },
  { id: "seed_pouch",     label: "Seed Pouches",     emoji: "🎁" },
];

function CraftView({
  essences, consumables, infusers, gearInventory,
  craftingItemId, itemCraftError,
  craftingGearType, gearCraftError,
  onCraft, onCraftGear,
}: CraftViewProps) {
  // For the Seed Pouches category: which type sub-filter is selected
  const [pouchType, setPouchType] = useState<"generic" | TypedPouchType>("generic");
  // For the Gear category: which gear sub-category is selected
  const [gearCat, setGearCat] = useState<GearSubCat>("sprinkler");

  const pouchTypeLabel = useCallback((t: "generic" | TypedPouchType): string => {
    if (t === "generic") return "Generic";
    return FLOWER_TYPES[t as FlowerType]?.name ?? t;
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[11px] text-muted-foreground">
        Craft consumables, attunements, and gear from your essence bank. Tier I items cost essence; higher tiers upgrade from 2 of the previous tier.
      </p>

      {(itemCraftError || gearCraftError) && (
        <div className="bg-destructive/10 border border-destructive/40 rounded-xl px-3 py-2 text-xs text-destructive">
          {itemCraftError ?? gearCraftError}
        </div>
      )}

      {CRAFT_CATEGORIES.map(({ id: catId, label, emoji: catEmoji }) => {
        const isAttunement = catId === "attunement";
        const isPouchCat   = catId === "seed_pouch";
        const isGearCat    = catId === "gear";

        // ── Gear category ───────────────────────────────────────────────────
        if (isGearCat) {
          const gearRecipes = GEAR_RECIPES.filter(
            (r) => gearSubCat(r.outputGearType as GearType) === gearCat,
          );
          return (
            <div key={catId}>
              <p className="text-xs font-semibold mb-2">{catEmoji} {label}</p>
              {/* Gear sub-cat tabs */}
              <div className="flex gap-1.5 mb-3">
                {GEAR_SUB_CATS.map((sc) => (
                  <button
                    key={sc.id}
                    onClick={() => setGearCat(sc.id)}
                    className={`
                      flex-1 py-1 rounded-lg border text-[10px] font-semibold transition-all
                      ${gearCat === sc.id
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                      }
                    `}
                  >
                    {sc.emoji} {sc.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {gearRecipes.map((r) => (
                  <GearRecipeCard
                    key={r.outputGearType}
                    recipe={r}
                    essences={essences}
                    gearInventory={gearInventory}
                    consumables={consumables}
                    isCrafting={craftingGearType === r.outputGearType}
                    onCraft={() => onCraftGear(r.outputGearType)}
                  />
                ))}
              </div>
            </div>
          );
        }

        // ── Consumable / attunement categories ──────────────────────────────
        const cards = isAttunement
          ? ATTUNEMENT_RECIPES.map((recipe) => {
              const owned      = infusers.find((i) => i.rarity === recipe.rarity)?.quantity ?? 0;
              const affordable = canCraftAttunement(recipe, essences, infusers);
              return (
                <RecipeCard
                  key={`attunement-${recipe.tier}`}
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
                  onCraft={() => onCraft("attunement", String(recipe.tier))}
                />
              );
            })
          : CONSUMABLE_RECIPES
              .filter((r) => {
                if (r.category !== catId) return false;
                if (!isPouchCat) return true;
                if (pouchType === "generic") return /^seed_pouch_[1-5]$/.test(r.id);
                return r.id.startsWith(`seed_pouch_${pouchType}_`);
              })
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

            {/* Seed Pouch type selector */}
            {isPouchCat && (
              <div className="flex flex-wrap gap-1 mb-3">
                {(["generic", ...TYPED_POUCH_TYPES] as const).map((t) => {
                  const cfg = t !== "generic" ? FLOWER_TYPES[t as FlowerType] : null;
                  const isActive = pouchType === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setPouchType(t)}
                      className={`
                        inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-all duration-150
                        ${isActive
                          ? cfg
                            ? `${cfg.bgColor} ${cfg.borderColor} ${cfg.color}`
                            : "border-foreground bg-foreground/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground"
                        }
                      `}
                    >
                      {cfg ? `${cfg.emoji} ` : "🎁 "}{pouchTypeLabel(t)}
                    </button>
                  );
                })}
              </div>
            )}

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

type AlchemyView = "sacrifice" | "essences" | "craft" | "attune";

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

  // Consumable / attunement craft state
  const [craftingItemId,        setCraftingItemId]        = useState<string | null>(null);
  const [itemCraftError,        setItemCraftError]        = useState<string | null>(null);
  const [itemCraftSuccess,      setItemCraftSuccess]      = useState<{ name: string; emoji: string } | null>(null);
  const [itemCraftSuccessVisible, setItemCraftSuccessVisible] = useState(false);

  // Gear craft state
  const [craftingGearType, setCraftingGearType] = useState<string | null>(null);
  const [gearCraftError,   setGearCraftError]   = useState<string | null>(null);

  // Attune view state
  const [attuneSpeciesId,  setAttuneSpeciesId]  = useState<string | null>(null);
  const [attuneEssType,    setAttuneEssType]    = useState<string | null>(null);
  const [attuneQty,        setAttuneQty]        = useState(1);
  const [attuning,         setAttuning]         = useState(false);
  const [attuneError,      setAttuneError]      = useState<string | null>(null);
  const [attuneResult,     setAttuneResult]     = useState<{ mutation: string; tier: number } | null>(null);
  const [attuneResultVisible, setAttuneResultVisible] = useState(false);
  // Strip state
  const [stripSpeciesId,   setStripSpeciesId]   = useState<string | null>(null);
  const [stripMutation,    setStripMutation]    = useState<string | null>(null);
  const [stripping,        setStripping]        = useState(false);
  const [stripError,       setStripError]       = useState<string | null>(null);
  const [stripSuccess,     setStripSuccess]     = useState(false);
  const [stripSuccessVisible, setStripSuccessVisible] = useState(false);

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

  // Auto-dismiss attune result
  useEffect(() => {
    if (!attuneResult) return;
    const frame = requestAnimationFrame(() => setAttuneResultVisible(true));
    const timer = setTimeout(() => {
      setAttuneResultVisible(false);
      setTimeout(() => setAttuneResult(null), 400);
    }, 4_000);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [attuneResult]);

  // Auto-dismiss strip success
  useEffect(() => {
    if (!stripSuccess) return;
    const frame = requestAnimationFrame(() => setStripSuccessVisible(true));
    const timer = setTimeout(() => {
      setStripSuccessVisible(false);
      setTimeout(() => setStripSuccess(false), 400);
    }, 3_000);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [stripSuccess]);

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

  async function handleCraftItem(craftType: "consumable" | "attunement", id: string) {
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
      const recipe = ATTUNEMENT_RECIPES.find((r) => r.tier === tier);
      if (!recipe) { setItemCraftError("Unknown attunement tier."); setCraftingItemId(null); return; }
      const result = applyCraftAttunement(recipe, essences, infusers);
      if (!result) { setItemCraftError("Not enough ingredients."); setCraftingItemId(null); return; }
      optimistic = { ...cur, essences: result.essences, infusers: result.attunements };
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

  async function handleCraftGear(outputGearType: string) {
    if (craftingGearType) return;
    setCraftingGearType(outputGearType);
    setGearCraftError(null);

    const recipe = GEAR_RECIPES.find((r) => r.outputGearType === outputGearType);
    if (!recipe) { setCraftingGearType(null); return; }

    const cur = getState();

    // Build optimistic state: deduct all ingredients, add crafted gear
    let essences      = [...(cur.essences      ?? [])];
    let gearInventory = [...(cur.gearInventory ?? [])];
    let consumables   = [...(cur.consumables   ?? [])];

    for (const ing of recipe.ingredients) {
      if (ing.kind === "essence") {
        essences = essences
          .map((e) => e.type === ing.essenceType ? { ...e, amount: e.amount - ing.amount } : e)
          .filter((e) => e.amount > 0);
      } else if (ing.kind === "gear") {
        gearInventory = gearInventory
          .map((g) => g.gearType === ing.gearType ? { ...g, quantity: g.quantity - ing.quantity } : g)
          .filter((g) => g.quantity > 0);
      } else {
        consumables = consumables
          .map((c) => c.id === ing.consumableId ? { ...c, quantity: c.quantity - ing.quantity } : c)
          .filter((c) => c.quantity > 0);
      }
    }
    const idx = gearInventory.findIndex((g) => g.gearType === outputGearType);
    gearInventory = idx >= 0
      ? gearInventory.map((g, i) => i === idx ? { ...g, quantity: g.quantity + 1 } : g)
      : [...gearInventory, { gearType: outputGearType as GearType, quantity: 1 }];

    const optimistic = { ...cur, essences, gearInventory, consumables };

    try {
      await perform(
        optimistic,
        () => edgeCraftGear(outputGearType),
        (result) => {
          const fresh = getState();
          update({
            ...fresh,
            essences:      result.essences,
            gearInventory: result.gearInventory,
            consumables:   result.consumables,
            serverUpdatedAt: result.serverUpdatedAt,
          });
        },
      );
    } catch (e: unknown) {
      setGearCraftError(e instanceof Error ? e.message : "Craft failed — please retry.");
    } finally {
      setCraftingGearType(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">

      {/* Tab switcher: Sacrifice | Essences | Craft */}
      <div className="flex rounded-xl border border-border bg-card/40 p-0.5 gap-0.5">
        {(["sacrifice", "essences", "craft", "attune"] as AlchemyView[]).map((v) => (
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
            {v === "sacrifice" ? "⚗️ Sacrifice" : v === "essences" ? "✨ Essences" : v === "craft" ? "🔨 Craft" : "🌿 Attune"}
          </button>
        ))}
      </div>

      {/* ── ESSENCES view ── */}
      {view === "essences" && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold mb-0.5">Essence Bank</p>
            <p className="text-[11px] text-muted-foreground">
              Essences are earned by sacrificing flowers. Combine all 12 elemental essences into a Universal Essence in the Craft tab → Other.
            </p>
          </div>
          <EssenceWallet essences={state.essences ?? []} />

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
          gearInventory={state.gearInventory ?? []}
          craftingItemId={craftingItemId}
          itemCraftError={itemCraftError}
          craftingGearType={craftingGearType}
          gearCraftError={gearCraftError}
          onCraft={handleCraftItem}
          onCraftGear={handleCraftGear}
        />
      )}

      {/* ── ATTUNE view ── */}
      {view === "attune" && (() => {
        // ── Derived data ──────────────────────────────────────────────────────
        const rarityOrder: Rarity[] = ["common","uncommon","rare","legendary","mythic","exalted","prismatic"];

        // Unmutated blooms available to infuse
        const attunableBlooms = state.inventory.filter(
          (i) => !i.isSeed && i.quantity > 0 && (i.mutation === undefined || i.mutation === null)
        );

        // Mutated blooms available to strip
        const strippableBlooms = state.inventory.filter(
          (i) => !i.isSeed && i.quantity > 0 && i.mutation
        );

        // Essences the player owns (excluding universal for infuse — only elemental count)
        const ownedEssences = (state.essences ?? []).filter(
          (e) => e.type !== "universal" && e.amount > 0
        );

        // Selected bloom's species data
        const attuneSpecies  = attuneSpeciesId ? getFlower(attuneSpeciesId) : null;
        const attuneRarity   = attuneSpecies?.rarity ?? null;

        // Effective essence and tier preview
        let effectiveEssence = 0;
        let tierPreview: 1 | 2 | 3 | 4 = 1;
        const GOLD_COST_TABLE: Record<string, [number,number,number,number]> = {
          common:    [     15,      60,      200,       700],
          uncommon:  [     75,     300,      900,     3_000],
          rare:      [    300,   1_200,    4_000,    14_000],
          legendary: [  1_200,   5_000,   16_000,    55_000],
          mythic:    [  5_000,  20_000,   70_000,   250_000],
          exalted:   [ 20_000,  80_000,  280_000, 1_000_000],
          prismatic: [ 80_000, 300_000,1_000_000, 3_500_000],
        };
        let goldCostPreview = 0;

        if (attuneSpecies && attuneEssType && attuneQty > 0) {
          const isMatching = attuneSpecies.types.includes(attuneEssType as never) || attuneEssType === "universal";
          effectiveEssence = attuneQty * (isMatching ? 2 : 1);
          tierPreview = effectiveEssence >= 40 ? 4 : effectiveEssence >= 20 ? 3 : effectiveEssence >= 8 ? 2 : 1;
          const costs = GOLD_COST_TABLE[attuneRarity!];
          goldCostPreview = costs ? costs[tierPreview - 1] : 0;
        }

        // Strip cost preview
        const MUT_MULT: Record<string, number> = {
          golden: 4, rainbow: 5, giant: 2, moonlit: 2.5,
          frozen: 2, scorched: 2, wet: 1.25, windstruck: 0.7, shocked: 2.5,
        };
        const stripSpecies  = stripSpeciesId ? getFlower(stripSpeciesId) : null;
        const stripRarity   = stripSpecies?.rarity ?? null;
        const stripGoldCost = stripSpeciesId && stripMutation && stripRarity
          ? Math.floor((GOLD_COST_TABLE[stripRarity]?.[0] ?? 0) * (MUT_MULT[stripMutation] ?? 1))
          : 0;

        const TIER_LABEL = ["", "I — Common", "II — Balanced", "III — Rare-Weighted", "IV — Rare Dominant"];
        const TIER_COLOR = ["", "text-muted-foreground", "text-blue-400", "text-violet-400", "text-yellow-400"];

        // ── Handlers ──────────────────────────────────────────────────────────
        async function handleAttune() {
          if (attuning || !attuneSpeciesId || !attuneEssType || attuneQty < 1) return;
          setAttuneError(null);
          setAttuning(true);
          try {
            const res = await edgeAlchemyAttune(attuneSpeciesId, attuneEssType, attuneQty);
            const cur = getState();
            update({
              ...cur,
              inventory:  res.inventory,
              essences:   res.essences,
              coins:      res.coins,
              discovered: res.discovered,
              serverUpdatedAt: res.serverUpdatedAt,
            });
            setAttuneResult({ mutation: res.mutation, tier: res.tier });
            setAttuneSpeciesId(null);
            setAttuneEssType(null);
            setAttuneQty(1);
          } catch (e) {
            setAttuneError(e instanceof Error ? e.message : "Attunement failed");
          } finally {
            setAttuning(false);
          }
        }

        async function handleStrip() {
          if (stripping || !stripSpeciesId || !stripMutation) return;
          setStripError(null);
          setStripping(true);
          try {
            const res = await edgeAlchemyStrip(stripSpeciesId, stripMutation);
            const cur = getState();
            update({
              ...cur,
              inventory:  res.inventory,
              coins:      res.coins,
              serverUpdatedAt: res.serverUpdatedAt,
            });
            setStripSuccess(true);
            setStripSpeciesId(null);
            setStripMutation(null);
          } catch (e) {
            setStripError(e instanceof Error ? e.message : "Strip failed");
          } finally {
            setStripping(false);
          }
        }

        return (
          <div className="flex flex-col gap-5">
            <p className="text-[11px] text-muted-foreground">
              Transform a base bloom into a mutated one by spending elemental essence and coins.
              Higher essence (especially matching the flower's type) unlocks rarer mutation pools.
            </p>

            {/* ── Attune section ─────────────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-card/40 px-4 py-3 space-y-4">
              <p className="text-xs font-semibold">🌿 Attune a Bloom</p>

              {/* Bloom picker */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
                  Pick a base bloom
                </p>
                {attunableBlooms.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No unmutated blooms in inventory.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {rarityOrder.flatMap((r) =>
                      attunableBlooms
                        .filter((i) => getFlower(i.speciesId)?.rarity === r)
                        .map((item) => {
                          const sp      = getFlower(item.speciesId)!;
                          const rc      = RARITY_CONFIG[sp.rarity];
                          const isSelected = attuneSpeciesId === item.speciesId;
                          return (
                            <button
                              key={item.speciesId}
                              onClick={() => {
                                setAttuneSpeciesId(isSelected ? null : item.speciesId);
                                setAttuneEssType(null);
                                setAttuneQty(1);
                                setAttuneError(null);
                              }}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] transition-colors ${
                                isSelected
                                  ? `${rc.color} border-current bg-current/10`
                                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                              }`}
                            >
                              <span>{sp.emoji.bloom}</span>
                              <span>{sp.name}</span>
                              <span className="text-muted-foreground/60">×{item.quantity}</span>
                            </button>
                          );
                        })
                    )}
                  </div>
                )}
              </div>

              {/* Essence picker — only shown once a bloom is selected */}
              {attuneSpecies && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
                    Choose essence type
                    <span className="ml-1 normal-case">
                      (matching: {attuneSpecies.types.join(", ")})
                    </span>
                  </p>
                  {ownedEssences.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No essence in bank.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {ownedEssences.map(({ type, amount }) => {
                        const cfg        = FLOWER_TYPES[type as never] as { emoji: string; name: string; color: string; bgColor: string; borderColor: string };
                        const isMatch    = attuneSpecies.types.includes(type as never);
                        const isSelected = attuneEssType === type;
                        return (
                          <button
                            key={type}
                            onClick={() => { setAttuneEssType(type); setAttuneQty(1); }}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] transition-colors ${
                              isSelected
                                ? `${cfg.color} border-current ${cfg.bgColor}`
                                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                            }`}
                          >
                            {cfg.emoji} {cfg.name}
                            {isMatch && <span className="text-[9px] text-primary ml-0.5">✦ match</span>}
                            <span className="text-muted-foreground/60 ml-0.5">×{amount}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Quantity stepper + tier preview */}
              {attuneSpecies && attuneEssType && (() => {
                const ownedAmt = ownedEssences.find((e) => e.type === attuneEssType)?.amount ?? 0;
                const canAfford = state.coins >= goldCostPreview;
                const canAttune = ownedAmt >= attuneQty && canAfford;
                return (
                  <div className="space-y-3">
                    {/* Qty row */}
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-muted-foreground">Quantity</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setAttuneQty((q) => Math.max(1, q - 1))} disabled={attuneQty <= 1}
                          className="w-6 h-6 rounded-md border border-border text-xs flex items-center justify-center hover:border-primary/50 disabled:opacity-30">−</button>
                        <span className="w-8 text-center text-sm font-mono">{attuneQty}</span>
                        <button onClick={() => setAttuneQty((q) => Math.min(ownedAmt, q + 1))} disabled={attuneQty >= ownedAmt}
                          className="w-6 h-6 rounded-md border border-border text-xs flex items-center justify-center hover:border-primary/50 disabled:opacity-30">+</button>
                        <button onClick={() => setAttuneQty(ownedAmt)} disabled={attuneQty >= ownedAmt}
                          className="ml-1 text-[9px] text-primary disabled:opacity-30">Max</button>
                      </div>
                    </div>

                    {/* Tier + cost summary */}
                    <div className="rounded-lg bg-card/60 border border-border px-3 py-2 space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Effective essence</span>
                        <span className="font-mono">{effectiveEssence}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Mutation pool</span>
                        <span className={`font-semibold ${TIER_COLOR[tierPreview]}`}>
                          Tier {TIER_LABEL[tierPreview]}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Gold cost</span>
                        <span className={`font-mono ${canAfford ? "" : "text-destructive"}`}>
                          {goldCostPreview.toLocaleString()} 🟡
                          {!canAfford && " (insufficient)"}
                        </span>
                      </div>
                    </div>

                    {attuneError && (
                      <p className="text-xs text-destructive">{attuneError}</p>
                    )}

                    <button
                      onClick={handleAttune}
                      disabled={attuning || !canAttune}
                      className="w-full py-2 rounded-xl bg-primary/20 border border-primary/50 text-primary text-sm font-semibold hover:bg-primary/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-center"
                    >
                      {attuning ? "Attuning…" : "🌿 Attune"}
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* ── Strip section ───────────────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-card/40 px-4 py-3 space-y-4">
              <p className="text-xs font-semibold">✂️ Strip Mutation</p>
              <p className="text-[10px] text-muted-foreground">
                Remove a mutation from a bloom, returning it to its base form. Costs coins.
              </p>

              {strippableBlooms.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No mutated blooms in inventory.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {rarityOrder.flatMap((r) =>
                    strippableBlooms
                      .filter((i) => getFlower(i.speciesId)?.rarity === r)
                      .map((item, idx) => {
                        const sp      = getFlower(item.speciesId)!;
                        const mut     = item.mutation ? MUTATIONS[item.mutation as MutationType] : null;
                        const isSelected = stripSpeciesId === item.speciesId && stripMutation === item.mutation;
                        return (
                          <button
                            key={`${item.speciesId}-${item.mutation}-${idx}`}
                            onClick={() => {
                              setStripSpeciesId(isSelected ? null : item.speciesId);
                              setStripMutation(isSelected ? null : (item.mutation ?? null));
                              setStripError(null);
                            }}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] transition-colors ${
                              isSelected
                                ? "border-primary text-primary bg-primary/10"
                                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                            }`}
                          >
                            <span>{sp.emoji.bloom}</span>
                            <span>{sp.name}</span>
                            {mut && <span className={`font-mono ${mut.color}`}>{mut.emoji}</span>}
                            <span className="text-muted-foreground/60">×{item.quantity}</span>
                          </button>
                        );
                      })
                  )}
                </div>
              )}

              {stripSpeciesId && stripMutation && (
                <div className="space-y-2">
                  <div className="rounded-lg bg-card/60 border border-border px-3 py-2 text-[11px] flex justify-between">
                    <span className="text-muted-foreground">Strip cost</span>
                    <span className={`font-mono ${state.coins >= stripGoldCost ? "" : "text-destructive"}`}>
                      {stripGoldCost.toLocaleString()} 🟡
                    </span>
                  </div>
                  {stripError && <p className="text-xs text-destructive">{stripError}</p>}
                  <button
                    onClick={handleStrip}
                    disabled={stripping || state.coins < stripGoldCost}
                    className="w-full py-2 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm font-semibold hover:bg-destructive/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-center"
                  >
                    {stripping ? "Stripping…" : "✂️ Strip Mutation"}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Attune result toast ── */}
      {attuneResult && (() => {
        const mut = MUTATIONS[attuneResult.mutation as MutationType];
        const TIER_COLOR = ["","text-muted-foreground","text-blue-400","text-violet-400","text-yellow-400"];
        return (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-400 ${attuneResultVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <div className="flex items-center gap-3 bg-card border border-primary/40 rounded-2xl px-5 py-4 shadow-2xl shadow-primary/10 min-w-64">
              <span className="text-2xl">{mut?.emoji ?? "🌿"}</span>
              <div>
                <p className="text-sm font-bold text-primary mb-0.5">Attunement complete!</p>
                <p className={`text-[11px] font-semibold ${mut?.color ?? ""}`}>{mut?.name ?? attuneResult.mutation}</p>
                <p className={`text-[10px] ${TIER_COLOR[attuneResult.tier]}`}>Tier {attuneResult.tier} pool</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Strip success toast ── */}
      {stripSuccess && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-400 ${stripSuccessVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="flex items-center gap-3 bg-card border border-border rounded-2xl px-5 py-4 shadow-2xl min-w-56">
            <span className="text-2xl">✂️</span>
            <div>
              <p className="text-sm font-bold mb-0.5">Mutation stripped</p>
              <p className="text-[11px] text-muted-foreground">Bloom returned to base form</p>
            </div>
          </div>
        </div>
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
