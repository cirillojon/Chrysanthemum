-- plant_timings: server-authoritative planting timestamps.
--
-- game_saves.grid is writable by clients (needed for offline-tick sync via saveToCloud),
-- which means timePlanted inside the grid JSON can be manipulated via direct REST PATCH.
-- This table stores the real plant time, set only by the plant-seed edge function
-- (service role). The harvest edge function validates bloom time against planted_at
-- here instead of trusting timePlanted from the grid.
--
-- Closes: [CVE Score 10.0] exploit - injected console js to manipulate timePlanted (#126)

CREATE TABLE IF NOT EXISTS plant_timings (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  row        int         NOT NULL,
  col        int         NOT NULL,
  planted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, row, col)
);

ALTER TABLE plant_timings ENABLE ROW LEVEL SECURITY;

-- Users can read their own timings (clients may use this for UI display)
CREATE POLICY "Users can read own plant timings"
  ON plant_timings FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT / UPDATE / DELETE policy for authenticated role.
-- Only the service role used by edge functions can write to this table.
