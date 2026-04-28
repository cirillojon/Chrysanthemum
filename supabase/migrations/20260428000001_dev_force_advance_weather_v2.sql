-- Replace dev_force_advance_weather with a self-contained version that
-- returns json (so errors surface instead of 400) and inlines the advance
-- logic rather than calling advance_weather() from inside a SECURITY DEFINER
-- context (nested SECURITY DEFINER calls can cause permission issues).

DROP FUNCTION IF EXISTS dev_force_advance_weather();

CREATE FUNCTION dev_force_advance_weather()
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
BEGIN
  SELECT * INTO v_row FROM weather WHERE id = 1 FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'no weather row with id=1');
  END IF;

  v_now_ms  := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_forecast := COALESCE(v_row.forecast, '[]'::jsonb);

  -- Pop the front of the queue
  IF jsonb_array_length(v_forecast) > 0 THEN
    v_next_type := v_forecast->0->>'type';
    v_forecast  := v_forecast - 0;
  ELSE
    v_next_type := 'clear';
  END IF;

  v_dur_ms := COALESCE((v_durations->>v_next_type)::bigint, 900000);

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
