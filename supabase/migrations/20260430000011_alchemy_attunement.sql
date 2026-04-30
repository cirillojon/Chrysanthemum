-- v2.3: Alchemy Attunement queue + slots
--
-- Time-gated alchemy attunement (the Alchemy → Attune view, which mutates a
-- bloomed flower with essence). Players start with 0 slots and buy up to 4
-- via the upgrade edge function. Each queue entry tracks the source flower,
-- the rolled mutation outcome, and the start/duration so completion can be
-- validated server-side.
ALTER TABLE game_saves
  ADD COLUMN IF NOT EXISTS attunement_slots INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attunement_queue JSONB   NOT NULL DEFAULT '[]';
