import { useState, useRef, useLayoutEffect } from "react";
import {
  type PlantedFlower,
  getCurrentStage,
  getMsUntilNextStage,
  applyFertilizer,
  removePlant,
  applyPlantConsumable,
  stampCropsticksCycles,
} from "../store/gameStore";
import { edgeApplyFertilizer, edgeRemovePlant, edgeApplyAttunement, edgeApplyPlantConsumable, edgeUnpinPlant } from "../lib/edgeFunctions";
import { getFlower, RARITY_CONFIG, MUTATIONS } from "../data/flowers";
import { FlowerTypeBadges } from "./FlowerTypeBadges";
import { FERTILIZERS, type FertilizerType } from "../data/upgrades";
import { useGame } from "../store/GameContext";
import { CONSUMABLE_RECIPE_MAP, ROMAN, RARITY_TIER, type ConsumableId } from "../data/consumables";

interface Props {
  plant:                 PlantedFlower;
  row:                   number;
  col:                   number;
  onClose?:              () => void;
  /** Called when the user clicks the Harvest button (for bloomed plants). */
  onHarvestRequest?:     () => void;
  /** Combined sprinkler × grow-lamp growth multiplier for this cell. */
  gearGrowthMultiplier?: number;
  isUnderSprinkler?:     boolean;
  sprinklerMutations?:   { emoji: string; label: string }[];
  isUnderGrowLamp?:      boolean;
  isUnderScarecrow?:     boolean;
  isUnderComposter?:     boolean;
  isUnderFan?:           boolean;
  isUnderHarvestBell?:   boolean;
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH > 0 ? `${d}d ${remH}h` : `${d}d`;
}

