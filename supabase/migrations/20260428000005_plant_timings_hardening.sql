-- plant_timings hardening: bind each timing row to a species_id so a stale
-- timing row from a previously removed plant cannot be used to validate a
-- different species in the same plot. Also tightens row/col types.
--
-- The previous migration (20260428000004_plant_timings.sql) shipped with a
-- legacy fallback in the harvest edge function: when no plant_timings row
-- existed for a plot, it trusted the client-writable timePlanted from the
-- grid JSON. Plants that predate the migration therefore remained fully
-- exploitable. This migration is paired with edge-function changes that
-- remove that fallback entirely.

ALTER TABLE plant_timings
  ADD COLUMN IF NOT EXISTS species_id text;

-- Backfill species_id from the current grid for any timing rows that are
-- already present. Plants without a matching grid entry are deleted (they
-- are stale from a removed plant).
UPDATE plant_timings pt
SET    species_id = (
         SELECT (gs.grid -> pt.row -> pt.col -> 'plant' ->> 'speciesId')
         FROM   game_saves gs
         WHERE  gs.user_id = pt.user_id
       )
WHERE  pt.species_id IS NULL;

DELETE FROM plant_timings WHERE species_id IS NULL;

ALTER TABLE plant_timings
  ALTER COLUMN species_id SET NOT NULL;

-- Sanity bounds: gardens are small grids, and an attacker calling plant-seed
-- with extreme indices should not be able to bloat this table.
ALTER TABLE plant_timings
  ADD CONSTRAINT plant_timings_row_bounds CHECK (row >= 0 AND row < 64),
  ADD CONSTRAINT plant_timings_col_bounds CHECK (col >= 0 AND col < 64);
