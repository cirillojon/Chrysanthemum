-- Phase 5a: active speed-boost consumables (Verdant Rush, Forge Haste, Resonance Draft).
-- Each row is { type: "growth" | "craft" | "attunement", expiresAt: ISO string, consumableId: string }.
ALTER TABLE game_saves
  ADD COLUMN IF NOT EXISTS active_boosts JSONB NOT NULL DEFAULT '[]';