export function PlotTooltip({
  plant, row, col, onClose, onHarvestRequest,
  gearGrowthMultiplier = 1.0,
  isUnderSprinkler, sprinklerMutations = [],
  isUnderGrowLamp, isUnderScarecrow, isUnderComposter, isUnderFan, isUnderHarvestBell,
}: Props) {
  const { state, getState, perform, update, activeWeather } = useGame();
  const [showFertPicker,    setShowFertPicker]    = useState(false);
  const [confirmRemove,     setConfirmRemove]     = useState(false);
  const [removing,          setRemoving]          = useState(false);
  const [applyingAttunement, setApplyingAttunement] = useState(false);
  const [applyingConsumable,setApplyingConsumable]= useState<string | null>(null);
  const [unpinning,         setUnpinning]         = useState(false);
  const [nudge,             setNudge]             = useState(0);
  const [flipped,           setFlipped]           = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw  = document.documentElement.clientWidth;
    const pad = 8;

    // Horizontal clamping
    if (rect.left < pad) {
      setNudge(pad - rect.left);
    } else if (rect.right > vw - pad) {
      setNudge(vw - pad - rect.right);
    }

    // Vertical: flip below the plot if tooltip is hidden behind the sticky nav
    const navEl = document.querySelector<HTMLElement>("[data-sticky-nav]");
    const navBottom = navEl ? navEl.getBoundingClientRect().bottom : 0;
    if (rect.top < navBottom + pad) {
      setFlipped(true);
    }
  }, []);

  const now     = Date.now();
  const species = getFlower(plant.speciesId);
  if (!species) return null;

  const stage         = getCurrentStage(plant, now, activeWeather, gearGrowthMultiplier);
  const msLeft        = getMsUntilNextStage(plant, now, activeWeather, gearGrowthMultiplier);
  const rarity        = RARITY_CONFIG[species.rarity];
  const isBloomed     = stage === "bloom";
  const isNew         = !state.discovered.includes(plant.speciesId);
  const hasFertilizer = !!plant.fertilizer;
  const availableFerts = state.fertilizers
    .filter((f) => f.quantity > 0)
    .sort((a, b) => FERTILIZERS[a.type].speedMultiplier - FERTILIZERS[b.type].speedMultiplier);

  // Rarity ordering used for both infuser and consumable matching.
  const RARITY_ORDER: Record<string, number> = {
    common: 0, uncommon: 1, rare: 2, legendary: 3, mythic: 4, exalted: 5, prismatic: 6,
  };

  // Infuser matching — backwards-tier: any infuser with tier ≥ flower's rarity tier works.
  // Select the lowest matching tier first to conserve higher-tier infusers.
  const flowerRarityTier = RARITY_ORDER[species.rarity] ?? 0;
  const matchingInfuser = [...(state.infusers ?? [])]
    .filter((i) => (RARITY_ORDER[i.rarity] ?? 0) >= flowerRarityTier && i.quantity > 0)
    .sort((a, b) => (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0))[0] ?? null;

  // Consumables applicable to this plant right now.
  //
  // Tier-vs-rarity rule: ALL plant-targeting consumables match DOWNWARD — a
  // higher-tier consumable works on lower-rarity plants (e.g. Mythic vial on
  // a Rare). Floor is still tier 1 (Rare), so Common/Uncommon plants stay
  // excluded.
  const applicableConsumables = (state.consumables ?? []).filter((c) => {
    if (c.quantity <= 0) return false;
    const recipe = CONSUMABLE_RECIPE_MAP[c.id as ConsumableId];
    if (!recipe || recipe.tier === null) return false;

    if ((RARITY_ORDER[recipe.rarity] ?? -1) < (RARITY_ORDER[species.rarity] ?? 999)) return false;

    // Bloom Burst only works on non-bloomed plants
    if (c.id.startsWith("bloom_burst_") && isBloomed) return false;
    // Heirloom Charm only works on bloomed plants
    if (c.id.startsWith("heirloom_charm_") && !isBloomed) return false;
    // Magnifying Glass: hide once the plant is already revealed
    if (c.id.startsWith("magnifying_glass_") && plant.revealed) return false;
    // Garden Pin: hide once the plant is already pinned
    if (c.id.startsWith("garden_pin_") && plant.pinned) return false;
    return true;
  });

  async function handleApplyAttunement() {
    if (applyingAttunement) return;
    setApplyingAttunement(true);
    try {
      const res = await edgeApplyAttunement(row, col);
      const cur = getState();
      // Client-side fallback: stamp crossbreedStartedAt on adjacent cropsticks that
      // now have a valid infused pair, in case the edge function didn't (e.g. older
      // deployment or network quirk). Skips cells already stamped by the server.
      const activeGrid = stampCropsticksCycles(res.grid, row, col, Date.now());
      update({ ...cur, grid: activeGrid, infusers: res.infusers, serverUpdatedAt: res.serverUpdatedAt });
      onClose?.();
    } catch {
      // Server function not yet active or error — silently re-enable button
    } finally {
      setApplyingAttunement(false);
    }
  }

  // Garden Pin removal — required before a pinned plant can be manually
  // harvested. Pin is consumed (no refund of the original consumable).
  async function handleRemovePin() {
    if (unpinning) return;
    setUnpinning(true);
    try {
      const res = await edgeUnpinPlant(row, col);
      const cur = getState();
      update({ ...cur, grid: res.grid, serverUpdatedAt: res.serverUpdatedAt });
    } catch {
      // Silent — server rejected (e.g. CAS miss); pin stays in place
    } finally {
      setUnpinning(false);
    }
  }

  function handleApplyFertilizer(type: FertilizerType) {
    const optimistic = applyFertilizer(state, row, col, type);
    if (optimistic) perform(optimistic, () => edgeApplyFertilizer(row, col, type));
    setShowFertPicker(false);
    onClose?.();
  }

  function handleUseConsumable(consumableId: string) {
    if (applyingConsumable) return;
    const cur = getState();
    const optimistic = applyPlantConsumable(cur, row, col, consumableId);
    if (!optimistic) return;
    const savedCell       = cur.grid[row][col];
    const savedConsumables = cur.consumables;
    setApplyingConsumable(consumableId);
    perform(
      optimistic,
      () => edgeApplyPlantConsumable(row, col, consumableId),
      () => setApplyingConsumable(null),
      {
        rollback: (c) => ({
          ...c,
          grid: c.grid.map((r, ri) =>
            r.map((p, ci) => ri === row && ci === col ? savedCell : p)
          ),
          consumables: savedConsumables,
        }),
      }
    );
  }

  function handleRemove() {
    if (removing) return;
    const cur = getState();
    const optimistic = removePlant(cur, row, col);
    if (!optimistic) return;
    setRemoving(true);
    // Snapshot the cell for surgical rollback
    const savedCell = cur.grid[row][col];
    perform(
      optimistic,
      async () => {
        try {
          return await edgeRemovePlant(row, col);
        } finally {
          setRemoving(false);
        }
      },
      () => onClose?.(),
      {
        rollback: (c) => ({
          ...c,
          grid: c.grid.map((r, ri) =>
            r.map((p, ci) => ri === row && ci === col ? savedCell : p)
          ),
          // Undo the seed that was optimistically added back
          inventory: c.inventory
            .map((i) =>
              i.speciesId === plant.speciesId && i.isSeed
                ? { ...i, quantity: i.quantity - 1 }
                : i
            )
            .filter((i) => i.quantity > 0),
        }),
      }
    );
  }

  return (
    <div
      ref={tooltipRef}
      className={`absolute ${flipped ? "top-full mt-2" : "bottom-full mb-2"} left-1/2 z-40 pointer-events-none`}
      style={{ transform: `translateX(calc(-50% + ${nudge}px))` }}
    >
      <div className="pointer-events-auto bg-card/80 backdrop-blur-sm border border-border rounded-xl p-3 shadow-xl w-48 space-y-2">

        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-xl">{isNew ? "❓" : species.emoji[stage]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold leading-tight">{isNew ? "???" : species.name}</p>
            <p className={`text-[10px] font-mono ${rarity.color}`}>{rarity.label}</p>
            {!isNew && <FlowerTypeBadges types={species.types} className="mt-1" />}
          </div>
          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-xs flex-shrink-0 leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            Stage: <span className="text-foreground capitalize">{stage}</span>
          </p>
          {!isBloomed && (
            <p>
              Next stage in:{" "}
              <span className={`font-mono ${plant.masteredBonus ? "text-yellow-400" : "text-primary"}`}>
                {plant.masteredBonus ? "⚡ " : ""}{formatMs(msLeft)}
              </span>
            </p>
          )}
          {!isBloomed && plant.masteredBonus && (
            <p className="text-[10px] text-yellow-400/70 font-mono">mastered · 20% faster</p>
          )}
          {isBloomed && (
            <p className="text-primary font-semibold">Ready to harvest!</p>
          )}
          {/* Mutation display — surfaces both bloomed plants and revealed (locked) plants. */}
          {(isBloomed || plant.revealed) && plant.mutation && (() => {
            const mut = MUTATIONS[plant.mutation];
            return (
              <p className={`text-[10px] font-mono ${mut.color}`}>
                {plant.revealed && "🔎 "}{mut.emoji} {mut.name} · ×{mut.valueMultiplier} value
                {plant.revealed && !isBloomed && " (locked)"}
              </p>
            );
          })()}
          {/* Bloomed-only "No mutation" message — preserves original undefined-vs-null distinction. */}
          {isBloomed && !plant.revealed && plant.mutation === null && (
            <p className="text-[10px] text-muted-foreground font-mono">No mutation</p>
          )}
          {/* Revealed-but-not-bloomed: explicit "No mutation (locked)" for null OR undefined. */}
          {plant.revealed && !isBloomed && plant.mutation == null && (
            <p className="text-[10px] text-muted-foreground font-mono">🔎 No mutation (locked)</p>
          )}
          {/* Revealed AND bloomed with no mutation (== null catches both null and undefined). */}
          {plant.revealed && isBloomed && plant.mutation == null && (
            <p className="text-[10px] text-muted-foreground font-mono">🔎 No mutation (locked)</p>
          )}
          {/* Active consumable flags */}
          {plant.infused && (
            <p className="text-[10px] font-mono text-emerald-400">💉 Infused · awaiting Cropsticks</p>
          )}
          {plant.heirloomActive && (
            <p className="text-[10px] font-mono text-emerald-400">🔮 Heirloom Charm active</p>
          )}
          {plant.mutationBlocked && (
            <p className="text-[10px] font-mono text-sky-400">🫧 Purity Shield active</p>
          )}
          {plant.forcedMutation === "giant" && (
            <p className="text-[10px] font-mono text-violet-400">🧬 Giant Force active</p>
          )}
          {plant.mutationBoost && !plant.mutationBlocked && (
            <p className="text-[10px] font-mono text-amber-400">
              Boost: {plant.mutationBoost.mutation} ×{plant.mutationBoost.multiplier}
            </p>
          )}
        </div>

        {/* Plant-targeting consumables + infuser */}
        {(applicableConsumables.length > 0 || (isBloomed && !plant.infused && matchingInfuser)) && (
          <div className="pt-1 border-t border-border">
            <p className="text-[10px] text-muted-foreground mb-1">Use consumable</p>
            <div className="flex flex-wrap gap-1">
              {applicableConsumables.map((c) => {
                const recipe = CONSUMABLE_RECIPE_MAP[c.id as ConsumableId];
                if (!recipe) return null;
                const busy = applyingConsumable === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => handleUseConsumable(c.id)}
                    disabled={!!applyingConsumable}
                    title={`${recipe.name} — ${recipe.description}`}
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[10px] transition-colors disabled:opacity-50 ${
                      busy
                        ? "bg-primary/20 border-primary/40 text-primary"
                        : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
                    }`}
                  >
                    <span>{recipe.emoji}</span>
                    {recipe.tier !== null && (
                      <span>{ROMAN[recipe.tier as 1|2|3|4|5]}</span>
                    )}
                    <span className="text-muted-foreground ml-0.5">×{c.quantity}</span>
                  </button>
                );
              })}
              {isBloomed && !plant.infused && matchingInfuser && (() => {
                const tier  = RARITY_TIER[matchingInfuser.rarity as keyof typeof RARITY_TIER] ?? 1;
                const roman = ROMAN[tier as 1|2|3|4|5];
                return (
                  <button
                    onClick={handleApplyAttunement}
                    disabled={!!applyingAttunement}
                    title={`Infuser ${roman} — Mark this bloom as a cross-breeding participant`}
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[10px] transition-colors disabled:opacity-50 ${
                      applyingAttunement
                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                        : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                    }`}
                  >
                    <span>💉</span>
                    <span>{roman}</span>
                    <span className="text-muted-foreground ml-0.5">×{matchingInfuser.quantity}</span>
                  </button>
                );
              })()}
            </div>
          </div>
        )}

        {/* Bloomed / pinned actions — Harvest + Remove Pin + Attunement.
            Pinned plants surface "Remove Pin" instead of Harvest; the user must
            unpin first to actually take the bloom (pin is consumed). Unbloomed
            pinned plants also get the button so a misplaced pin can be undone. */}
        {(isBloomed || plant.pinned) && (
          <div className="pt-1 border-t border-border space-y-1.5">
            {plant.pinned ? (
              <button
                onClick={handleRemovePin}
                disabled={unpinning}
                title="Removes the Garden Pin (consumed). Required before harvesting."
                className="w-full py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-semibold hover:bg-amber-500/30 transition-colors text-center disabled:opacity-50"
              >
                {unpinning ? "Removing…" : "📌 Remove Pin"}
              </button>
            ) : onHarvestRequest && (
              <button
                onClick={() => { onHarvestRequest(); onClose?.(); }}
                className="w-full py-1.5 rounded-lg bg-primary/20 border border-primary/50 text-primary text-xs font-semibold hover:bg-primary/30 transition-colors text-center"
              >
                Harvest
              </button>
            )}

          </div>
        )}

        {/* Active gear effects */}
        {(isUnderSprinkler || sprinklerMutations.length > 0 || isUnderGrowLamp || isUnderScarecrow || isUnderComposter || isUnderFan || isUnderHarvestBell) && (
          <div className="pt-1 border-t border-border space-y-1">
            <p className="text-[10px] text-muted-foreground">Active gear</p>

            {/* Chip labels */}
            <div className="flex flex-wrap gap-1">
              {isUnderGrowLamp && (
                <span className="relative inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-400/10 border border-amber-400/30 text-[10px] text-amber-300 overflow-hidden">
                  <div className="absolute inset-0 gear-lamp-glow pointer-events-none" />
                  <span className="relative">💡</span>
                  <span className="relative">Grow lamp</span>
                </span>
              )}
              {isUnderSprinkler && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-blue-400/10 border border-blue-400/20 text-[10px] text-blue-300">
                  <span>💧</span><span>Sprinkler</span>
                </span>
              )}
              {sprinklerMutations.map(({ emoji, label }, i) => (
                <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-blue-400/10 border border-blue-400/20 text-[10px] text-blue-300">
                  <span>{emoji}</span><span>{label}</span>
                </span>
              ))}
              {isUnderScarecrow && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-green-400/10 border border-green-400/20 text-[10px] text-green-300">
                  <span>🧹</span><span>Scarecrow</span>
                </span>
              )}
              {isUnderComposter && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-green-400/10 border border-green-400/20 text-[10px] text-green-300">
                  <span>🧺</span><span>Composter</span>
                </span>
              )}
              {isUnderFan && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-stone-400/10 border border-stone-400/20 text-[10px] text-stone-300">
                  <span>💨</span><span>Fan</span>
                </span>
              )}
              {isUnderHarvestBell && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-yellow-400/10 border border-yellow-400/20 text-[10px] text-yellow-300">
                  <span>🔔</span><span>Harvest Bell</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Fertilizer section */}
        {!isBloomed && (
          <div className="pt-1 border-t border-border">
            {hasFertilizer ? (
              <p className="text-[10px] text-green-400 font-mono">
                {FERTILIZERS[plant.fertilizer!].emoji}{" "}
                {FERTILIZERS[plant.fertilizer!].name} applied
              </p>
            ) : availableFerts.length > 0 ? (
              <>
                <button
                  onClick={() => setShowFertPicker((v) => !v)}
                  className="text-[10px] text-primary hover:underline w-full text-left"
                >
                  + Apply fertilizer
                </button>
                {showFertPicker && (
                  <div className="mt-1.5 space-y-1">
                    {availableFerts.map((f) => (
                      <button
                        key={f.type}
                        onClick={() => handleApplyFertilizer(f.type)}
                        className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors"
                      >
                        <span>{FERTILIZERS[f.type].emoji}</span>
                        <span className="text-[10px] text-foreground">
                          {FERTILIZERS[f.type].name}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          ×{f.quantity}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-[10px] text-muted-foreground">No fertilizer available</p>
            )}
          </div>
        )}

        {/* Remove section — only for growing (non-bloomed) plants */}
        {!isBloomed && (
          <div className="pt-1 border-t border-border">
            {confirmRemove ? (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Seed will be returned. Sure?</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={handleRemove}
                    disabled={removing}
                    className="flex-1 text-[10px] py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-40 text-center"
                  >
                    {removing ? "Removing..." : "Yes, remove"}
                  </button>
                  <button
                    onClick={() => setConfirmRemove(false)}
                    className="flex-1 text-[10px] py-1 rounded-lg bg-card border border-border text-muted-foreground hover:border-primary/30 transition-colors text-center"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setShowFertPicker(false); setConfirmRemove(true); }}
                className="text-[10px] text-red-400 hover:text-red-300 transition-colors w-full text-left"
              >
                🗑 Remove plant
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
