-- Mailbox: stores marketplace sale proceeds and purchased items
-- so they're delivered asynchronously instead of directly updating saves.

CREATE TABLE IF NOT EXISTS mailbox (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL,
  kind       text        NOT NULL CHECK (kind IN ('coins', 'flower', 'seed', 'fertilizer', 'gear')),
  species_id text,                          -- for flower/seed/fertilizer/gear items
  mutation   text,
  is_seed    boolean     NOT NULL DEFAULT false,
  amount     integer,                       -- coins amount (kind = 'coins')
  message    text        NOT NULL DEFAULT '',
  claimed    boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fast unclaimed lookup
CREATE INDEX IF NOT EXISTS mailbox_user_unclaimed_idx
  ON mailbox(user_id, created_at DESC)
  WHERE NOT claimed;

-- RLS: users can only read their own mail
ALTER TABLE mailbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own mailbox"
  ON mailbox FOR SELECT
  USING (auth.uid() = user_id);

-- Realtime: allow clients to subscribe to their own mailbox
ALTER PUBLICATION supabase_realtime ADD TABLE mailbox;
