-- Allow users to delete their own claimed mailbox entries.
-- Claimed = true guard prevents accidentally deleting unclaimed items
-- through a client-side bug.
CREATE POLICY "Users can delete own claimed mailbox entries"
  ON public.mailbox FOR DELETE
  USING (auth.uid() = user_id AND claimed = true);
