import { useEffect } from "react";
import { useGame } from "../store/GameContext";
import { updatePresence } from "../store/cloudSave";

/**
 * Keeps the current user's last_seen_at fresh so friends can see their status.
 * Pings on mount, every 60 s, on tab focus, and when the tab becomes visible again.
 * Mount this once at the App level.
 */
export function usePresence() {
  const { user } = useGame();

  useEffect(() => {
    if (!user) return;

    const ping = () => updatePresence(user.id);
    ping();

    const interval = setInterval(ping, 60_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") ping();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", ping);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", ping);
    };
  }, [user?.id]);
}
