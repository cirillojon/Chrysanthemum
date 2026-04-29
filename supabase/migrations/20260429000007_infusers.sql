-- Add infusers column to game_saves.
-- Stores the player's inventory of Flower Infuser items by rarity.
-- Part of the passive Cropsticks cross-breeding system (v2.3.0).

ALTER TABLE game_saves
  ADD COLUMN IF NOT EXISTS infusers jsonb NOT NULL DEFAULT '[]'::jsonb;
