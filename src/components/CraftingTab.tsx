import { useState, useMemo, useEffect, useCallback } from "react";
import { useGame } from "../store/GameContext";
import {
  GEAR_RECIPES, CRAFTING_SLOT_UPGRADES, canCraftGear,
  craftDurationFromRarity, type GearRecipe,
} from "../data/gear-recipes";
import { GEAR, type GearType } from "../data/gear";
import {
  CONSUMABLE_RECIPES, CONSUMABLE_RECIPE_MAP, ATTUNEMENT_RECIPES,
  canCraftConsumable, canCraftAttunement,
  TIER_RARITIES,
  type ConsumableId,
} from "../data/consumables";
import { RARITY_CONFIG, FLOWER_TYPES, type Rarity } from "../data/flowers";
import type { FlowerType } from "../data/flowers";
import { UNIVERSAL_ESSENCE_DISPLAY } from "../data/essences";
import {
  edgeCraftStart, edgeCraftCollect, edgeCraftCancel,
  edgeUpgradeCraftingSlots,
} from "../lib/edgeFunctions";
import type { GameState, CraftingQueueEntry } from "../store/gameStore";
import { getBoostMultiplier } from "../store/gameStore";

// ── Forge Haste / Resonance Draft (Phase 5a) ───────────────────────────────────
// If the relevant boost is active when a craft starts, halve its durationMs.
// Mirrors the server-side logic in craft-start/index.ts.
function applyCraftBoost(
  rawDurationMs: number,
  kind:          "gear" | "consumable" | "attunement",
  state:         GameState,
  now:           number,
): number {
  const boostType = kind === "attunement" ? "attunement" : "craft";
  const mult      = getBoostMultiplier(state.activeBoosts, boostType, now);
  return mult > 1 ? Math.max(1, Math.floor(rawDurationMs / mult)) : rawDurationMs;
}

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

// ── Gear tier derivation ──────────────────────────────────────────────────────

const RARITY_SUFFIXES = new Set(["uncommon","rare","legendary","mythic","exalted","prismatic"]);

function gearFamily(gearType: string): string {
  const parts = gearType.split("_");
  return RARITY_SUFFIXES.has(parts[parts.length - 1]) ? parts.slice(0, -1).join("_") : gearType;
}

const GEAR_TIER_MAP = (() => {
  const counts: Record<string, number> = {};
  const map:    Record<string, number> = {};
  for (const r of GEAR_RECIPES) {
    const fam = gearFamily(r.outputGearType);
    counts[fam] = (counts[fam] ?? 0) + 1;
    map[r.outputGearType] = counts[fam];
  }
  for (const r of GEAR_RECIPES) {
    if (counts[gearFamily(r.outputGearType)] <= 1) delete map[r.outputGearType];
  }
  return map;
})();

// ── Formatting helpers ────────────────────────────────────────────────────────

const ROMAN = ["I","II","III","IV","V"] as const;
function toRoman(n: number): string { return ROMAN[n - 1] ?? String(n); }

