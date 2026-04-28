-- Dev-only helper: immediately expires the current weather and advances to the
-- next entry in the forecast queue.  Safe to run at any time; the underlying
-- advance_weather() call handles re-rolling the queue tail.

CREATE OR REPLACE FUNCTION dev_force_advance_weather()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Expire the current event so advance_weather()'s idempotency guard won't skip it
  UPDATE weather SET ends_at = 0 WHERE id = 1;
  PERFORM advance_weather();
END;
$$;

GRANT EXECUTE ON FUNCTION dev_force_advance_weather() TO anon, authenticated;
