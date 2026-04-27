import { useMemo } from "react";
import { getCurrentStage, getStageProgress } from "../store/gameStore";
import type { Plot } from "../store/gameStore";
import { getFlower, RARITY_CONFIG, MUTATIONS } from "../data/flowers";
import type { MutationType } from "../data/flowers";
import { FERTILIZERS } from "../data/upgrades";
import { GEAR, isGearExpired, getAffectedCells } from "../data/gear";

interface Props {
  grid:      Plot[][];
  farmSize:  number;
  farmRows?: number;
}

export function ReadOnlyGarden({ grid, farmSize, farmRows }: Props) {
  const now  = Date.now();
  const rows = farmRows ?? farmSize;

  // Compute gear coverage sets in one pass
  const { sprinklerKeys, scarecrowKeys, composterKeys } = useMemo(() => {
    const sprinkler = new Set<string>();
    const scarecrow = new Set<string>();
    const composter = new Set<string>();
    for (let ri = 0; ri < grid.length; ri++) {
      for (let ci = 0; ci < grid[ri].length; ci++) {
        const g = grid[ri][ci].gear;
        if (!g || isGearExpired(g, now)) continue;
        const def      = GEAR[g.gearType];
        const affected = getAffectedCells(g.gearType, ri, ci, rows, farmSize);
        const keys     = affected.map(([r, c]) => `${r}-${c}`);
        if (def.category === "sprinkler_regular" || def.category === "sprinkler_mutation") {
          keys.forEach((k) => sprinkler.add(k));
        } else if (def.passiveSubtype === "scarecrow") {
          keys.forEach((k) => scarecrow.add(k));
        } else if (def.passiveSubtype === "composter") {
          keys.forEach((k) => composter.add(k));
        }
      }
    }
    return { sprinklerKeys: sprinkler, scarecrowKeys: scarecrow, composterKeys: composter };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, farmSize, rows]);

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs font-mono text-muted-foreground tracking-wide uppercase">
        {rows}×{farmSize} Garden
      </p>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${farmSize}, minmax(0, 1fr))` }}
      >
        {grid.flat().map((plot, i) => {
          const ri = Math.floor(i / farmSize);
          const ci = i % farmSize;
          const cellKey = `${ri}-${ci}`;

          const plant   = plot.plant;
          const gear    = plot.gear;

          // ── Gear cell ──────────────────────────────────────────────────────
          if (gear) {
            const def         = GEAR[gear.gearType];
            const gearRarity  = RARITY_CONFIG[def.rarity];
            const expired     = isGearExpired(gear, now);
            const storedCount = gear.storedFertilizers?.length ?? 0;
            const expiryProg  = def.durationMs
              ? Math.max(0, (gear.placedAt + def.durationMs - now) / def.durationMs)
              : null;

            return (
              <div
                key={plot.id}
                className={`
                  relative w-14 h-14 rounded-xl border-2 flex flex-col items-center justify-center
                  ${gearRarity.borderBloom} ${gearRarity.bgBloom} ${gearRarity.glow}
                  ${expired ? "opacity-50" : ""}
                `}
                title={`${def.name} — ${def.rarity}`}
              >
                <span className="text-xl leading-none">{def.emoji}</span>

                {/* Mutation sprinkler overlay */}
                {def.category === "sprinkler_mutation" && def.mutationType && (
                  <span className="absolute -bottom-0.5 -right-1 text-xs leading-none">
                    {MUTATIONS[def.mutationType].emoji}
                  </span>
                )}

                {/* Expiry bar */}
                {expiryProg !== null && !expired && (
                  <div className="absolute bottom-1 left-2 right-2 h-0.5 bg-border rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${gearRarity.color.replace("text-", "bg-")}`}
                      style={{ width: `${expiryProg * 100}%` }}
                    />
                  </div>
                )}

                {/* Composter stored count */}
                {def.passiveSubtype === "composter" && storedCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 text-[9px] font-mono font-bold text-primary leading-none">
                    {storedCount}
                  </span>
                )}
              </div>
            );
          }

          // ── Empty cell ─────────────────────────────────────────────────────
          if (!plant) {
            return (
              <div
                key={plot.id}
                className="w-14 h-14 rounded-xl border-2 border-border bg-card/40 flex items-center justify-center"
              >
                <span className="text-xl opacity-20">·</span>
              </div>
            );
          }

          // ── Plant cell ─────────────────────────────────────────────────────
          const species   = getFlower(plant.speciesId);
          const stage     = getCurrentStage(plant, now);
          const progress  = getStageProgress(plant, now);
          const rarity    = species ? RARITY_CONFIG[species.rarity] : null;
          const isBloomed = stage === "bloom";
          const mut       = (isBloomed && plant.mutation)
            ? MUTATIONS[plant.mutation as MutationType]
            : null;
          const hasFert   = !!plant.fertilizer;

          const underSprinkler = sprinklerKeys.has(cellKey);
          const underScarecrow = scarecrowKeys.has(cellKey);
          const underComposter = composterKeys.has(cellKey);

          return (
            <div
              key={plot.id}
              className={`
                relative w-14 h-14 rounded-xl border-2 flex flex-col items-center justify-center
                ${isBloomed
                  ? `${rarity?.borderBloom ?? "border-primary/50"} ${rarity?.bgBloom ?? "bg-primary/10"} ${rarity?.glow ?? ""}`
                  : `${rarity?.borderGrowing ?? "border-border/60"} bg-card/60`
                }
              `}
              title={`${species?.name} — ${stage}`}
            >
              <span className="text-xl leading-none">
                {species?.emoji[stage!] ?? "🌱"}
              </span>

              {/* Fertilizer — top-left */}
              {hasFert && !isBloomed && (
                <span className="absolute top-0.5 left-0.5 text-[9px] leading-none">
                  {FERTILIZERS[plant.fertilizer!].emoji}
                </span>
              )}

              {/* Mastery — top-right */}
              {!isBloomed && plant.masteredBonus && (
                <span className="absolute top-0.5 right-0.5 text-[9px] leading-none text-yellow-400" title="Mastered">
                  ⚡
                </span>
              )}

              {/* Gear effect indicators — bottom-left */}
              {!isBloomed && (underSprinkler || underScarecrow || underComposter) && (
                <div className="absolute bottom-2 left-0.5 flex leading-none">
                  {underSprinkler && <span className="text-[9px]" title="Under sprinkler">💧</span>}
                  {underScarecrow && <span className="text-[9px]" title="Under scarecrow">🧹</span>}
                  {underComposter && <span className="text-[9px]" title="Near composter">🧺</span>}
                </div>
              )}

              {/* Progress bar */}
              {!isBloomed && (
                <div className="absolute bottom-1 left-2 right-2 h-0.5 bg-border rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${hasFert ? "bg-green-400" : "bg-primary"}`}
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              )}

              {/* Bloom pulse */}
              {isBloomed && (
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full animate-pulse" />
              )}

              {/* Mutation emoji */}
              {mut && (
                <span className="absolute -bottom-1 -right-1 text-sm leading-none">
                  {mut.emoji}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