function formatDuration(ms: number): string {
  if (ms <= 0) return "Done!";
  const s = Math.ceil(ms / 1000);
  if (s < 60)   return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function formatDurationLabel(ms: number): string {
  if (ms <  60_000)    return `${Math.round(ms / 1000)}s`;
  if (ms <  3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1).replace(".0", "")} hr`;
  return `${(ms / 86_400_000).toFixed(1).replace(".0", "")} day`;
}

// ── Rarity style helpers ──────────────────────────────────────────────────────

function cellBorderClass(rarity: Rarity): string {
  if (rarity === "prismatic") return "rainbow-border";
  const cfg = RARITY_CONFIG[rarity];
  return cfg.borderBloom || cfg.borderGrowing || "border-border";
}

function cellBgClass(rarity: Rarity): string {
  if (rarity === "prismatic") return "bg-card/60";
  return RARITY_CONFIG[rarity].bgBloom || "bg-card/60";
}

function rarityChip(rarity: Rarity): { color: string; border: string; bg: string } {
  if (rarity === "prismatic") return { color: "rainbow-text", border: "rainbow-tile", bg: "" };
  const cfg = RARITY_CONFIG[rarity];
  return {
    color:  cfg.color        || "text-foreground",
    border: cfg.borderBloom  || cfg.borderGrowing || "border-border",
    bg:     cfg.bgBloom      || "bg-card/60",
  };
}

function essenceChip(essenceType: string): { color: string; border: string; bg: string } {
  if (essenceType === "universal") return { color: "rainbow-text", border: "rainbow-tile", bg: "" };
  const cfg = FLOWER_TYPES[essenceType as FlowerType];
  return { color: cfg.color, border: cfg.borderColor, bg: cfg.bgColor };
}

// ── Build item list from all recipes ─────────────────────────────────────────

function buildEntries(state: GameState, filter: CraftFilter): CraftEntry[] {
  const essences   = state.essences      ?? [];
  const gearInv    = state.gearInventory ?? [];
  const consum     = state.consumables   ?? [];
  const infusers   = state.infusers      ?? [];
  // All crafts go into the queue — a slot must be free
  const slotsAvail = (state.craftingQueue?.length ?? 0) < (state.craftingSlotCount ?? 1);

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
        canCraft:    slotsAvail && canCraftGear(recipe, essences, gearInv, consum, state.coins),
        tier:        GEAR_TIER_MAP[recipe.outputGearType] ?? null,
      });
    }
  }

  // ── Consumables (excluding typed seed pouches) ────────────────────────────
  if (filter !== "gear") {
    for (const recipe of CONSUMABLE_RECIPES) {
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
        canCraft:    slotsAvail && canCraftConsumable(recipe, essences, consum),
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
        canCraft:    slotsAvail && canCraftAttunement(recipe, essences, infusers),
      });
    }
  }

  return entries.sort((a, b) => {
    if (a.canCraft !== b.canCraft) return a.canCraft ? -1 : 1;
    return 0;
  });
}

// ── Popup ingredient display ──────────────────────────────────────────────────

function IngredientRow({
  label, emoji, need, have, enough, color, border, bg,
}: {
  label: string; emoji: string; need: number; have: number; enough: boolean;
  color: string; border: string; bg: string;
}) {
  return (
    <div className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg border ${border} ${bg}`}>
      <span className={`flex items-center gap-1.5 font-medium ${color}`}>
        <span>{emoji}</span>
        <span>{label}</span>
      </span>
      <span className={`font-mono font-semibold ml-3 ${enough ? "text-green-400" : "text-red-400"}`}>
        {have.toLocaleString()}/{need.toLocaleString()}
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
    <div className="space-y-1">
      {recipe.ingredients.map((ing, i) => {
        if (ing.kind === "essence") {
          const isUniversal = ing.essenceType === "universal";
          const cfg   = isUniversal ? UNIVERSAL_ESSENCE_DISPLAY : FLOWER_TYPES[ing.essenceType as FlowerType];
          const have  = essences.find((e) => e.type === ing.essenceType)?.amount ?? 0;
          const label = isUniversal ? "Universal Essence" : `${cfg.name} Essence`;
          return <IngredientRow key={i} emoji={cfg.emoji} label={label} need={ing.amount} have={have} enough={have >= ing.amount} {...essenceChip(ing.essenceType)} />;
        }
        if (ing.kind === "gear") {
          const def   = GEAR[ing.gearType as GearType];
          const have  = gearInventory.find((g) => g.gearType === ing.gearType)?.quantity ?? 0;
          return <IngredientRow key={i} emoji={def?.emoji ?? "⚙️"} label={def?.name ?? ing.gearType} need={ing.quantity} have={have} enough={have >= ing.quantity} {...rarityChip(def?.rarity ?? "common")} />;
        }
        const crec = CONSUMABLE_RECIPE_MAP[ing.consumableId as ConsumableId];
        const have = consumables.find((c) => c.id === ing.consumableId)?.quantity ?? 0;
        return <IngredientRow key={i} emoji={crec?.emoji ?? "🧪"} label={crec?.name ?? ing.consumableId} need={ing.quantity} have={have} enough={have >= ing.quantity} {...(crec ? rarityChip(crec.rarity) : { color: "text-muted-foreground", border: "border-border", bg: "bg-card/60" })} />;
      })}
    </div>
  );
}

// ── Queue row display helper ──────────────────────────────────────────────────

function queueEntryDisplay(entry: CraftingQueueEntry): { emoji: string; name: string } {
  // Support legacy entries that only have gearType (not kind/outputId)
  const kind     = entry.kind     ?? "gear";
  const outputId = entry.outputId ?? (entry as unknown as { gearType?: string }).gearType ?? "";

  if (kind === "gear") {
    const def = GEAR[outputId as GearType];
    return { emoji: def?.emoji ?? "⚙️", name: def?.name ?? outputId };
  }
  if (kind === "consumable") {
    const crec = CONSUMABLE_RECIPE_MAP[outputId as ConsumableId];
    return { emoji: crec?.emoji ?? "🧪", name: crec?.name ?? outputId };
  }
  // attunement — outputId is the rarity string
  const capitalized = outputId.charAt(0).toUpperCase() + outputId.slice(1);
  return { emoji: "🥢", name: `${capitalized} Attunement` };
}

// ── Collect toast ─────────────────────────────────────────────────────────────

