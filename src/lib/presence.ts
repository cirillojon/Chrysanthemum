export type PresenceStatus = "online" | "away" | "offline";

export function getPresenceStatus(lastSeenAt: string | null | undefined): PresenceStatus {
  if (!lastSeenAt) return "offline";
  const ms = Date.now() - new Date(lastSeenAt).getTime();
  if (ms < 3 * 60_000)  return "online";
  if (ms < 15 * 60_000) return "away";
  return "offline";
}

export function formatLastSeen(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return "a long time ago";
  const ms = Date.now() - new Date(lastSeenAt).getTime();
  if (ms < 60_000)               return "just now";
  if (ms < 60 * 60_000)          return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 24 * 60 * 60_000)     return `${Math.floor(ms / (60 * 60_000))}h ago`;
  if (ms < 7 * 24 * 60 * 60_000) return `${Math.floor(ms / (24 * 60 * 60_000))}d ago`;
  return "a long time ago";
}

export const STATUS_DOT: Record<PresenceStatus, string> = {
  online:  "bg-green-500",
  away:    "bg-yellow-400",
  offline: "bg-zinc-500",
};

export const STATUS_LABEL: Record<PresenceStatus, string> = {
  online:  "Online",
  away:    "Away",
  offline: "Offline",
};

export const STATUS_TEXT_COLOR: Record<PresenceStatus, string> = {
  online:  "text-green-500",
  away:    "text-yellow-400",
  offline: "text-zinc-500",
};
