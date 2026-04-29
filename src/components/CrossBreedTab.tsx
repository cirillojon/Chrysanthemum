import { useState } from "react";
import { useGame } from "../store/GameContext";
import { FLOWERS, RARITY_CONFIG, FLOWER_TYPES, getFlower, type MutationType } from "../data/flowers";
import { MUTATIONS } from "../data/flowers";
import { CROSS_BREED_RECIPES, findRecipe, getOutputCount } from "../data/recipes";
import { crossBreedOptimistic } from "../store/gameStore";
import { edgeCrossBreed, type CrossBreedResponse } from "../lib/edgeFunctions";
import type { InventoryItem } from "../store/gameStore";

// ── Flower slot picker ────────────────────────────────────────────────────────

function FlowerPicker({
  onSelect,
  onClose,
  exclude,
}: {
  onSelect: (item: InventoryItem) => void;
  onClose: () => void;
  exclude?: { speciesId: string; mutation?: string };
}) {
  const { state } = useGame();

  const eligible = state.inventory.filter((item) => {
    if (item.isSeed || item.quantity <= 0) return false;
    const sp = getFlower(item.speciesId);
    if (!sp) return false;
    // Exclude the already-selected slot's item (unless there are 2+ of it)
    if (
      exclude &&
      item.speciesId === exclude.speciesId &&
      (item.mutation ?? undefined) === (exclude.mutation ?? undefined)
    ) {
      return item.quantity >= 2;
    }
    return true;
  });

  const sorted = [...eligible].sort((a, b) => {
    const ra = getFlower(a.speciesId)?.rarity ?? "common";
    const rb = getFlower(b.speciesId)?.rarity ?? "common";
    const ORDER = ["prismatic", "exalted", "mythic", "legendary", "rare", "uncommon", "common"];
    return ORDER.indexOf(ra) - ORDER.indexOf(rb);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/60">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
          <p className="text-sm font-semibold">Select a flower</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
        </div>
        <div className="overflow-y-auto px-3 pb-3 flex flex-col gap-1.5">
          {sorted.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No eligible blooms in inventory.</p>
          )}
          {sorted.map((item) => {
            const sp  = getFlower(item.speciesId)!;
            const cfg = RARITY_CONFIG[sp.rarity];
            const mut = item.mutation ? MUTATIONS[item.mutation as MutationType] : null;
            return (
              <button
                key={`${item.speciesId}${item.mutation ?? ""}`}
                onClick={() => { onSelect(item); onClose(); }}
                className="flex items-center gap-3 text-left rounded-xl border border-border bg-card/60 hover:border-primary/40 hover:bg-card/80 px-3 py-2.5 transition-all duration-150"
              >
                <span className={`text-2xl ${cfg.glow}`}>{sp.emoji.bloom}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {mut && <span className={mut.color}>{mut.emoji} </span>}
                    {sp.name}
                  </p>
                  <p className={`text-[10px] ${cfg.color}`}>{cfg.label}</p>
                </div>
                <p className="text-xs text-muted-foreground shrink-0">×{item.quantity}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Flower slot ───────────────────────────────────────────────────────────────

function FlowerSlot({
  item,
  label,
  onClick,
}: {
  item: InventoryItem | null;
  label: string;
  onClick: () => void;
}) {
  const sp  = item ? getFlower(item.speciesId) : null;
  const cfg = sp ? RARITY_CONFIG[sp.rarity] : null;
  const mut = item?.mutation ? MUTATIONS[item.mutation as MutationType] : null;

  return (
    <button
      onClick={onClick}
      className={`
        flex-1 min-h-[96px] rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all duration-200
        ${sp
          ? "border-primary/40 bg-card/80 hover:border-primary/70"
          : "border-dashed border-border bg-card/30 hover:border-border/70 hover:bg-card/50"
        }
      `}
    >
      {sp && cfg ? (
        <>
          <span className={`text-3xl ${cfg.glow}`}>{sp.emoji.bloom}</span>
          <div className="text-center px-2">
            <p className="text-[11px] font-medium truncate max-w-[90px]">
              {mut && <span className={mut.color}>{mut.emoji} </span>}
              {sp.name}
            </p>
            <p className={`text-[9px] ${cfg.color}`}>{cfg.label}</p>
          </div>
        </>
      ) : (
        <>
          <span className="text-2xl text-muted-foreground/40">+</span>
          <p className="text-[10px] text-muted-foreground">{label}</p>
        </>
      )}
    </button>
  );
}

// ── Result banner ─────────────────────────────────────────────────────────────

type ResultState =
  | { kind: "crafted"; outputSpeciesId: string; outputCount: 1 | 2; firstDiscovery: boolean }
  | { kind: "no_match"; almostThere: boolean }
  | null;

function ResultBanner({ result, onClose }: { result: ResultState; onClose: () => void }) {
  if (!result) return null;

  const sp  = result.kind !== "no_match" ? getFlower(result.outputSpeciesId) : null;
  const cfg = sp ? RARITY_CONFIG[sp.rarity] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-10 px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-5 flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
        {result.kind === "crafted" && sp && cfg && (
          <>
            {result.firstDiscovery ? (
              <p className="text-xs text-amber-400 uppercase tracking-widest">New Discovery!</p>
            ) : (
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Cross-bred!</p>
            )}
            <div className={`text-5xl ${cfg.glow}`}>{sp.emoji.bloom}</div>
            <div className="text-center">
              <p className={`font-semibold text-lg ${cfg.color}`}>{sp.name}</p>
              <p className={`text-xs ${cfg.color} opacity-70`}>{cfg.label}</p>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              You received {result.outputCount === 2 ? "2 seeds" : "1 seed"}.
              {result.outputCount === 2 && (
                <span className="text-primary"> Bonus seed for using above-minimum rarity!</span>
              )}
            </p>
          </>
        )}
        {result.kind === "no_match" && (
          <>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">No reaction</p>
            <div className="text-4xl">🧪</div>
            <p className="text-sm font-medium text-center">
              {result.almostThere
                ? "Something stirs… but the pairing is incomplete."
                : "These flowers have no affinity."}
            </p>
            {result.almostThere && (
              <p className="text-xs text-muted-foreground text-center">
                One of the types is on the right track. Try a different partner.
              </p>
            )}
          </>
        )}
        <button
          onClick={onClose}
          className="mt-1 px-5 py-2 rounded-full text-xs font-semibold bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// ── Discovered recipes panel ──────────────────────────────────────────────────

function DiscoveredRecipesPanel() {
  const { state } = useGame();
  const discovered = state.discoveredRecipes;

  if (discovered.length === 0) return null;

  const knownRecipes = CROSS_BREED_RECIPES.filter((r) => discovered.includes(r.id));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
        Discovered Recipes ({knownRecipes.length})
      </p>
      <div className="flex flex-col gap-1.5">
        {knownRecipes.map((recipe) => {
          const output = getFlower(recipe.outputSpeciesId);
          if (!output) return null;
          const cfg  = RARITY_CONFIG[output.rarity];
          const typeA = FLOWER_TYPES[recipe.typeA];
          const typeB = FLOWER_TYPES[recipe.typeB];
          return (
            <div
              key={recipe.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card/40 px-3 py-2"
            >
              <span className="text-sm">{typeA.emoji}</span>
              <span className="text-xs text-muted-foreground">+</span>
              <span className="text-sm">{typeB.emoji}</span>
              <span className="text-xs text-muted-foreground">→</span>
              <span className={`text-sm ${cfg.glow}`}>{output.emoji.bloom}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{output.name}</p>
                <p className={`text-[10px] ${cfg.color}`}>{cfg.label}</p>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">Tier {recipe.tier}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main CrossBreedTab ────────────────────────────────────────────────────────

export function CrossBreedTab() {
  const { state, perform } = useGame();

  const [slotA, setSlotA] = useState<InventoryItem | null>(null);
  const [slotB, setSlotB] = useState<InventoryItem | null>(null);
  const [picker, setPicker] = useState<"A" | "B" | null>(null);
  const [result, setResult] = useState<ResultState>(null);
  const [loading, setLoading] = useState(false);

  const spA = slotA ? getFlower(slotA.speciesId) : null;
  const spB = slotB ? getFlower(slotB.speciesId) : null;

  const canBreed = !!slotA && !!slotB && !loading;

  // Re-validate slots whenever inventory changes (items might have been spent)
  const validSlotA = slotA && state.inventory.find((i) =>
    i.speciesId === slotA.speciesId && (i.mutation ?? undefined) === (slotA.mutation ?? undefined) && !i.isSeed && i.quantity > 0
  ) ? slotA : null;
  const validSlotB = slotB && state.inventory.find((i) => {
    if (i.speciesId === slotB.speciesId && (i.mutation ?? undefined) === (slotB.mutation ?? undefined) && !i.isSeed) {
      const sameAsA = slotA && slotB.speciesId === slotA.speciesId && (slotB.mutation ?? "") === (slotA.mutation ?? "");
      return sameAsA ? i.quantity >= 2 : i.quantity > 0;
    }
    return false;
  }) ? slotB : null;

  async function handleBreed() {
    if (!validSlotA || !validSlotB || !spA || !spB) return;

    setLoading(true);

    const recipe = findRecipe(spA, spB);

    if (!recipe) {
      // No need to call server for guaranteed no-match — but we do to get almostThere
      try {
        const res = await edgeCrossBreed(
          validSlotA.speciesId, validSlotA.mutation,
          validSlotB.speciesId, validSlotB.mutation,
        ) as CrossBreedResponse;
        if (res.result === "no_match") {
          setResult({ kind: "no_match", almostThere: res.almostThere });
        }
      } catch {
        setResult({ kind: "no_match", almostThere: false });
      }
      setLoading(false);
      return;
    }

    const count = getOutputCount(spA, spB, recipe);

    const newState = crossBreedOptimistic(
      state,
      validSlotA.speciesId, validSlotA.mutation,
      validSlotB.speciesId, validSlotB.mutation,
      recipe.id,
      recipe.outputSpeciesId,
      count,
    );

    perform(
      newState,
      () => edgeCrossBreed(validSlotA.speciesId, validSlotA.mutation, validSlotB.speciesId, validSlotB.mutation),
      (res) => {
        if (res.result === "match") {
          setResult({ kind: "crafted", outputSpeciesId: res.outputSpeciesId, outputCount: res.outputCount, firstDiscovery: res.firstDiscovery });
          // Clear slots — inputs are always consumed
          setSlotA(null);
          setSlotB(null);
        }
      },
    );

    setLoading(false);
  }

  // Hint: show what tier this combo would hit
  const hint = spA && spB ? (() => {
    const r = findRecipe(spA, spB);
    if (!r) return null;
    const out = getFlower(r.outputSpeciesId);
    if (!out) return null;
    const cfg = RARITY_CONFIG[out.rarity];
    const known = state.discoveredRecipes.includes(r.id);
    return { recipe: r, output: out, cfg, known };
  })() : null;

  return (
    <div className="flex flex-col gap-5">

      {/* Instruction */}
      <div className="text-center space-y-1">
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          Combine two blooms to discover and craft new species. Both flowers are consumed on each attempt.
        </p>
      </div>

      {/* Slots */}
      <div className="flex gap-3 items-center">
        <FlowerSlot item={validSlotA} label="Slot A" onClick={() => setPicker("A")} />
        <span className="text-xl text-muted-foreground shrink-0">+</span>
        <FlowerSlot item={validSlotB} label="Slot B" onClick={() => setPicker("B")} />
      </div>

      {/* Combo hint */}
      {hint && (
        <div className={`
          flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs
          ${hint.known
            ? "border-primary/30 bg-primary/5 text-primary"
            : "border-amber-400/30 bg-amber-400/5 text-amber-400"
          }
        `}>
          <span>{hint.known ? "✅" : "✨"}</span>
          <span>
            {hint.known
              ? `Known recipe → ${hint.output.name} (${hint.cfg.label})`
              : `New recipe: ${hint.output.name} (${hint.cfg.label})`
            }
          </span>
        </div>
      )}

      {/* Breed button */}
      <button
        onClick={handleBreed}
        disabled={!canBreed || !validSlotA || !validSlotB}
        className={`
          w-full py-3 rounded-full text-sm font-semibold border transition-all duration-200
          flex items-center justify-center gap-2
          ${canBreed && validSlotA && validSlotB
            ? "border-primary text-primary hover:bg-primary/10 hover:scale-[1.02]"
            : "border-border text-muted-foreground opacity-50 cursor-not-allowed"
          }
        `}
      >
        {loading ? "Breeding…" : "🌿 Breed"}
      </button>

      {/* Discovered recipes */}
      <DiscoveredRecipesPanel />

      {/* Pickers */}
      {picker === "A" && (
        <FlowerPicker
          exclude={validSlotB ? { speciesId: validSlotB.speciesId, mutation: validSlotB.mutation } : undefined}
          onSelect={(item) => setSlotA(item)}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "B" && (
        <FlowerPicker
          exclude={validSlotA ? { speciesId: validSlotA.speciesId, mutation: validSlotA.mutation } : undefined}
          onSelect={(item) => setSlotB(item)}
          onClose={() => setPicker(null)}
        />
      )}

      {/* Result banner */}
      <ResultBanner result={result} onClose={() => setResult(null)} />
    </div>
  );
}