function CollectToast({ emoji, name, onDone }: { emoji: string; name: string; onDone: () => void }) {
  // Empty deps on purpose — `onDone` is a fresh closure on every parent render
  // (CraftingTab re-renders every second from setNow), so depending on it would
  // reset the timeout repeatedly and the toast would never dismiss.
  useEffect(() => {
    const id = setTimeout(onDone, 2500);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-2 bg-card/95 border border-green-500/40 text-green-400 rounded-xl px-4 py-2.5 shadow-xl text-sm font-semibold backdrop-blur-sm">
      <span className="text-xl leading-none">{emoji}</span>
      <span>{name} collected!</span>
      <span className="text-green-500 text-base leading-none">✓</span>
    </div>
  );
}

// ── Crafting queue panel ──────────────────────────────────────────────────────

function QueueEntryRow({
  entry, now, onCollect, onCancel, isCollecting, isCanceling,
}: {
  entry:        CraftingQueueEntry;
  now:          number;
  onCollect:    (id: string) => void;
  onCancel:     (id: string) => void;
  isCollecting: boolean;
  isCanceling:  boolean;
}) {
  const { emoji, name } = queueEntryDisplay(entry);
  const startedAt = new Date(entry.startedAt).getTime();
  const elapsed   = now - startedAt;
  // Clamp progress to [0, 1]. Without Math.max(0, …) a stale `now` (the 1s-tick
  // state lags real time by up to a second) makes `elapsed` negative right after
  // a craft starts → width: -0.3% → browser falls back to width: auto → 100%.
  const progress  = Math.max(0, Math.min(elapsed / entry.durationMs, 1));
  const isDone    = progress >= 1;
  const remaining = Math.max(entry.durationMs - elapsed, 0);

  return (
    <div className="rounded-xl border border-border bg-card/40 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg leading-none shrink-0">{emoji}</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{name}</p>
            <p className="text-[10px] text-muted-foreground">
              {isDone ? <span className="text-green-400 font-semibold">Ready to collect!</span> : formatDuration(remaining)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isDone && (
            <button
              onClick={() => onCollect(entry.id)}
              disabled={isCollecting || isCanceling}
              className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-green-600/20 border border-green-500/40 text-green-400 hover:bg-green-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isCollecting ? "…" : "✅ Collect"}
            </button>
          )}
          <button
            onClick={() => onCancel(entry.id)}
            disabled={isCollecting || isCanceling}
            className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-card/60 border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition"
            title="Cancel (refunds ingredients, not coins)"
          >
            {isCanceling ? "…" : "✕"}
          </button>
        </div>
      </div>
      {/* Progress bar — width jumps on the 1s tick (no transition needed at that scale).
          Only the colour (amber → green) transitions so "done" feels smooth. */}
      <div className="w-full h-1.5 rounded-full bg-card/60 overflow-hidden">
        <div
          className={`h-full rounded-full transition-colors duration-500 ${isDone ? "bg-green-500" : "bg-amber-500"}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}

// ── Popup ─────────────────────────────────────────────────────────────────────

function CraftPopup({
  entry, onClose, onCraft, isCrafting, craftError, state, slotsAvailable,
}: {
  entry:          CraftEntry;
  onClose:        () => void;
  onCraft:        () => void;
  isCrafting:     boolean;
  craftError:     string | null;
  state:          GameState;
  slotsAvailable: boolean;
}) {
  const essences  = state.essences      ?? [];
  const gearInv   = state.gearInventory ?? [];
  const consum    = state.consumables   ?? [];
  const infusers  = state.infusers      ?? [];
  const rc = RARITY_CONFIG[entry.rarity];

  const gearType   = entry.kind === "gear" ? entry.id.replace("gear:", "") : null;
  const gearRecipe = gearType ? GEAR_RECIPES.find((r) => r.outputGearType === gearType) : null;

  // All crafts now go into the queue — slot availability applies to all kinds
  const canAct = slotsAvailable && entry.canCraft;

  let buttonLabel: string;
  if (isCrafting)           buttonLabel = "Starting…";
  else if (!slotsAvailable) buttonLabel = "No crafting slots available";
  else if (!entry.canCraft) buttonLabel = "Missing ingredients or coins";
  else                      buttonLabel = "⏳ Start Crafting";

  // Duration for display
  let durationMs = 0;
  if (entry.kind === "gear" && gearRecipe) {
    durationMs = gearRecipe.durationMs;
  } else if (entry.kind === "consumable") {
    durationMs = craftDurationFromRarity(entry.rarity);
  } else if (entry.kind === "attunement") {
    durationMs = craftDurationFromRarity(entry.rarity);
  }

  // Render ingredients section depending on item kind
  let ingredientsSection: React.ReactNode = null;

  if (entry.kind === "gear" && gearRecipe) {
    ingredientsSection = (
      <div className="space-y-1">
        <IngredientRow
          emoji="🪙"
          label="Coin Cost"
          need={gearRecipe.coinCost}
          have={state.coins}
          enough={state.coins >= gearRecipe.coinCost}
          color="text-amber-400"
          border="border-amber-500/40"
          bg="bg-amber-950/20"
        />
        <GearIngredients recipe={gearRecipe} essences={essences} gearInventory={gearInv} consumables={consum} />
      </div>
    );
  } else if (entry.kind === "consumable") {
    const id = entry.id.replace("consumable:", "") as ConsumableId;
    const recipe = CONSUMABLE_RECIPE_MAP[id];
    if (recipe) {
      const cost = recipe.cost;
      if (cost.kind === "essence") {
        ingredientsSection = (
          <div className="space-y-1">
            {cost.amounts.map(({ type, amount }) => {
              const isUniversal = type === "universal";
              const cfg   = isUniversal ? UNIVERSAL_ESSENCE_DISPLAY : FLOWER_TYPES[type as FlowerType];
              const have  = essences.find((e) => e.type === type)?.amount ?? 0;
              const label = isUniversal ? "Universal Essence" : `${cfg.name} Essence`;
              return <IngredientRow key={type} emoji={cfg.emoji} label={label} need={amount} have={have} enough={have >= amount} {...essenceChip(type)} />;
            })}
          </div>
        );
      } else {
        const src  = CONSUMABLE_RECIPE_MAP[cost.id as ConsumableId];
        const have = consum.find((c) => c.id === cost.id)?.quantity ?? 0;
        ingredientsSection = (
          <div className="space-y-1">
            <IngredientRow emoji={src?.emoji ?? "?"} label={src?.name ?? cost.id} need={cost.quantity} have={have} enough={have >= cost.quantity} {...(src ? rarityChip(src.rarity) : { color: "text-muted-foreground", border: "border-border", bg: "bg-card/60" })} />
          </div>
        );
      }
    }
  } else if (entry.kind === "attunement") {
    const tier   = parseInt(entry.id.replace("attunement:", ""), 10) as 1|2|3|4|5;
    const recipe = ATTUNEMENT_RECIPES.find((r) => r.tier === tier);
    if (recipe) {
      const cost = recipe.cost;
      if (cost.kind === "essence") {
        ingredientsSection = (
          <div className="space-y-1">
            {cost.amounts.map(({ type, amount }) => {
              const isUniversal = type === "universal";
              const cfg   = isUniversal ? UNIVERSAL_ESSENCE_DISPLAY : FLOWER_TYPES[type as FlowerType];
              const have  = essences.find((e) => e.type === type)?.amount ?? 0;
              const label = isUniversal ? "Universal Essence" : `${cfg.name} Essence`;
              return <IngredientRow key={type} emoji={cfg.emoji} label={label} need={amount} have={have} enough={have >= amount} {...essenceChip(type)} />;
            })}
          </div>
        );
      } else {
        const prevRarity = TIER_RARITIES[cost.tier as 1|2|3|4|5];
        const have = infusers.find((i) => i.rarity === prevRarity)?.quantity ?? 0;
        ingredientsSection = (
          <div className="space-y-1">
            <IngredientRow emoji="🥢" label={`Attunement ${toRoman(cost.tier)}`} need={cost.quantity} have={have} enough={have >= cost.quantity} {...rarityChip(prevRarity)} />
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
            {entry.kind === "gear" ? "Cost & Ingredients" : "Ingredients"}
          </p>
          {ingredientsSection}
          {durationMs > 0 && (
            <p className="text-[10px] text-muted-foreground pt-1 px-0.5">
              ⏱ Duration: <span className="text-foreground">{formatDurationLabel(durationMs)}</span>
            </p>
          )}
        </div>

        {/* Craft button */}
        <div className="px-5 pb-5">
          {craftError && (
            <p className="text-xs text-red-400 mb-2">{craftError}</p>
          )}
          <button
            onClick={onCraft}
            disabled={!canAct || isCrafting}
            className={`
              w-full py-3 rounded-xl font-semibold text-sm transition-all text-center
              ${canAct && !isCrafting
                ? "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]"
                : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
              }
            `}
          >
            {buttonLabel}
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
      {entry.tier != null && (
        <span className="absolute top-0.5 right-1 text-[9px] font-bold text-muted-foreground leading-none">
          {toRoman(entry.tier)}
        </span>
      )}
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
  const [filter,       setFilter]       = useState<CraftFilter>("all");
  const [search,       setSearch]       = useState("");
  const [selected,     setSelected]     = useState<CraftEntry | null>(null);
  const [crafting,     setCrafting]     = useState(false);
  const [craftError,   setCraftError]   = useState<string | null>(null);
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [cancelingId,  setCancelingId]  = useState<string | null>(null);
  const [upgradingSlots, setUpgradingSlots] = useState(false);

  const [collectToasts, setCollectToasts] = useState<{ id: string; emoji: string; name: string }[]>([]);

  // Tick once per second to drive queue progress bars + countdowns
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const craftingQueue     = state.craftingQueue     ?? [];
  const craftingSlotCount = state.craftingSlotCount ?? 1;
  const slotsInUse        = craftingQueue.length;
  const slotsAvailable    = slotsInUse < craftingSlotCount;

  const nextSlotUpgrade = CRAFTING_SLOT_UPGRADES.find((u) => u.slots > craftingSlotCount) ?? null;

  const entries = useMemo(() => {
    const all = buildEntries(state, filter);
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter((e) => e.name.toLowerCase().includes(q));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.essences, state.gearInventory, state.consumables, state.infusers,
      state.coins, state.craftingQueue, state.craftingSlotCount, filter, search]);

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

  // ── Start crafting (all kinds → queue) ───────────────────────────────────
  async function handleCraft() {
    if (!liveSelected || crafting) return;
    setCrafting(true);
    setCraftError(null);

    const cur = getState();

    try {
      if (liveSelected.kind === "gear") {
        // ── Gear: server-authoritative ────────────────────────────────────
        const gearType = liveSelected.id.replace("gear:", "");
        const recipe   = GEAR_RECIPES.find((r) => r.outputGearType === gearType);
        if (!recipe) return;

        // Optimistic: deduct coins + ingredients, push a temp queue entry
        let essences = [...(cur.essences      ?? [])];
        let gearInv  = [...(cur.gearInventory ?? [])];
        let consum   = [...(cur.consumables   ?? [])];

        for (const ing of recipe.ingredients) {
          if (ing.kind === "essence") {
            essences = essences.map((e) => e.type === ing.essenceType ? { ...e, amount: e.amount - ing.amount } : e).filter((e) => e.amount > 0);
          } else if (ing.kind === "gear") {
            gearInv = gearInv.map((g) => g.gearType === ing.gearType ? { ...g, quantity: g.quantity - ing.quantity } : g).filter((g) => g.quantity > 0);
          } else {
            consum = consum.map((c) => c.id === ing.consumableId ? { ...c, quantity: c.quantity - ing.quantity } : c).filter((c) => c.quantity > 0);
          }
        }

        // Build stored costs for optimistic cancel refund
        const essenceCosts    = recipe.ingredients.filter((i): i is { kind: "essence"; essenceType: string; amount: number } => i.kind === "essence").map(({ essenceType: type, amount }) => ({ type, amount }));
        const gearCosts       = recipe.ingredients.filter((i): i is { kind: "gear"; gearType: string; quantity: number } => i.kind === "gear").map(({ gearType: gt, quantity }) => ({ gearType: gt, quantity }));
        const consumableCosts = recipe.ingredients.filter((i): i is { kind: "consumable"; consumableId: string; quantity: number } => i.kind === "consumable").map(({ consumableId: id, quantity }) => ({ id, quantity }));

        const tempEntry: CraftingQueueEntry = {
          id:              crypto.randomUUID(),
          kind:            "gear",
          outputId:        gearType,
          startedAt:       new Date().toISOString(),
          durationMs:      applyCraftBoost(recipe.durationMs, "gear", cur, Date.now()),
          ...(essenceCosts.length    && { essenceCosts }),
          ...(gearCosts.length       && { gearCosts }),
          ...(consumableCosts.length && { consumableCosts }),
        };

        await perform(
          {
            ...cur,
            coins:         cur.coins - recipe.coinCost,
            essences,
            gearInventory: gearInv,
            consumables:   consum,
            craftingQueue: [...(cur.craftingQueue ?? []), tempEntry],
          },
          () => edgeCraftStart("gear", gearType),
          (res) => {
            const fresh = getState();
            update({
              ...fresh,
              coins:           res.coins,
              essences:        res.essences,
              gearInventory:   res.gearInventory,
              consumables:     res.consumables,
              infusers:        res.infusers,
              craftingQueue:   res.craftingQueue,
              serverUpdatedAt: res.serverUpdatedAt,
            });
            closePopup();
          },
        );

      } else if (liveSelected.kind === "consumable") {
        // ── Consumable: client-declared costs, server validates ───────────
        const id     = liveSelected.id.replace("consumable:", "") as ConsumableId;
        const recipe = CONSUMABLE_RECIPE_MAP[id];
        if (!recipe) return;

        const durationMs = craftDurationFromRarity(recipe.rarity);
        const cost       = recipe.cost;

        const essenceCosts:    { type: string; amount: number }[]  = [];
        const consumableCosts: { id: string; quantity: number }[]  = [];

        if (cost.kind === "essence") {
          essenceCosts.push(...cost.amounts);
        } else {
          consumableCosts.push({ id: cost.id, quantity: cost.quantity });
        }

        // Optimistic deductions
        let essences = [...(cur.essences    ?? [])];
        let consum   = [...(cur.consumables ?? [])];

        for (const { type, amount } of essenceCosts) {
          essences = essences.map((e) => e.type === type ? { ...e, amount: e.amount - amount } : e).filter((e) => e.amount > 0);
        }
        for (const { id: cid, quantity } of consumableCosts) {
          consum = consum.map((c) => c.id === cid ? { ...c, quantity: c.quantity - quantity } : c).filter((c) => c.quantity > 0);
        }

        const tempEntry: CraftingQueueEntry = {
          id:        crypto.randomUUID(),
          kind:      "consumable",
          outputId:  id,
          startedAt: new Date().toISOString(),
          // Boost only adjusts the optimistic display — server halves its own
          // copy when it sees an active boost, and we read durationMs back from
          // res.craftingQueue when the server responds.
          durationMs: applyCraftBoost(durationMs, "consumable", cur, Date.now()),
          ...(essenceCosts.length    && { essenceCosts }),
          ...(consumableCosts.length && { consumableCosts }),
        };

        await perform(
          { ...cur, essences, consumables: consum, craftingQueue: [...(cur.craftingQueue ?? []), tempEntry] },
          () => edgeCraftStart("consumable", id, durationMs, { essenceCosts, consumableCosts }),
          (res) => {
            const fresh = getState();
            update({
              ...fresh,
              coins:           res.coins,
              essences:        res.essences,
              gearInventory:   res.gearInventory,
              consumables:     res.consumables,
              infusers:        res.infusers,
              craftingQueue:   res.craftingQueue,
              serverUpdatedAt: res.serverUpdatedAt,
            });
            closePopup();
          },
        );

      } else {
        // ── Attunement: client-declared costs, server validates ───────────
        const tier   = parseInt(liveSelected.id.replace("attunement:", ""), 10) as 1|2|3|4|5;
        const recipe = ATTUNEMENT_RECIPES.find((r) => r.tier === tier);
        if (!recipe) return;

        const outputId   = TIER_RARITIES[tier] as string;
        const durationMs = craftDurationFromRarity(recipe.rarity);
        const cost       = recipe.cost;

        const essenceCosts:    { type: string; amount: number }[]    = [];
        const attunementCosts: { rarity: string; quantity: number }[] = [];

        if (cost.kind === "essence") {
          essenceCosts.push(...cost.amounts);
        } else {
          // cost.tier = previous tier; cost.quantity = how many needed
          const prevRarity = TIER_RARITIES[cost.tier as 1|2|3|4|5] as string;
          attunementCosts.push({ rarity: prevRarity, quantity: cost.quantity });
        }

        // Optimistic deductions
        let essences = [...(cur.essences  ?? [])];
        let infusers = [...(cur.infusers  ?? [])];

        for (const { type, amount } of essenceCosts) {
          essences = essences.map((e) => e.type === type ? { ...e, amount: e.amount - amount } : e).filter((e) => e.amount > 0);
        }
        for (const { rarity, quantity } of attunementCosts) {
          infusers = infusers.map((inf) => inf.rarity === rarity ? { ...inf, quantity: inf.quantity - quantity } : inf).filter((inf) => inf.quantity > 0);
        }

        const tempEntry: CraftingQueueEntry = {
          id:        crypto.randomUUID(),
          kind:      "attunement",
          outputId,
          startedAt: new Date().toISOString(),
          // Boost only adjusts the optimistic display; server halves its own copy.
          durationMs: applyCraftBoost(durationMs, "attunement", cur, Date.now()),
          ...(essenceCosts.length    && { essenceCosts }),
          ...(attunementCosts.length && { attunementCosts }),
        };

        await perform(
          { ...cur, essences, infusers, craftingQueue: [...(cur.craftingQueue ?? []), tempEntry] },
          () => edgeCraftStart("attunement", outputId, durationMs, { essenceCosts, attunementCosts }),
          (res) => {
            const fresh = getState();
            update({
              ...fresh,
              coins:           res.coins,
              essences:        res.essences,
              gearInventory:   res.gearInventory,
              consumables:     res.consumables,
              infusers:        res.infusers,
              craftingQueue:   res.craftingQueue,
              serverUpdatedAt: res.serverUpdatedAt,
            });
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

  // ── Collect finished craft ────────────────────────────────────────────────
  const handleCollect = useCallback(async (craftId: string) => {
    if (collectingId || cancelingId) return;
    setCollectingId(craftId);

    const cur   = getState();
    const entry = (cur.craftingQueue ?? []).find((e) => e.id === craftId);
    if (!entry) { setCollectingId(null); return; }

    const kind     = entry.kind     ?? "gear";
    const outputId = entry.outputId ?? (entry as unknown as { gearType?: string }).gearType ?? "";
    const newQueue = (cur.craftingQueue ?? []).filter((e) => e.id !== craftId);

    // Build optimistic delivery based on kind
    let optimistic: Partial<GameState> = { craftingQueue: newQueue };

    if (kind === "gear") {
      const gearInv = cur.gearInventory ?? [];
      const idx     = gearInv.findIndex((g) => g.gearType === outputId);
      optimistic.gearInventory = idx >= 0
        ? gearInv.map((g, i) => i === idx ? { ...g, quantity: g.quantity + 1 } : g)
        : [...gearInv, { gearType: outputId as GearType, quantity: 1 }];
    } else if (kind === "consumable") {
      const consum = cur.consumables ?? [];
      const idx    = consum.findIndex((c) => c.id === outputId);
      optimistic.consumables = idx >= 0
        ? consum.map((c, i) => i === idx ? { ...c, quantity: c.quantity + 1 } : c)
        : [...consum, { id: outputId, quantity: 1 }];
    } else if (kind === "attunement") {
      const inf = cur.infusers ?? [];
      const idx = inf.findIndex((i) => i.rarity === outputId);
      optimistic.infusers = idx >= 0
        ? inf.map((i, j) => j === idx ? { ...i, quantity: i.quantity + 1 } : i)
        : [...inf, { rarity: outputId as Rarity, quantity: 1 }];
    }

    const { emoji, name } = queueEntryDisplay(entry);

    try {
      await perform(
        { ...cur, ...optimistic },
        () => edgeCraftCollect(craftId),
        (res) => {
          const fresh = getState();
          update({
            ...fresh,
            craftingQueue:   res.craftingQueue,
            gearInventory:   res.gearInventory,
            consumables:     res.consumables,
            infusers:        res.infusers,
            serverUpdatedAt: res.serverUpdatedAt,
          });
          // Show collect notification
          const toastId = crypto.randomUUID();
          setCollectToasts((prev) => [...prev, { id: toastId, emoji, name }]);
        },
      );
    } catch (e) {
      console.error("collect error:", e);
    } finally {
      setCollectingId(null);
    }
  }, [collectingId, cancelingId, getState, perform, update]);

  // ── Cancel in-progress craft ──────────────────────────────────────────────
  const handleCancel = useCallback(async (craftId: string) => {
    if (collectingId || cancelingId) return;
    setCancelingId(craftId);

    const cur   = getState();
    const entry = (cur.craftingQueue ?? []).find((e) => e.id === craftId);
    if (!entry) { setCancelingId(null); return; }

    const newQueue = (cur.craftingQueue ?? []).filter((e) => e.id !== craftId);

    // Refund from stored ingredient costs
    let essences = [...(cur.essences      ?? [])];
    let gearInv  = [...(cur.gearInventory ?? [])];
    let consum   = [...(cur.consumables   ?? [])];
    let infusers = [...(cur.infusers      ?? [])];

    for (const { type, amount } of (entry.essenceCosts ?? [])) {
      const i = essences.findIndex((e) => e.type === type);
      essences = i >= 0
        ? essences.map((e, j) => j === i ? { ...e, amount: e.amount + amount } : e)
        : [...essences, { type, amount }];
    }
    for (const { gearType, quantity } of (entry.gearCosts ?? [])) {
      const i = gearInv.findIndex((g) => g.gearType === gearType);
      gearInv = i >= 0
        ? gearInv.map((g, j) => j === i ? { ...g, quantity: g.quantity + quantity } : g)
        : [...gearInv, { gearType: gearType as GearType, quantity }];
    }
    for (const { id, quantity } of (entry.consumableCosts ?? [])) {
      const i = consum.findIndex((c) => c.id === id);
      consum = i >= 0
        ? consum.map((c, j) => j === i ? { ...c, quantity: c.quantity + quantity } : c)
        : [...consum, { id, quantity }];
    }
    for (const { rarity, quantity } of (entry.attunementCosts ?? [])) {
      const i = infusers.findIndex((inf) => inf.rarity === rarity);
      infusers = i >= 0
        ? infusers.map((inf, j) => j === i ? { ...inf, quantity: inf.quantity + quantity } : inf)
        : [...infusers, { rarity: rarity as Rarity, quantity }];
    }

    try {
      await perform(
        { ...cur, craftingQueue: newQueue, essences, gearInventory: gearInv, consumables: consum, infusers },
        () => edgeCraftCancel(craftId),
        (res) => {
          const fresh = getState();
          update({
            ...fresh,
            craftingQueue:   res.craftingQueue,
            essences:        res.essences,
            gearInventory:   res.gearInventory,
            consumables:     res.consumables,
            infusers:        res.infusers,
            serverUpdatedAt: res.serverUpdatedAt,
          });
        },
      );
    } catch (e) {
      console.error("cancel error:", e);
    } finally {
      setCancelingId(null);
    }
  }, [collectingId, cancelingId, getState, perform, update]);

  // ── Upgrade crafting slots ────────────────────────────────────────────────
  async function handleUpgradeSlots() {
    if (!nextSlotUpgrade || upgradingSlots) return;
    const cur = getState();
    if (cur.coins < nextSlotUpgrade.cost) return;

    setUpgradingSlots(true);
    try {
      await perform(
        { ...cur, coins: cur.coins - nextSlotUpgrade.cost, craftingSlotCount: nextSlotUpgrade.slots },
        () => edgeUpgradeCraftingSlots(),
        (res) => {
          const fresh = getState();
          update({
            ...fresh,
            coins:             res.coins,
            craftingSlotCount: res.crafting_slot_count,
            serverUpdatedAt:   res.serverUpdatedAt,
          });
        },
      );
    } catch (e) {
      console.error("upgrade slots error:", e);
    } finally {
      setUpgradingSlots(false);
    }
  }

  const craftableCount = entries.filter((e) => e.canCraft).length;

  return (
    <>
      {/* ── Window ──────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-amber-800/30 shadow-lg shadow-amber-950/20 max-w-[33rem] mx-auto w-full">

        {/* Window header */}
        <div className="px-4 py-3 bg-gradient-to-r from-amber-950/50 to-card/80 border-b border-amber-800/25 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-base text-foreground">⚒️ Craft</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {craftableCount > 0
                ? <><span className="text-amber-400 font-semibold">{craftableCount}</span> item{craftableCount !== 1 ? "s" : ""} ready to craft</>
                : "Gather essences to unlock recipes"
              }
            </p>
          </div>
          {/* Crafting slot counter + upgrade */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <p className="text-[10px] text-muted-foreground">
              Slots: <span className={`font-semibold ${slotsAvailable ? "text-foreground" : "text-amber-400"}`}>{slotsInUse}/{craftingSlotCount}</span>
            </p>
            {nextSlotUpgrade && (
              <button
                onClick={handleUpgradeSlots}
                disabled={state.coins < nextSlotUpgrade.cost || upgradingSlots}
                className="text-[10px] px-2 py-0.5 rounded-md border border-amber-600/40 text-amber-400 hover:border-amber-400/60 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                title={`Unlock slot ${nextSlotUpgrade.slots}`}
              >
                {upgradingSlots ? "…" : `+1 Slot · ${nextSlotUpgrade.cost.toLocaleString()}🪙`}
              </button>
            )}
            {!nextSlotUpgrade && craftingSlotCount >= 6 && (
              <p className="text-[10px] text-amber-400/60">Max slots</p>
            )}
          </div>
        </div>

        {/* ── Crafting queue panel ─────────────────────────────────────────── */}
        {craftingQueue.length > 0 && (
          <div className="px-4 py-3 bg-card/50 border-b border-amber-800/25 space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Crafting Queue</p>
            {craftingQueue.map((qEntry) => (
              <QueueEntryRow
                key={qEntry.id}
                entry={qEntry}
                now={now}
                onCollect={handleCollect}
                onCancel={handleCancel}
                isCollecting={collectingId === qEntry.id}
                isCanceling={cancelingId === qEntry.id}
              />
            ))}
          </div>
        )}

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

        {/* Search */}
        <div className="px-4 pb-2 bg-card/60">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipes…"
              className="w-full pl-7 pr-8 py-1.5 rounded-lg bg-card/60 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs leading-none"
              >
                ✕
              </button>
            )}
          </div>
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
              {search.trim() ? `No recipes matching "${search}"` : "No items in this category yet."}
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
          slotsAvailable={slotsAvailable}
        />
      )}

      {/* ── Collect toasts ───────────────────────────────────────────────── */}
      {collectToasts.length > 0 && (
        <div className="fixed bottom-20 inset-x-0 flex flex-col items-center gap-2 pointer-events-none z-[60]">
          {collectToasts.map((t) => (
            <CollectToast
              key={t.id}
              emoji={t.emoji}
              name={t.name}
              onDone={() => setCollectToasts((prev) => prev.filter((x) => x.id !== t.id))}
            />
          ))}
        </div>
      )}
    </>
  );
}
