import { useState, useMemo } from "react";
import { useGame } from "../store/GameContext";
import { GEAR_RECIPES, canCraftGear, type GearRecipe } from "../data/gear-recipes";
import { GEAR, type GearType } from "../data/gear";
import {
  CONSUMABLE_RECIPES, CONSUMABLE_RECIPE_MAP, ATTUNEMENT_RECIPES,
  canCraftConsumable, canCraftAttunement,
  applyCraftConsumable, applyCraftAttunement,
  TIER_RARITIES,
  type ConsumableId,
} from "../data/consumables";
import { RARITY_CONFIG, FLOWER_TYPES, type Rarity } from "../data/flowers";
import type { FlowerType } from "../data/flowers";
import { UNIVERSAL_ESSENCE_DISPLAY } from "../data/essences";
import { edgeCraftGear, edgeAlchemyCraft } from "../lib/edgeFunctions";
import type { GameState } from "../store/gameStore";

// ── Types ─────────────────────────────────────────────────────────────────────

type CraftFilter = "all" | "gear" | "consumables";

interface CraftEntry {
  id:          string;          // "gear:sprinkler_rare", "consumable:bloom_burst_1", "attunement:1"
  kind:        "gear" | "consumable" | "attunement";
  emoji:       string;
  name:        string;
  rarity:      Rarity;
  description: string;
  owned:       number;
  canCraft:    boolean;
  tier?:       number | null;
}

// ── Rarity style helpers ──────────────────────────────────────────────────────


const ROMAN = ["I","II","III","IV","V"] as const;
function toRoman(n: number): string { return ROMAN[n - 1] ?? String(n); }

function cellBorderClass(rarity: Rarity): string {
  if (rarity === "prismatic") return "rainbow-border";
  const cfg = RARITY_CONFIG[rarity];
  return cfg.borderBloom || cfg.borderGrowing || "border-border";
}

function cellBgClass(rarity: Rarity): string {
  if (rarity === "prismatic") return "bg-card/60";
  return RARITY_CONFIG[rarity].bgBloom || "bg-card/60";
}

// ── Build item list from all recipes ─────────────────────────────────────────

function buildEntries(state: GameState, filter: CraftFilter): CraftEntry[] {
  const essences  = state.essences      ?? [];
  const gearInv   = state.gearInventory ?? [];
  const consum    = state.consumables   ?? [];
  const infusers  = state.infusers      ?? [];

  const entries: CraftEntry[] = [];

  // ── Gear ──────────────────────────────────────────────────────────────────
  if (filter !== "consumables") {
    for (const recipe of GEAR_RECIPES) {
      const def = GEAR[recipe.outputGearType as GearType];
      entries.push({
        id:          `gear:${recipe.outputGearType}`,
        kind:        "gear",
        emoji:       def.emoji,
        name:        def.name,
        rarity:      def.rarity,
        description: def.description,
        owned:       gearInv.find((g) => g.gearType === recipe.outputGearType)?.quantity ?? 0,
        canCraft:    canCraftGear(recipe, essences, gearInv, consum),
      });
    }
  }

  // ── Consumables (excluding typed seed pouches) ────────────────────────────
  if (filter !== "gear") {
    for (const recipe of CONSUMABLE_RECIPES) {
      // Skip typed pouches (seed_pouch_blaze_1 etc.) — they get their own category later
      if (/^seed_pouch_[a-z]+_\d+$/.test(recipe.id)) continue;
      entries.push({
        id:          `consumable:${recipe.id}`,
        kind:        "consumable",
        emoji:       recipe.emoji,
        name:        recipe.name,
        rarity:      recipe.rarity,
        description: recipe.description,
        tier:        recipe.tier,
        owned:       consum.find((c) => c.id === recipe.id)?.quantity ?? 0,
        canCraft:    canCraftConsumable(recipe, essences, consum),
      });
    }

    // Attunement crystals
    for (const recipe of ATTUNEMENT_RECIPES) {
      entries.push({
        id:          `attunement:${recipe.tier}`,
        kind:        "attunement",
        emoji:       "🥢",
        name:        recipe.name,
        rarity:      recipe.rarity,
        description: recipe.description,
        tier:        recipe.tier,
        owned:       infusers.find((i) => i.rarity === recipe.rarity)?.quantity ?? 0,
        canCraft:    canCraftAttunement(recipe, essences, infusers),
      });
    }
  }

  // Sort: craftable first, preserve source-array order within each group
  return entries.sort((a, b) => {
    if (a.canCraft !== b.canCraft) return a.canCraft ? -1 : 1;
    return 0;
  });
}

