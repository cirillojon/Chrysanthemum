import type { FlowerType } from "./flowers";
import type { Rarity } from "./flowers";

// ── Types ──────────────────────────────────────────────────────────────────

export type EssenceType = FlowerType;

export interface EssenceItem {
  type: EssenceType;
  amount: number;
}

// ── Yield table ────────────────────────────────────────────────────────────

/**
 * How many essence units a single flower of each rarity produces when sacrificed.
 * Units are then distributed among the flower's type(s) via independent rolls.
 */
export const ESSENCE_YIELD: Record<Rarity, number> = {
  common:    1,
  uncommon:  2,
  rare:      4,
  legendary: 8,
  mythic:    16,
  exalted:   32,
  prismatic: 64,
};

// ── Yield calculation (deterministic even-split for UI preview) ────────────

/**
 * Returns the expected essence yield for a batch sacrifice.
 * Uses a deterministic even split across the flower's types so the UI preview
 * is stable.  The edge function uses the same even-split for simplicity/fairness
 * (no hidden randomness on essence distribution).
 *
 * @param types   - The flower's type list (1–N items)
 * @param rarity  - The flower's rarity tier
 * @param quantity - Number of flowers being sacrificed
 */
export function calculateEssenceYield(
  types: EssenceType[],
  rarity: Rarity,
  quantity: number,
): EssenceItem[] {
  if (types.length === 0 || quantity === 0) return [];

  const yieldPer = ESSENCE_YIELD[rarity];
  const total    = yieldPer * quantity;

  // Even-split: spread total units across types as evenly as possible.
  // Remainder units go to the first N types.
  const perType   = Math.floor(total / types.length);
  const remainder = total % types.length;

  return types
    .map((type, i) => ({ type, amount: perType + (i < remainder ? 1 : 0) }))
    .filter((e) => e.amount > 0);
}

/**
 * Merges a list of new essence yields into an existing essences array.
 * Used both client-side (optimistic) and in utility tests.
 */
export function mergeEssences(
  current: EssenceItem[],
  additions: EssenceItem[],
): EssenceItem[] {
  const map = new Map<EssenceType, number>(
    current.map((e) => [e.type, e.amount])
  );
  for (const { type, amount } of additions) {
    map.set(type, (map.get(type) ?? 0) + amount);
  }
  return Array.from(map.entries())
    .map(([type, amount]) => ({ type, amount }))
    .filter((e) => e.amount > 0);
}
