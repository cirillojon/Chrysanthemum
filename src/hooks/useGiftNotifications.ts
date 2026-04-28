// Gifts now go through the mailbox table — this hook watches for new mailbox
// inserts from another user (i.e. gifts) so the toast notification still fires.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useGiftNotifications(userId: string | null) {
  const [newGift, setNewGift] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("gift-via-mailbox")
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "mailbox",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // Only show the "gift" toast for mail that came from another user,
          // not for system mail (marketplace proceeds, etc.)
          const row = payload.new as { from_user_id?: string | null };
          if (row.from_user_id) {
            setNewGift(true);
            setTimeout(() => setNewGift(false), 5_000);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // pendingCount is handled entirely by useMailbox now — this hook just
  // drives the toast notification for incoming gifts.
  return { pendingCount: 0, newGift, clearNewGift: () => setNewGift(false) };
}
