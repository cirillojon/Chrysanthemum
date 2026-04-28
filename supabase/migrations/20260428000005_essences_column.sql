-- Add essences column to game_saves for the Alchemy system (v2.3.0 #117)
ALTER TABLE game_saves
  ADD COLUMN IF NOT EXISTS essences jsonb NOT NULL DEFAULT '[]'::jsonb;
