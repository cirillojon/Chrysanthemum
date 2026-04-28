import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getUnclaimedMailCount } from "../store/cloudSave";

export function useMailbox(userId: string | null) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    // Initial count
    getUnclaimedMailCount(userId).then(setUnreadCount);

    const channel = supabase
      .channel("mailbox-changes")
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "mailbox",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          setUnreadCount((c) => c + 1);
        }
      )
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "mailbox",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Re-fetch on any update (e.g. a claim from another device)
          getUnclaimedMailCount(userId).then(setUnreadCount);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return {
    unreadCount,
    /** Call after successfully claiming a mail item to decrement locally. */
    decrementUnread: () => setUnreadCount((c) => Math.max(0, c - 1)),
    /** Hard-reset the count (e.g. after bulk-claiming). */
    setUnread: setUnreadCount,
  };
}
