-- Fix advance_weather to consume the forecast queue instead of regenerating it.
--
-- Previous behaviour: every call regenerated ALL forecast entries from scratch,
-- making the forecast panel inaccurate (what was shown as "coming up next" was
-- thrown away and replaced with fresh random rolls).
--
-- New behaviour:
--   1. Pop forecast[0] as the next active weather type.
--   2. Keep forecast[1..N] unchanged (those were pre-generated earlier).
--   3. Append ONE newly-rolled entry to the END of the array to refill the queue.
--
-- This ensures the forecast panel is accurate: what it shows as "next" is
-- exactly what will become active on the next advance call.

CREATE OR REPLACE FUNCTION advance_weather(p_utc_hour int DEFAULT 12)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER                -- runs as function owner, bypasses RLS/table grants
SET search_path = public
AS $$
DECLARE
  v_row            RECORD;
  v_forecast       jsonb;
  v_next_type      text;
  v_next_dur_ms    bigint;
  v_now_ms         bigint;

  -- Duration table (ms) — must stay in sync with src/data/weather.ts
  v_durations      jsonb := '{
    "clear":          900000,
    "rain":          1200000,
    "golden_hour":    900000,
    "prismatic_skies":900000,
    "star_shower":   1050000,
    "cold_front":     900000,
    "heatwave":       900000,
    "thunderstorm":  1200000,
    "tornado":        600000
  }'::jsonb;

  -- Base selection weights — must stay in sync with src/data/weather.ts
  v_weights        jsonb := '{
    "clear":          60,
    "rain":           20,
    "golden_hour":    10,
    "prismatic_skies":10,
    "star_shower":    10,
    "cold_front":     10,
    "heatwave":       10,
    "thunderstorm":    8,
    "tornado":         4
  }'::jsonb;

  v_eligible_types   text[]    := '{}';
  v_eligible_weights numeric[] := '{}';
  v_total_weight     numeric   := 0;
  v_roll             numeric;
  v_wtype            text;
  v_allowed          boolean;
  v_new_entry        jsonb;
  i                  int;

BEGIN
  SELECT * INTO v_row FROM weather WHERE id = 1 FOR UPDATE;
  v_now_ms := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;

  -- ── Idempotency guard ─────────────────────────────────────────────────────
  -- If the current weather hasn't expired yet, do nothing.
  -- This prevents multiple concurrent clients from double-advancing
  -- when they all call advance_weather at the same time.
  IF v_row.ends_at > v_now_ms THEN
    RETURN;
  END IF;

  -- ── Step 1: pop the front of the forecast queue ───────────────────────────
  v_forecast := COALESCE(v_row.forecast, '[]'::jsonb);

  IF jsonb_array_length(v_forecast) > 0 THEN
    v_next_type := v_forecast->0->>'type';
    v_forecast  := v_forecast - 0;   -- remove element at index 0
  ELSE
    v_next_type := 'clear';
  END IF;

  -- ── Step 2: look up duration ──────────────────────────────────────────────
  v_next_dur_ms := COALESCE((v_durations->>v_next_type)::bigint, 900000);

  -- ── Step 3: roll a new entry to append to the END of the queue ───────────
  -- Apply the same time-of-day gating as the TypeScript rollNextWeather().
  -- ET hour bands (mirrors getCurrentPeriod in src/data/dayNight.ts):
  --   midnight  0-4   star_shower only
  --   night     5-6   star_shower only
  --   dawn      7-8   golden_hour
  --   morning   9-11  prismatic_skies
  --   midday    12-14 prismatic_skies
  --   afternoon 15-17 prismatic_skies
  --   sunset    18-19 golden_hour
  --   dusk      20-23 golden_hour

  FOREACH v_wtype IN ARRAY ARRAY[
    'clear','rain','golden_hour','prismatic_skies',
    'star_shower','cold_front','heatwave','thunderstorm','tornado'
  ]
  LOOP
    v_allowed := true;

    IF v_wtype = 'golden_hour' THEN
      -- dawn (7-8), sunset (18-19), dusk (20-23)
      v_allowed := p_utc_hour IN (7,8,18,19,20,21,22,23);

    ELSIF v_wtype = 'prismatic_skies' THEN
      -- morning (9-11), midday (12-14), afternoon (15-17)
      v_allowed := p_utc_hour BETWEEN 9 AND 17;

    ELSIF v_wtype = 'star_shower' THEN
      -- midnight (0-4), night (5-6)
      v_allowed := p_utc_hour BETWEEN 0 AND 6;
    END IF;

    IF v_allowed THEN
      v_eligible_types    := array_append(v_eligible_types,    v_wtype);
      v_eligible_weights  := array_append(v_eligible_weights,  (v_weights->>v_wtype)::numeric);
      v_total_weight      := v_total_weight + (v_weights->>v_wtype)::numeric;
    END IF;
  END LOOP;

  -- Weighted random pick
  v_roll      := random() * v_total_weight;
  v_new_entry := '{"type":"clear"}'::jsonb;  -- safe default

  FOR i IN 1 .. array_length(v_eligible_types, 1)
  LOOP
    v_roll := v_roll - v_eligible_weights[i];
    IF v_roll <= 0 THEN
      v_new_entry := jsonb_build_object('type', v_eligible_types[i]);
      EXIT;
    END IF;
  END LOOP;

  -- Append the new entry at the end
  v_forecast := v_forecast || jsonb_build_array(v_new_entry);

  -- ── Step 4: update the row ────────────────────────────────────────────────
  UPDATE weather
  SET
    type       = v_next_type,
    started_at = v_now_ms,
    ends_at    = v_now_ms + v_next_dur_ms,
    forecast   = v_forecast
  WHERE id = 1;

END;
$$;

-- Allow authenticated and anonymous callers to invoke this function.
-- The SECURITY DEFINER above means the UPDATE runs as the function owner,
-- so callers only need EXECUTE — no direct table grants required.
GRANT EXECUTE ON FUNCTION advance_weather(int) TO anon, authenticated;
