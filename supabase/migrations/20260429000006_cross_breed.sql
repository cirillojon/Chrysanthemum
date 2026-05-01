-- Cross-breeding: tracks which recipes a player has discovered.
-- Stored as a JSON array of recipe ID strings (e.g. ["blaze+frost", "lunar+solar"]).

ALTER TABLE game_saves
  ADD COLUMN IF NOT EXISTS discovered_recipes jsonb NOT NULL DEFAULT '[]'::jsonb;
