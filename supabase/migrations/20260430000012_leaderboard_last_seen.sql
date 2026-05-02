-- Add last_seen_at to the leaderboard view so the client can show
-- online / away / offline presence indicators next to each entry.

DROP VIEW IF EXISTS leaderboard;

CREATE VIEW leaderboard AS
SELECT
  u.id,
  u.username,
  u.display_flower,
  u.display_mutation,
  u.last_seen_at,
  gs.coins,
  gs.farm_size,
  COALESCE(jsonb_array_length(gs.discovered), 0) AS discovered_count,
  gs.updated_at,
  RANK() OVER (ORDER BY gs.coins DESC)::int AS rank
FROM users u
JOIN game_saves gs ON gs.user_id = u.id;
