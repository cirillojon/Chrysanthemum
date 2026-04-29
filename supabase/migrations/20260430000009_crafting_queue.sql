-- Phase 3: time-gated crafting queue
ALTER TABLE game_saves
  ADD COLUMN IF NOT EXISTS crafting_queue       JSONB    NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS crafting_slot_count  INTEGER  NOT NULL DEFAULT 1;
