import { useState } from "react";
import { useGame } from "../store/GameContext";
import { getFlower, RARITY_CONFIG, MUTATIONS } from "../data/flowers";
import type { MutationType } from "../data/flowers";
import { edgeMarketplaceCreateListing } from "../lib/edgeFunctions";

const LISTING_FEE_PCT = 0.05;

interface Props {
  onClose:  () => void;
  onListed: () => void; // called after successful listing so parent can refresh
}

function formatCoins(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export function CreateListingModal({ onClose, onListed }: Props) {
  const { state, update } = useGame();

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [askPriceStr, setAskPriceStr] = useState("");
  const [listing, setListing]         = useState(false);
  const [error, setError]             = useState("");

  // Only harvested blooms (not seeds)
  const items = state.inventory.filter((i) => !i.isSeed && i.quantity > 0);

  const askPrice = parseInt(askPriceStr, 10);
  const validPrice = !isNaN(askPrice) && askPrice >= 1;
  const fee = validPrice ? Math.max(1, Math.floor(askPrice * LISTING_FEE_PCT)) : 0;

  const selectedItem = selectedIdx !== null ? items[selectedIdx] : null;

  async function handleList() {
    if (!selectedItem || !validPrice) return;
    setListing(true);
    setError("");

    try {
      const result = await edgeMarketplaceCreateListing(
        selectedItem.speciesId,
        selectedItem.mutation,
        askPrice,
      );
      // Apply server-confirmed state (coins deducted, item removed from inventory)
      update({ ...state, coins: result.coins, inventory: result.inventory });
      onListed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create listing");
      setListing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
      <div className="bg-card border border-primary/30 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">Create Listing</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              5% listing fee · 48h expiry · fee is non-refundable
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <p className="text-3xl">🎒</p>
            <p className="text-sm text-muted-foreground">No flowers to list.</p>
            <p className="text-xs text-muted-foreground">Harvest some flowers first!</p>
          </div>
        ) : (
          <>
            {/* Item picker */}
            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wide mb-2">
                Select a flower
              </p>
              {items.map((item, idx) => {
                const species  = getFlower(item.speciesId);
                const mut      = item.mutation ? MUTATIONS[item.mutation as MutationType] : null;
                const rarity   = species ? RARITY_CONFIG[species.rarity] : null;
                const selected = selectedIdx === idx;
                if (!species) return null;

                return (
                  <button
                    key={`${item.speciesId}-${item.mutation ?? "none"}-${idx}`}
                    onClick={() => { setSelectedIdx(selected ? null : idx); setError(""); }}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left
                      ${selected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:border-primary/40"
                      }
                    `}
                  >
                    <div className="relative flex-shrink-0">
                      <span className="text-2xl">{species.emoji.bloom}</span>
                      {mut && <span className="absolute -top-1 -right-1 text-xs">{mut.emoji}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium truncate">{species.name}</p>
                        {mut && <span className={`text-xs font-mono ${mut.color}`}>{mut.name}</span>}
                      </div>
                      <p className={`text-xs font-mono ${rarity?.color}`}>{rarity?.label}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-muted-foreground">×{item.quantity}</p>
                      <p className="text-[10px] text-muted-foreground/60">{formatCoins(species.sellValue)} 🪙 base</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Ask price */}
            <div className="space-y-1.5">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wide">
                Ask price (🪙 coins)
              </p>
              <input
                type="number"
                min={1}
                value={askPriceStr}
                onChange={(e) => { setAskPriceStr(e.target.value); setError(""); }}
                placeholder="e.g. 50000"
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {/* Fee breakdown */}
            {validPrice && (
              <div className="bg-background border border-border rounded-xl px-3 py-2.5 space-y-1 text-xs font-mono">
                <div className="flex justify-between text-muted-foreground">
                  <span>Ask price</span>
                  <span>{formatCoins(askPrice)} 🪙</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Listing fee (5%)</span>
                  <span className="text-red-400">−{formatCoins(fee)} 🪙</span>
                </div>
                <div className="border-t border-border/60 pt-1 flex justify-between font-bold">
                  <span>You earn (on sale)</span>
                  <span className="text-primary">{formatCoins(askPrice)} 🪙</span>
                </div>
                <p className="text-[10px] text-muted-foreground/60 text-right">
                  Fee of {formatCoins(fee)} 🪙 charged now · non-refundable
                </p>
              </div>
            )}

            {error && <p className="text-xs text-red-400 font-mono">{error}</p>}

            {/* Confirm button */}
            <button
              onClick={handleList}
              disabled={selectedIdx === null || !validPrice || listing || state.coins < fee}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 text-center"
            >
              {listing
                ? "Listing..."
                : selectedItem && validPrice
                  ? `List ${getFlower(selectedItem.speciesId)?.name ?? "flower"} for ${formatCoins(askPrice)} 🪙`
                  : "Select a flower and set a price"
              }
            </button>

            {selectedIdx !== null && validPrice && state.coins < fee && (
              <p className="text-xs text-red-400 font-mono text-center -mt-2">
                Not enough coins for the listing fee ({formatCoins(fee)} 🪙 needed)
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