// ── Popup ingredient display ──────────────────────────────────────────────────

function IngredientRow({
  label, emoji, need, have, enough,
}: {
  label: string; emoji: string; need: number; have: number; enough: boolean;
}) {
  return (
    <div className={`flex items-center justify-between text-xs py-0.5 ${enough ? "text-foreground" : "text-muted-foreground"}`}>
      <span className="flex items-center gap-1.5">
        <span>{emoji}</span>
        <span>{label}</span>
      </span>
      <span className={`font-mono font-semibold ${enough ? "text-green-400" : "text-red-400"}`}>
        {have} / {need}
      </span>
    </div>
  );
}

function GearIngredients({
  recipe, essences, gearInventory, consumables,
}: {
  recipe:        GearRecipe;
  essences:      { type: string; amount: number }[];
  gearInventory: { gearType: string; quantity: number }[];
  consumables:   { id: string; quantity: number }[];
}) {
  return (
    <div className="space-y-0.5">
      {recipe.ingredients.map((ing, i) => {
        if (ing.kind === "essence") {
          const isUniversal = ing.essenceType === "universal";
          const cfg = isUniversal ? UNIVERSAL_ESSENCE_DISPLAY : FLOWER_TYPES[ing.essenceType as FlowerType];
          const have = essences.find((e) => e.type === ing.essenceType)?.amount ?? 0;
          return <IngredientRow key={i} emoji={cfg.emoji} label={isUniversal ? "Universal" : cfg.name} need={ing.amount} have={have} enough={have >= ing.amount} />;
        }
        if (ing.kind === "gear") {
          const def  = GEAR[ing.gearType as GearType];
          const have = gearInventory.find((g) => g.gearType === ing.gearType)?.quantity ?? 0;
          return <IngredientRow key={i} emoji={def?.emoji ?? "⚙️"} label={def?.name ?? ing.gearType} need={ing.quantity} have={have} enough={have >= ing.quantity} />;
        }
        const crec = CONSUMABLE_RECIPE_MAP[ing.consumableId as ConsumableId];
        const have = consumables.find((c) => c.id === ing.consumableId)?.quantity ?? 0;
        return <IngredientRow key={i} emoji={crec?.emoji ?? "🧪"} label={crec?.name ?? ing.consumableId} need={ing.quantity} have={have} enough={have >= ing.quantity} />;
      })}
    </div>
  );
}

// ── Popup ─────────────────────────────────────────────────────────────────────

