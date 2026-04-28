import { useMemo, useState, useEffect } from "react";
import { useSettings } from "../store/SettingsContext";
import { getCurrentStage, getStageProgress, getPassiveGrowthMultiplier } from "../store/gameStore";
import type { Plot } from "../store/gameStore";
import { getFlower, RARITY_CONFIG, MUTATIONS } from "../data/flowers";
import type { MutationType } from "../data/flowers";
import { FERTILIZERS } from "../data/upgrades";
import { GEAR, isGearExpired, getAffectedCells } from "../data/gear";
import type { FanDirection } from "../data/gear";
import type React from "react";

interface Props {
  grid:      Plot[][];
  farmSize:  number;
  farmRows?: number;
}

export function ReadOnlyGarden({ grid, farmSize, farmRows }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const rows = farmRows ?? farmSize;
  const { settings } = useSettings();

  // Tick every second so progress bars and stage transitions animate in real-time
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // Compute gear coverage in one pass
  const { regularSprinklerKeys, mutationSprinklerMap, scarecrowKeys, composterKeys, growLampKeys, fanCoveredCells, harvestBellKeys, autoPlanterKeys } = useMemo(() => {
    const regular      = new Set<string>();
    const mutation     = new Map<string, string[]>();
    const scarecrow    = new Set<string>();
    const composter    = new Set<string>();
    const growLamp     = new Set<string>();
    const fan          = new Map<string, FanDirection>();
    const harvestBell  = new Set<string>();
    const autoPlanter  = new Set<string>();
    for (let ri = 0; ri < grid.length; ri++) {
      for (let ci = 0; ci < grid[ri].length; ci++) {
        const g = grid[ri][ci].gear;
        if (!g || isGearExpired(g, now)) continue;
        const def      = GEAR[g.gearType];
        const affected = getAffectedCells(g.gearType, ri, ci, rows, farmSize, g.direction);
        const keys     = affected.map(([r, c]) => `${r}-${c}`);
        if (def.category === "sprinkler_regular") {
          keys.forEach((k) => regular.add(k));
        } else if (def.category === "sprinkler_mutation" && def.mutationType) {
          const emoji = MUTATIONS[def.mutationType as MutationType]?.emoji ?? "✨";
          keys.forEach((k) => {
            const existing = mutation.get(k);
            if (!existing) mutation.set(k, [emoji]);
            else if (!existing.includes(emoji)) existing.push(emoji);
          });
        } else if (def.passiveSubtype === "scarecrow") {
          keys.forEach((k) => scarecrow.add(k));
        } else if (def.passiveSubtype === "composter") {
          keys.forEach((k) => composter.add(k));
        } else if (def.passiveSubtype === "grow_lamp") {
          keys.forEach((k) => growLamp.add(k));
        } else if (def.passiveSubtype === "fan") {
          const dir = g.direction ?? "right";
          keys.forEach((k) => fan.set(k, dir));
        } else if (def.passiveSubtype === "harvest_bell") {
          keys.forEach((k) => harvestBell.add(k));
        } else if (def.passiveSubtype === "auto_planter") {
          keys.forEach((k) => autoPlanter.add(k));
        }
      }
    }
    return { regularSprinklerKeys: regular, mutationSprinklerMap: mutation, scarecrowKeys: scarecrow, composterKeys: composter, growLampKeys: growLamp, fanCoveredCells: fan, harvestBellKeys: harvestBell, autoPlanterKeys: autoPlanter };
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

            // Prismatic uses "rainbow-text" which doesn't follow text-* — map to gradient fill
            const gearBarBg = gearRarity.color === "rainbow-text"
              ? "bg-gradient-to-r from-pink-400 via-violet-400 to-sky-400"
              : gearRarity.color.replace("text-", "bg-");

            // Prismatic gear: drive all three rainbow animations via inline style so CSS
            // cascade order doesn't clobber them (inline style wins over class-based animation).
            const prismaticStyle: React.CSSProperties | undefined = def.rarity === "prismatic"
              ? { animation: "rainbow-border-cycle 3s linear infinite, rainbow-bg-cycle 3s linear infinite, rainbow-glow-cycle 3s linear infinite" }
              : undefined;

            return (
              <div
                key={plot.id}
                style={prismaticStyle}
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
                      className={`h-full rounded-full ${gearBarBg}`}
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
          const species     = getFlower(plant.speciesId);
          const gearMult    = getPassiveGrowthMultiplier(grid, ri, ci, now);
          const stage       = getCurrentStage(plant, now, "clear", gearMult);
          const progress    = getStageProgress(plant, now, "clear", gearMult);
          const rarity    = species ? RARITY_CONFIG[species.rarity] : null;
          const isBloomed = stage === "bloom";
          const mut       = (isBloomed && plant.mutation)
            ? MUTATIONS[plant.mutation as MutationType]
            : null;
          const hasFert   = !!plant.fertilizer;

          const underSprinkler   = regularSprinklerKeys.has(cellKey);
          const mutEmojis        = mutationSprinklerMap.get(cellKey) ?? [];
          const underScarecrow   = scarecrowKeys.has(cellKey);
          const underComposter   = composterKeys.has(cellKey);
          const underGrowLamp    = growLampKeys.has(cellKey);
          const underFan         = fanCoveredCells.has(cellKey);
          const fanDirection     = fanCoveredCells.get(cellKey);
          const underHarvestBell = harvestBellKeys.has(cellKey);
          const underAutoPlanter = autoPlanterKeys.has(cellKey);

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
              {/* ── Gear ambient animation overlay (clipped to cell) ── */}
              {settings.plotAnimations && (underSprinkler || mutEmojis.length > 0 || underGrowLamp || underScarecrow || underComposter || underAutoPlanter || underHarvestBell || underFan) && (
                <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                  {underGrowLamp && <div className="absolute inset-0 gear-lamp-glow" />}
                  {underSprinkler && (
                    <>
                      <span className="gear-drop" style={{ left: "15%", animationDelay: "0s"   }}>💧</span>
                      <span className="gear-drop" style={{ left: "48%", animationDelay: "0.6s" }}>💧</span>
                      <span className="gear-drop" style={{ left: "74%", animationDelay: "1.2s" }}>💧</span>
                    </>
                  )}
                  {mutEmojis.flatMap((emoji, mi) => [
                    <span key={`m${mi}a`} className="gear-float" style={{ left: `${16 + mi * 28}%`, animationDelay: `${mi * 0.5}s`       }}>{emoji}</span>,
                    <span key={`m${mi}b`} className="gear-float" style={{ left: `${40 + mi * 28}%`, animationDelay: `${mi * 0.5 + 1.1}s` }}>{emoji}</span>,
                  ])}
                  {underScarecrow && (
                    <>
                      <span className="gear-bird" style={{ left: "10%", animationDelay: "0s"   }}>🐦</span>
                      <span className="gear-bird" style={{ left: "52%", animationDelay: "1.5s" }}>🐦</span>
                    </>
                  )}
                  {underComposter && (
                    <>
                      <span className="gear-compost-spark" style={{ left: "18%", animationDelay: "0s"    }}>✦</span>
                      <span className="gear-compost-spark" style={{ left: "50%", animationDelay: "0.75s" }}>✦</span>
                      <span className="gear-compost-spark" style={{ left: "76%", animationDelay: "1.5s"  }}>✦</span>
                    </>
                  )}
                  {underFan && (() => {
                    const dir   = fanDirection ?? "right";
                    const cls   = `gear-wind-${dir}`;
                    const horiz = dir === "left" || dir === "right";
                    const axis  = horiz ? "top" : "left";
                    return (["18%", "50%", "76%"] as const).map((pos, fi) => (
                      <span key={fi} className={cls} style={{ [axis]: pos, animationDelay: `${fi * 0.65}s` }}>💨</span>
                    ));
                  })()}
                  {underAutoPlanter && (
                    <>
                      <span className="gear-planter-seed" style={{ left: "20%", animationDelay: "0s"   }}>🌱</span>
                      <span className="gear-planter-seed" style={{ left: "52%", animationDelay: "0.8s" }}>🌱</span>
                      <span className="gear-planter-seed" style={{ left: "76%", animationDelay: "1.6s" }}>🌱</span>
                    </>
                  )}
                  {underHarvestBell && (
                    <>
                      <span className="gear-bell" style={{ left: "18%", animationDelay: "0s"   }}>🔔</span>
                      <span className="gear-bell" style={{ left: "52%", animationDelay: "1.1s" }}>🔔</span>
                      <span className="gear-bell" style={{ left: "74%", animationDelay: "2.2s" }}>🔔</span>
                    </>
                  )}
                </div>
              )}

              <span className="text-xl leading-none">
                {species?.emoji[stage!] ?? "🌱"}
              </span>

              {/* Fertilizer — top-left */}
              {settings.plotFertilizerIndicator && hasFert && !isBloomed && (
                <span className="absolute top-0.5 left-0.5 text-[9px] leading-none">
                  {FERTILIZERS[plant.fertilizer!].emoji}
                </span>
              )}

              {/* Mastery — top-right */}
              {settings.plotMasteryIndicator && plant.masteredBonus && (
                <span className="absolute top-0.5 right-0.5 text-[9px] leading-none text-yellow-400" title="Mastered">
                  ⚡
                </span>
              )}

              {/* Gear effect indicators — bottom-left */}
              {settings.plotGearIndicator && (underSprinkler || mutEmojis.length > 0 || underScarecrow || underComposter || underGrowLamp || underFan || underHarvestBell || underAutoPlanter) && (
                <div className={`absolute left-0.5 flex leading-none ${isBloomed ? "bottom-1" : "bottom-2"}`}>
                  {underSprinkler && <span className="text-[9px]" title="Under sprinkler">💧</span>}
                  {mutEmojis.map((emoji, i) => (
                    <span key={i} className="text-[9px]" title="Mutation sprinkler">{emoji}</span>
                  ))}
                  {underScarecrow && <span className="text-[9px]" title="Under scarecrow">🧹</span>}
                  {underComposter && <span className="text-[9px]" title="Near composter">🧺</span>}
                  {underGrowLamp && <span className="text-[9px]" title="Under grow lamp">💡</span>}
                  {underFan && <span className="text-[9px]" title="In fan range">💨</span>}
                  {underHarvestBell && <span className="text-[9px]" title="Auto-harvest active">🔔</span>}
                  {underAutoPlanter && <span className="text-[9px]" title="Auto-planter active">🌱</span>}
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
              {settings.plotMutationIndicator && mut && (
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
