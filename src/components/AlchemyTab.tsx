import { useState, useMemo } from "react";
import { useGame } from "../store/GameContext";
import { FLOWER_TYPES, RARITY_CONFIG, getFlower, MUTATIONS } from "../data/flowers";
import { ESSENCE_YIELD, calculateEssenceYield, mergeEssences } from "../data/essences";
import { sacrificeFlowers, type SacrificeEntry } from "../store/gameStore";
import { edgeAlchemySacrifice } from "../lib/edgeFunctions";
import type { MutationType, Rarity } from "../data/flowers";
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

  // Sort by FLOWER_TYPES order for consistent display
  const sorted = [...essences].sort((a, b) => {
    const order = Object.keys(FLOWER_TYPES);
    return order.indexOf(a.type) - order.indexOf(b.type);
  });

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {sorted.map(({ type, amount }) => {
        const cfg = FLOWER_TYPES[type];
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

// ── Main AlchemyTab component ─────────────────────────────────────────────

type AlchemyView = "sacrifice" | "essences";

export function AlchemyTab() {
  const { state, perform } = useGame();

  const [view, setView]           = useState<AlchemyView>("sacrifice");
  const [selections, setSelections] = useState<SacrificeMap>(new Map());
  const [activeRarity, setActiveRarity] = useState<Rarity | null>(null);
  const [sacrificing, setSacrificing]   = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState<EssenceItem[] | null>(null);

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

  const filteredItems = useMemo(() => {
    if (!activeRarity) return [];
    return sacrificableByRarity.get(activeRarity) ?? [];
  }, [activeRarity, sacrificableByRarity]);

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
    setSuccess(null);

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
        setSuccess(result.essences);
        setSelections(new Map());
        succeeded = true;
      },
      // No serialize — sacrifice is standalone (doesn't race with harvest/plant).
      // Default (non-serialized) perform awaits the server call before returning,
      // so we can check `succeeded` right after the await.
    );

    if (!succeeded) {
      setError("Sacrifice failed — please try again.");
    }

    setSacrificing(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">

      {/* Tab switcher: Sacrifice | Essences */}
      <div className="flex rounded-xl border border-border bg-card/40 p-0.5 gap-0.5">
        {(["sacrifice", "essences"] as AlchemyView[]).map((v) => (
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
            {v === "sacrifice" ? "⚗️ Sacrifice" : "✨ Essences"}
          </button>
        ))}
      </div>

      {/* ── ESSENCES view ── */}
      {view === "essences" && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold mb-0.5">Your Essence Bank</p>
            <p className="text-[11px] text-muted-foreground">
              Essences are earned by sacrificing flowers. Use them in the Infuse tab to enhance seeds.
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

          {/* Success banner */}
          {success && (
            <div className="bg-primary/10 border border-primary/40 rounded-xl px-4 py-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-primary">Sacrifice complete!</p>
              <div className="flex flex-wrap gap-1.5">
                {success.filter((e) => e.amount > 0).map(({ type, amount }) => {
                  const cfg = FLOWER_TYPES[type];
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
              <button
                onClick={() => setSuccess(null)}
                className="text-[10px] text-primary/70 hover:text-primary self-end"
              >
                Dismiss
              </button>
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
              {rarityOrder.map((rarity) => {
                const cfg     = RARITY_CONFIG[rarity];
                const hasAny  = (sacrificableByRarity.get(rarity)?.length ?? 0) > 0;
                const isActive = activeRarity === rarity;
                return (
                  <button
                    key={rarity}
                    onClick={() => setActiveRarity(isActive ? null : rarity)}
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

          {/* Flower grid for selected rarity */}
          {activeRarity && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">
                  <span className={RARITY_CONFIG[activeRarity].color}>
                    {RARITY_CONFIG[activeRarity].label}
                  </span>
                  {" "}flowers
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleSelectAll}
                    className="text-[10px] text-primary hover:text-primary/80 font-semibold"
                  >
                    Select all
                  </button>
                  <button
                    onClick={handleClearRarity}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
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
                            {avail} available
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

          {/* No rarity selected nudge */}
          {!activeRarity && totalSelected === 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground space-y-1">
              <p className="text-2xl">⚗️</p>
              <p>Select a rarity above to choose flowers to sacrifice.</p>
            </div>
          )}

          {/* Preview */}
          <SacrificePreview selections={selections} />

          {/* Summary + Sacrifice button */}
          {totalSelected > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-center text-xs text-muted-foreground">
                {totalSelected} flower{totalSelected !== 1 ? "s" : ""} selected
              </p>
              <button
                onClick={handleSacrifice}
                disabled={sacrificing}
                className={`
                  w-full py-3 rounded-full text-sm font-semibold border transition-all duration-200
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

          {/* Current essence wallet preview */}
          {(state.essences ?? []).length > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
                Current essences
              </p>
              <EssenceWallet essences={state.essences ?? []} />
            </div>
          )}

        </div>
      )}

    </div>
  );
}