function CraftPopup({
  entry, onClose, onCraft, isCrafting, craftError, state,
}: {
  entry:      CraftEntry;
  onClose:    () => void;
  onCraft:    () => void;
  isCrafting: boolean;
  craftError: string | null;
  state:      GameState;
}) {
  const essences  = state.essences      ?? [];
  const gearInv   = state.gearInventory ?? [];
  const consum    = state.consumables   ?? [];
  const infusers  = state.infusers      ?? [];
  const rc = RARITY_CONFIG[entry.rarity];

  // Render ingredients section depending on item kind
  let ingredientsSection: React.ReactNode = null;

  if (entry.kind === "gear") {
    const gearType = entry.id.replace("gear:", "");
    const recipe = GEAR_RECIPES.find((r) => r.outputGearType === gearType);
    if (recipe) {
      ingredientsSection = (
        <GearIngredients recipe={recipe} essences={essences} gearInventory={gearInv} consumables={consum} />
      );
    }
  } else if (entry.kind === "consumable") {
    const id = entry.id.replace("consumable:", "") as ConsumableId;
    const recipe = CONSUMABLE_RECIPE_MAP[id];
    if (recipe) {
      const cost = recipe.cost;
      if (cost.kind === "essence") {
        ingredientsSection = (
          <div className="space-y-0.5">
            {cost.amounts.map(({ type, amount }) => {
              const isUniversal = type === "universal";
              const cfg = isUniversal ? UNIVERSAL_ESSENCE_DISPLAY : FLOWER_TYPES[type as FlowerType];
              const have = essences.find((e) => e.type === type)?.amount ?? 0;
              return <IngredientRow key={type} emoji={cfg.emoji} label={isUniversal ? "Universal" : cfg.name} need={amount} have={have} enough={have >= amount} />;
            })}
          </div>
        );
      } else {
        const src = CONSUMABLE_RECIPE_MAP[cost.id as ConsumableId];
        const have = consum.find((c) => c.id === cost.id)?.quantity ?? 0;
        ingredientsSection = (
          <div className="space-y-0.5">
            <IngredientRow emoji={src?.emoji ?? "?"} label={src?.name ?? cost.id} need={cost.quantity} have={have} enough={have >= cost.quantity} />
          </div>
        );
      }
    }
  } else {
    // attunement
    const tier   = parseInt(entry.id.replace("attunement:", ""), 10) as 1|2|3|4|5;
    const recipe = ATTUNEMENT_RECIPES.find((r) => r.tier === tier);
    if (recipe) {
      const cost = recipe.cost;
      if (cost.kind === "essence") {
        ingredientsSection = (
          <div className="space-y-0.5">
            {cost.amounts.map(({ type, amount }) => {
              const isUniversal = type === "universal";
              const cfg = isUniversal ? UNIVERSAL_ESSENCE_DISPLAY : FLOWER_TYPES[type as FlowerType];
              const have = essences.find((e) => e.type === type)?.amount ?? 0;
              return <IngredientRow key={type} emoji={cfg.emoji} label={isUniversal ? "Universal" : cfg.name} need={amount} have={have} enough={have >= amount} />;
            })}
          </div>
        );
      } else {
        const prevRarity = TIER_RARITIES[cost.tier as 1|2|3|4|5];
        const have = infusers.find((i) => i.rarity === prevRarity)?.quantity ?? 0;
        ingredientsSection = (
          <div className="space-y-0.5">
            <IngredientRow emoji="🥢" label={`Attunement ${cost.tier}`} need={cost.quantity} have={have} enough={have >= cost.quantity} />
          </div>
        );
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 pt-5 pb-4 border-b border-border ${cellBgClass(entry.rarity)}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-4xl leading-none">{entry.emoji}</span>
              <div>
                <p className="font-bold text-base text-foreground leading-tight">{entry.name}</p>
                <span className={`text-xs font-semibold ${rc.color}`}>{rc.label}</span>
                {entry.owned > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    Owned: <span className="text-foreground font-semibold">{entry.owned}</span>
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none pt-0.5"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 leading-snug">{entry.description}</p>
        </div>

        {/* Ingredients */}
        <div className="px-5 py-4 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
            Ingredients
          </p>
          {ingredientsSection}
        </div>

        {/* Craft button */}
        <div className="px-5 pb-5">
          {craftError && (
            <p className="text-xs text-red-400 mb-2">{craftError}</p>
          )}
          <button
            onClick={onCraft}
            disabled={!entry.canCraft || isCrafting}
            className={`
              w-full py-3 rounded-xl font-semibold text-sm transition-all
              ${entry.canCraft && !isCrafting
                ? "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]"
                : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
              }
            `}
          >
            {isCrafting ? "Crafting…" : entry.canCraft ? "⚒️ Craft" : "Missing ingredients"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cell ──────────────────────────────────────────────────────────────────────

function CraftCell({ entry, onClick }: { entry: CraftEntry; onClick: () => void }) {
  const borderCls = cellBorderClass(entry.rarity);
  const bgCls     = cellBgClass(entry.rarity);

  return (
    <button
      onClick={onClick}
      className={`
        relative h-16 w-16 rounded-xl border-2 flex flex-col items-center justify-center
        transition-all duration-150
        ${borderCls} ${bgCls}
        ${entry.canCraft
          ? "hover:scale-[1.08] hover:shadow-lg cursor-pointer"
          : "opacity-30 grayscale cursor-pointer"
        }
      `}
    >
      <span className="text-xl leading-none select-none">{entry.emoji}</span>
      {/* Tier badge */}
      {entry.tier != null && (
        <span className="absolute top-0.5 right-1 text-[9px] font-bold text-muted-foreground leading-none">
          {toRoman(entry.tier)}
        </span>
      )}
      {/* Owned dot */}
      {entry.owned > 0 && (
        <span className="absolute bottom-0.5 left-1 text-[9px] font-bold text-muted-foreground leading-none">
          ×{entry.owned}
        </span>
      )}
    </button>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

const FILTER_LABELS: { id: CraftFilter; label: string; emoji: string }[] = [
  { id: "all",         label: "All",         emoji: "✦" },
  { id: "gear",        label: "Gear",        emoji: "⚙️" },
  { id: "consumables", label: "Consumables", emoji: "🧪" },
];

export function CraftingTab() {
  const { state, getState, update, perform } = useGame();
  const [filter,     setFilter]     = useState<CraftFilter>("all");
  const [selected,   setSelected]   = useState<CraftEntry | null>(null);
  const [crafting,   setCrafting]   = useState(false);
  const [craftError, setCraftError] = useState<string | null>(null);

  const entries = useMemo(
    () => buildEntries(state, filter),
    // Re-run whenever inventory-affecting state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.essences, state.gearInventory, state.consumables, state.infusers, filter],
  );

  // Keep selected entry in sync after a craft (owned count, canCraft flag changes)
  const liveSelected = selected
    ? entries.find((e) => e.id === selected.id) ?? selected
    : null;

  function openEntry(entry: CraftEntry) {
    setSelected(entry);
    setCraftError(null);
  }

  function closePopup() {
    setSelected(null);
    setCraftError(null);
  }

  async function handleCraft() {
    if (!liveSelected || crafting) return;
    setCrafting(true);
    setCraftError(null);

    const cur = getState();

    try {
      if (liveSelected.kind === "gear") {
        const gearType = liveSelected.id.replace("gear:", "");
        const recipe   = GEAR_RECIPES.find((r) => r.outputGearType === gearType);
        if (!recipe) return;

        let essences  = [...(cur.essences      ?? [])];
        let gearInv   = [...(cur.gearInventory ?? [])];
        let consum    = [...(cur.consumables   ?? [])];
        for (const ing of recipe.ingredients) {
          if (ing.kind === "essence") {
            essences = essences.map((e) => e.type === ing.essenceType ? { ...e, amount: e.amount - ing.amount } : e).filter((e) => e.amount > 0);
          } else if (ing.kind === "gear") {
            gearInv = gearInv.map((g) => g.gearType === ing.gearType ? { ...g, quantity: g.quantity - ing.quantity } : g).filter((g) => g.quantity > 0);
          } else {
            consum = consum.map((c) => c.id === ing.consumableId ? { ...c, quantity: c.quantity - ing.quantity } : c).filter((c) => c.quantity > 0);
          }
        }
        const idx = gearInv.findIndex((g) => g.gearType === gearType);
        gearInv = idx >= 0
          ? gearInv.map((g, i) => i === idx ? { ...g, quantity: g.quantity + 1 } : g)
          : [...gearInv, { gearType: gearType as GearType, quantity: 1 }];

        await perform(
          { ...cur, essences, gearInventory: gearInv, consumables: consum },
          () => edgeCraftGear(gearType),
          (res) => {
            const fresh = getState();
            update({ ...fresh, essences: res.essences, gearInventory: res.gearInventory, consumables: res.consumables, serverUpdatedAt: res.serverUpdatedAt });
            closePopup();
          },
        );

      } else if (liveSelected.kind === "consumable") {
        const id     = liveSelected.id.replace("consumable:", "") as ConsumableId;
        const recipe = CONSUMABLE_RECIPE_MAP[id];
        if (!recipe) return;

        const result = applyCraftConsumable(recipe, cur.essences ?? [], cur.consumables ?? []);
        if (!result) { setCraftError("Not enough ingredients."); return; }

        await perform(
          { ...cur, essences: result.essences, consumables: result.consumables },
          () => edgeAlchemyCraft("consumable", id),
          (res) => {
            const fresh = getState();
            update({ ...fresh, essences: res.essences, consumables: res.consumables, infusers: res.infusers, serverUpdatedAt: res.serverUpdatedAt });
            closePopup();
          },
        );

      } else {
        // attunement
        const tier   = parseInt(liveSelected.id.replace("attunement:", ""), 10) as 1|2|3|4|5;
        const recipe = ATTUNEMENT_RECIPES.find((r) => r.tier === tier);
        if (!recipe) return;

        const result = applyCraftAttunement(recipe, cur.essences ?? [], cur.infusers ?? []);
        if (!result) { setCraftError("Not enough ingredients."); return; }

        await perform(
          { ...cur, essences: result.essences, infusers: result.attunements },
          () => edgeAlchemyCraft("attunement", String(tier)),
          (res) => {
            const fresh = getState();
            update({ ...fresh, essences: res.essences, consumables: res.consumables, infusers: res.infusers, serverUpdatedAt: res.serverUpdatedAt });
            closePopup();
          },
        );
      }
    } catch (e: unknown) {
      setCraftError(e instanceof Error ? e.message : "Craft failed — please retry.");
    } finally {
      setCrafting(false);
    }
  }

  const craftableCount = entries.filter((e) => e.canCraft).length;

  return (
    <>
      {/* ── Window ──────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-amber-800/30 shadow-lg shadow-amber-950/20 max-w-[33rem] mx-auto w-full">

        {/* Window header */}
        <div className="px-4 py-3 bg-gradient-to-r from-amber-950/50 to-card/80 border-b border-amber-800/25 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base text-foreground">⚒️ Forge</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {craftableCount > 0
                ? <><span className="text-amber-400 font-semibold">{craftableCount}</span> item{craftableCount !== 1 ? "s" : ""} ready to craft</>
                : "Gather essences to unlock recipes"
              }
            </p>
          </div>
        </div>

        {/* Category filter */}
        <div className="px-4 pt-3 pb-2 bg-card/60 flex gap-2">
          {FILTER_LABELS.map(({ id, label, emoji }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`
                flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all text-center
                ${filter === id
                  ? "bg-amber-500/20 border border-amber-500/40 text-amber-300"
                  : "bg-card/40 border border-border text-muted-foreground hover:border-amber-800/40"
                }
              `}
            >
              {emoji} {label}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div
          className="px-3 pb-4 pt-2 bg-card/40 grid gap-2 justify-items-center"
          style={{ gridTemplateColumns: "repeat(auto-fill, 4rem)" }}
        >
          {entries.map((entry) => (
            <CraftCell key={entry.id} entry={entry} onClick={() => openEntry(entry)} />
          ))}
          {entries.length === 0 && (
            <div className="col-span-6 py-10 text-center text-xs text-muted-foreground">
              No items in this category yet.
            </div>
          )}
        </div>
      </div>

      {/* ── Popup ──────────────────────────────────────────────────────────── */}
      {liveSelected && (
        <CraftPopup
          entry={liveSelected}
          onClose={closePopup}
          onCraft={handleCraft}
          isCrafting={crafting}
          craftError={craftError}
          state={state}
        />
      )}
    </>
  );
}
