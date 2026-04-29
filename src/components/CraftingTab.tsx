import { useState, useMemo, useEffect, useCallback } from "react";
import { useGame } from "../store/GameContext";
import { GEAR_RECIPES, CRAFTING_SLOT_UPGRADES, canCraftGear, type GearRecipe } from "../data/gear-recipes";
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
import {
  edgeCraftStart, edgeCraftCollect, edgeCraftCancel,
  edgeUpgradeCraftingSlots, edgeAlchemyCraft,
} from "../lib/edgeFunctions";
import type { GameState, CraftingQueueEntry } from "../store/gameStore";

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
// Group gear recipes into upgrade chains by stripping the rarity suffix.
// e.g. sprinkler_rare/legendary/mythic → family "sprinkler" → tiers I–V
// Mutation sprinklers (sprinkler_flame) have non-rarity suffixes → unique family → no tier.

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
  // Single-item families don't need a tier badge
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
  // For static "this recipe takes X" labels (not a countdown)
  if (ms <  60_000)          return `${ms / 60_000 < 1 ? Math.round(ms / 1000) + "s" : ms / 60_000 + "m"}`;
  if (ms <  3_600_000)       return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000)       return `${(ms / 3_600_000).toFixed(1).replace(".0", "")} hr`;
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

/** Returns text/border/bg class strings for a colored ingredient chip. */
function rarityChip(rarity: Rarity): { color: string; border: string; bg: string } {
  // rainbow-border + rainbow-bg would clobber each other (both set `animation`).
  // rainbow-tile runs all three keyframes in one declaration — use it for the border slot.
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
  // A gear craft can only start if there's at least one open slot
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
  const def       = GEAR[entry.gearType as GearType];
  const startedAt = new Date(entry.startedAt).getTime();
  const elapsed   = now - startedAt;
  const progress  = Math.min(elapsed / entry.durationMs, 1);
  const isDone    = progress >= 1;
  const remaining = Math.max(entry.durationMs - elapsed, 0);

  return (
    <div className="rounded-xl border border-border bg-card/40 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg leading-none shrink-0">{def?.emoji ?? "⚙️"}</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{def?.name ?? entry.gearType}</p>
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
      {/* Progress bar */}
      <div className="w-full h-1.5 rounded-full bg-card/60 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isDone ? "bg-green-500" : "bg-amber-500"}`}
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

  const gearType = entry.kind === "gear" ? entry.id.replace("gear:", "") : null;
  const gearRecipe = gearType ? GEAR_RECIPES.find((r) => r.outputGearType === gearType) : null;

  // Button state
  const isGear = entry.kind === "gear";
  const canAct = isGear ? (slotsAvailable && entry.canCraft) : entry.canCraft;

  let buttonLabel: string;
  if (isCrafting)           buttonLabel = isGear ? "Starting…" : "Crafting…";
  else if (isGear && !slotsAvailable) buttonLabel = "No crafting slots available";
  else if (!entry.canCraft) buttonLabel = "Missing ingredients or coins";
  else                      buttonLabel = isGear ? "⏳ Start Crafting" : "⚒️ Craft";

  // Render ingredients section depending on item kind
  let ingredientsSection: React.ReactNode = null;

  if (entry.kind === "gear" && gearRecipe) {
    ingredientsSection = (
      <div className="space-y-1">
        {/* Coin cost row */}
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
        <p className="text-[10px] text-muted-foreground pt-0.5 px-0.5">
          ⏱ Duration: <span className="text-foreground">{formatDurationLabel(gearRecipe.durationMs)}</span>
        </p>
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
    // attunement
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
  const [filter,       setFilter]       = useState<CraftFilter>("all");
  const [search,       setSearch]       = useState("");
  const [selected,     setSelected]     = useState<CraftEntry | null>(null);
  const [crafting,     setCrafting]     = useState(false);
  const [craftError,   setCraftError]   = useState<string | null>(null);
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [cancelingId,  setCancelingId]  = useState<string | null>(null);
  const [upgradingSlots, setUpgradingSlots] = useState(false);

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

  // Keep selected entry in sync after a craft
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

  // ── Start crafting (gear → queue) ─────────────────────────────────────────
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
        const tempEntry: CraftingQueueEntry = {
          id:         crypto.randomUUID(),
          gearType:   gearType as GearType,
          startedAt:  new Date().toISOString(),
          durationMs: recipe.durationMs,
          coinCost:   recipe.coinCost,
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
          () => edgeCraftStart(gearType),
          (res) => {
            const fresh = getState();
            update({
              ...fresh,
              coins:         res.coins,
              essences:      res.essences,
              gearInventory: res.gearInventory,
              consumables:   res.consumables,
              craftingQueue: res.craftingQueue,
              serverUpdatedAt: res.serverUpdatedAt,
            });
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

  // ── Collect finished craft ────────────────────────────────────────────────
  const handleCollect = useCallback(async (craftId: string) => {
    if (collectingId || cancelingId) return;
    setCollectingId(craftId);

    const cur    = getState();
    const entry  = (cur.craftingQueue ?? []).find((e) => e.id === craftId);
    if (!entry) { setCollectingId(null); return; }

    const gearType = entry.gearType;
    const newQueue = (cur.craftingQueue ?? []).filter((e) => e.id !== craftId);
    const gearInv  = cur.gearInventory ?? [];
    const idx      = gearInv.findIndex((g) => g.gearType === gearType);
    const newGearInv = idx >= 0
      ? gearInv.map((g, i) => i === idx ? { ...g, quantity: g.quantity + 1 } : g)
      : [...gearInv, { gearType: gearType as GearType, quantity: 1 }];

    try {
      await perform(
        { ...cur, craftingQueue: newQueue, gearInventory: newGearInv },
        () => edgeCraftCollect(craftId),
        (res) => {
          const fresh = getState();
          update({ ...fresh, craftingQueue: res.craftingQueue, gearInventory: res.gearInventory, serverUpdatedAt: res.serverUpdatedAt });
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

    const recipe = GEAR_RECIPES.find((r) => r.outputGearType === entry.gearType);
    if (!recipe) { setCancelingId(null); return; }

    const newQueue = (cur.craftingQueue ?? []).filter((e) => e.id !== craftId);

    // Optimistic refund of ingredients (not coins)
    let essences = [...(cur.essences      ?? [])];
    let gearInv  = [...(cur.gearInventory ?? [])];
    let consum   = [...(cur.consumables   ?? [])];
    for (const ing of recipe.ingredients) {
      if (ing.kind === "essence") {
        const i = essences.findIndex((e) => e.type === ing.essenceType);
        essences = i >= 0
          ? essences.map((e, j) => j === i ? { ...e, amount: e.amount + ing.amount } : e)
          : [...essences, { type: ing.essenceType, amount: ing.amount }];
      } else if (ing.kind === "gear") {
        const i = gearInv.findIndex((g) => g.gearType === ing.gearType);
        gearInv = i >= 0
          ? gearInv.map((g, j) => j === i ? { ...g, quantity: g.quantity + ing.quantity } : g)
          : [...gearInv, { gearType: ing.gearType as GearType, quantity: ing.quantity }];
      } else {
        const i = consum.findIndex((c) => c.id === ing.consumableId);
        consum = i >= 0
          ? consum.map((c, j) => j === i ? { ...c, quantity: c.quantity + ing.quantity } : c)
          : [...consum, { id: ing.consumableId, quantity: ing.quantity }];
      }
    }

    try {
      await perform(
        { ...cur, craftingQueue: newQueue, essences, gearInventory: gearInv, consumables: consum },
        () => edgeCraftCancel(craftId),
        (res) => {
          const fresh = getState();
          update({
            ...fresh,
            craftingQueue:   res.craftingQueue,
            essences:        res.essences,
            gearInventory:   res.gearInventory,
            consumables:     res.consumables,
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
            coins:           res.coins,
            craftingSlotCount: res.crafting_slot_count,
            serverUpdatedAt: res.serverUpdatedAt,
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
            <h2 className="font-bold text-base text-foreground">⚒️ Forge</h2>
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
    </>
  );
}
