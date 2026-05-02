-- Fix time-of-day gating for advance_weather and dev_force_advance_weather.
--
-- Two bugs in the previous version:
--   1. advance_weather(p_utc_hour int DEFAULT 12) accepted an ET hour param but
--      the GitHub Actions cron never passed it, so the default of 12 was always
--      used — meaning golden_hour and star_shower were permanently ineligible.
--   2. Both functions compared raw UTC hours as if they were Eastern Time,
--      so the dawn/sunset/dusk windows were off by 4-5 hours.
--
-- Fix: both functions now extract the current ET hour directly using
-- AT TIME ZONE 'America/New_York' (handles EST/EDT automatically).
--
-- Correct ET hour bands (mirrors src/data/dayNight.ts):
--   golden_hour    → dawn (5-6), sunset (17-18), dusk (19-20)
--   prismatic_skies→ morning (7-10), midday (11-13), afternoon (14-16)
--   star_shower    → midnight (0-4), night (21-23)

-- ── advance_weather ───────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS advance_weather(int);

CREATE OR REPLACE FUNCTION advance_weather()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row            RECORD;
  v_forecast       jsonb;
  v_next_type      text;
  v_next_dur_ms    bigint;
  v_now_ms         bigint;
  v_et_hour        int;

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

  v_weights        jsonb := '{
    "clear":          60,
    "rain":           20,
    "golden_hour":    10,
    "prismatic_skies": 3,
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
  v_now_ms  := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_et_hour := extract(hour FROM clock_timestamp() AT TIME ZONE 'America/New_York')::int;

  IF v_row.ends_at > v_now_ms THEN
    RETURN;
  END IF;

  v_forecast := COALESCE(v_row.forecast, '[]'::jsonb);

  IF jsonb_array_length(v_forecast) > 0 THEN
    v_next_type := v_forecast->0->>'type';
    v_forecast  := v_forecast - 0;
  ELSE
    v_next_type := 'clear';
  END IF;

  v_next_dur_ms := COALESCE((v_durations->>v_next_type)::bigint, 900000);

  FOREACH v_wtype IN ARRAY ARRAY[
    'clear','rain','golden_hour','prismatic_skies',
    'star_shower','cold_front','heatwave','thunderstorm','tornado'
  ]
  LOOP
    v_allowed := true;

    IF v_wtype = 'golden_hour' THEN
      -- dawn (5-6 ET), sunset (17-18 ET), dusk (19-20 ET)
      v_allowed := v_et_hour IN (5,6,17,18,19,20);

    ELSIF v_wtype = 'prismatic_skies' THEN
      -- morning (7-10 ET), midday (11-13 ET), afternoon (14-16 ET)
      v_allowed := v_et_hour BETWEEN 7 AND 16;

    ELSIF v_wtype = 'star_shower' THEN
      -- midnight (0-4 ET), night (21-23 ET)
      v_allowed := v_et_hour BETWEEN 0 AND 4 OR v_et_hour BETWEEN 21 AND 23;
    END IF;

    IF v_allowed THEN
      v_eligible_types    := array_append(v_eligible_types,    v_wtype);
      v_eligible_weights  := array_append(v_eligible_weights,  (v_weights->>v_wtype)::numeric);
      v_total_weight      := v_total_weight + (v_weights->>v_wtype)::numeric;
    END IF;
  END LOOP;

  v_roll      := random() * v_total_weight;
  v_new_entry := '{"type":"clear"}'::jsonb;

  FOR i IN 1 .. array_length(v_eligible_types, 1)
  LOOP
    v_roll := v_roll - v_eligible_weights[i];
    IF v_roll <= 0 THEN
      v_new_entry := jsonb_build_object('type', v_eligible_types[i]);
      EXIT;
    END IF;
  END LOOP;

  v_forecast := v_forecast || jsonb_build_array(v_new_entry);

  UPDATE weather
  SET
    type       = v_next_type,
    started_at = v_now_ms,
    ends_at    = v_now_ms + v_next_dur_ms,
    forecast   = v_forecast
  WHERE id = 1;

END;
$$;

GRANT EXECUTE ON FUNCTION advance_weather() TO anon, authenticated;

-- ── dev_force_advance_weather ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION dev_force_advance_weather()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row         RECORD;
  v_forecast    jsonb;
  v_next_type   text;
  v_dur_ms      bigint;
  v_now_ms      bigint;
  v_et_hour     int;

  v_durations   jsonb := '{
    "clear":           900000,
    "rain":           1200000,
    "golden_hour":     900000,
    "prismatic_skies": 900000,
    "star_shower":    1050000,
    "cold_front":      900000,
    "heatwave":        900000,
    "thunderstorm":   1200000,
    "tornado":         600000
  }'::jsonb;

  v_weights     jsonb := '{
    "clear":          60,
    "rain":           20,
    "golden_hour":    10,
    "prismatic_skies": 3,
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

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'no weather row with id=1');
  END IF;

  v_now_ms  := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_et_hour := extract(hour FROM clock_timestamp() AT TIME ZONE 'America/New_York')::int;
  v_forecast := COALESCE(v_row.forecast, '[]'::jsonb);

  IF jsonb_array_length(v_forecast) > 0 THEN
    v_next_type := v_forecast->0->>'type';
    v_forecast  := v_forecast - 0;
  ELSE
    v_next_type := 'clear';
  END IF;

  v_dur_ms := COALESCE((v_durations->>v_next_type)::bigint, 900000);

  FOREACH v_wtype IN ARRAY ARRAY[
    'clear','rain','golden_hour','prismatic_skies',
    'star_shower','cold_front','heatwave','thunderstorm','tornado'
  ]
  LOOP
    v_allowed := true;

    IF v_wtype = 'golden_hour' THEN
      -- dawn (5-6 ET), sunset (17-18 ET), dusk (19-20 ET)
      v_allowed := v_et_hour IN (5,6,17,18,19,20);

    ELSIF v_wtype = 'prismatic_skies' THEN
      -- morning (7-10 ET), midday (11-13 ET), afternoon (14-16 ET)
      v_allowed := v_et_hour BETWEEN 7 AND 16;

    ELSIF v_wtype = 'star_shower' THEN
      -- midnight (0-4 ET), night (21-23 ET)
      v_allowed := v_et_hour BETWEEN 0 AND 4 OR v_et_hour BETWEEN 21 AND 23;
    END IF;

    IF v_allowed THEN
      v_eligible_types   := array_append(v_eligible_types,   v_wtype);
      v_eligible_weights := array_append(v_eligible_weights, (v_weights->>v_wtype)::numeric);
      v_total_weight     := v_total_weight + (v_weights->>v_wtype)::numeric;
    END IF;
  END LOOP;

  v_roll      := random() * v_total_weight;
  v_new_entry := '{"type":"clear"}'::jsonb;

  FOR i IN 1 .. array_length(v_eligible_types, 1)
  LOOP
    v_roll := v_roll - v_eligible_weights[i];
    IF v_roll <= 0 THEN
      v_new_entry := jsonb_build_object('type', v_eligible_types[i]);
      EXIT;
    END IF;
  END LOOP;

  v_forecast := v_forecast || jsonb_build_array(v_new_entry);

  UPDATE weather
  SET type       = v_next_type,
      started_at = v_now_ms,
      ends_at    = v_now_ms + v_dur_ms,
      forecast   = v_forecast
  WHERE id = 1;

  RETURN json_build_object('ok', true, 'type', v_next_type);

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION dev_force_advance_weather() TO anon, authenticated;
