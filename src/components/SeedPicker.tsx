import { getFlower, RARITY_CONFIG, MUTATIONS } from "../data/flowers";
import { FlowerTypeBadges } from "./FlowerTypeBadges";
import { GEAR } from "../data/gear";
import { useGame } from "../store/GameContext";
import { isSpeciesMastered } from "../store/gameStore";
import type { GearType } from "../data/gear";

interface Props {
  onSelect:     (speciesId: string) => void;
  onGearSelect: (gearType: GearType) => void;
  onClose:      () => void;
}

export function SeedPicker({ onSelect, onGearSelect, onClose }: Props) {
  const { state } = useGame();

  const seeds = state.inventory.filter((i) => i.quantity > 0 && i.isSeed);
  const gear  = (state.gearInventory ?? []).filter((i) => i.quantity > 0);

  const hasAnything = seeds.length > 0 || gear.length > 0;

  if (!hasAnything) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 text-center space-y-2 w-80 shadow-xl z-50">
        <p className="text-sm text-muted-foreground">Nothing to place.</p>
        <p className="text-xs text-muted-foreground">Buy seeds or gear from the Shop tab.</p>
        <button onClick={onClose} className="text-xs text-primary hover:underline">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-3 w-80 shadow-xl z-50">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Select what to place</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">

        {/* ── Seeds ────────────────────────────────────────────────────────── */}
        {seeds.length > 0 && (
          <>
            {gear.length > 0 && (
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1 pb-0.5">
                Seeds
              </p>
            )}
            {seeds.map((item) => {
              const species = getFlower(item.speciesId);
              if (!species) return null;
              const rarity   = RARITY_CONFIG[species.rarity];
              const mastered = isSpeciesMastered(state.discovered, item.speciesId);
              return (
                <button
                  key={item.speciesId}
                  onClick={() => onSelect(item.speciesId)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-primary/10 border border-transparent hover:border-primary/30 transition-all text-left"
                >
                  <span className="text-xl">{species.emoji.seed}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{species.name}</p>
                      {mastered && (
                        <span className="text-yellow-400 text-xs leading-none flex-shrink-0" title="Mastered — grows 20% faster">
                          ⚡
                        </span>
                      )}
                    </div>
                    <p className={`text-xs ${rarity.color}`}>{rarity.label}</p>
                    <FlowerTypeBadges types={species.types} className="mt-0.5" />
                  </div>
                  <span className="text-xs text-muted-foreground">×{item.quantity}</span>
                </button>
              );
            })}
          </>
        )}

        {/* ── Divider ───────────────────────────────────────────────────────── */}
        {seeds.length > 0 && gear.length > 0 && (
          <div className="border-t border-border my-1" />
        )}

        {/* ── Gear ─────────────────────────────────────────────────────────── */}
        {gear.length > 0 && (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1 pb-0.5">
              Gear
            </p>
            {gear.map((item) => {
              const def    = GEAR[item.gearType];
              const rarity = RARITY_CONFIG[def.rarity];
              return (
                <button
                  key={item.gearType}
                  onClick={() => onGearSelect(item.gearType)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-primary/10 border border-transparent hover:border-primary/30 transition-all text-left"
                >
                  <span className="text-xl relative">
                    {def.emoji}
                    {def.category === "sprinkler_mutation" && def.mutationType && (
                      <span className="absolute -bottom-0.5 -right-1 text-[10px] leading-none">
                        {MUTATIONS[def.mutationType].emoji}
                      </span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{def.name}</p>
                    <p className={`text-xs ${rarity.color}`}>{rarity.label}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">×{item.quantity}</span>
                </button>
              );
            })}
          </>
        )}

      </div>
    </div>
  );
}
