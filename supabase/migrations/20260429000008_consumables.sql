-- Add consumables inventory and usage-cooldown columns to game_saves.
-- consumables  : crafted consumable items (Bloom Burst, vials, Eclipse Tonic, etc.)
-- last_eclipse_tonic   : ISO date "YYYY-MM-DD" — enforces once-per-day limit
-- last_wind_shear_used : Unix ms timestamp — enforces 1-hour cooldown

ALTER TABLE game_saves
  ADD COLUMN IF NOT EXISTS consumables          JSONB    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_eclipse_tonic   TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_wind_shear_used BIGINT   DEFAULT NULL;
