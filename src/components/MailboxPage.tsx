import { useEffect, useState, useCallback, useRef } from "react";
import { useGame } from "../store/GameContext";
import { getFlower, RARITY_CONFIG, MUTATIONS } from "../data/flowers";
import type { MutationType } from "../data/flowers";
import { FERTILIZERS } from "../data/upgrades";
import type { FertilizerType } from "../data/upgrades";
import { GEAR as GEAR_CATALOG } from "../data/gear";
import type { GearType } from "../data/gear";
import { getAllMail } from "../store/cloudSave";
import type { MailboxEntry } from "../store/cloudSave";
import { edgeClaimMail } from "../lib/edgeFunctions";

interface Props {
  onViewProfile:  (username: string) => void;
  onCountChange?: (total: number) => void;
}

function formatCoins(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000)           return "just now";
  if (ms < 60 * 60_000)      return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 24 * 60 * 60_000) return `${Math.floor(ms / (60 * 60_000))}h ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MailboxPage({ onViewProfile, onCountChange }: Props) {
  const { user, state, update } = useGame();

  const [mail,      setMail]      = useState<MailboxEntry[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [claiming,  setClaiming]  = useState<string | null>(null);
  const [claimedIds, setClaimedIds] = useState<string[]>([]);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const m = await getAllMail(user.id);
      setMail(m);
      onCountChange?.(m.length);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, onCountChange]);

  useEffect(() => { load(); }, [load]);

  async function handleClaim(entry: MailboxEntry) {
    if (!user || claiming) return;
    setClaiming(entry.id);
    setError(null);
    try {
      const result = await edgeClaimMail(entry.id);
      update({
        ...state,
        coins:         result.coins,
        inventory:     result.inventory,
        fertilizers:   result.fertilizers,
        gearInventory: result.gearInventory,
        discovered:    result.discovered,
      });
      setClaimedIds((prev) => [...prev, entry.id]);
      onCountChange?.(mail.filter((m) => m.id !== entry.id && !m.claimed && !claimedIds.includes(m.id)).length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to claim");
    } finally {
      setClaiming(null);
    }
  }

  if (!user) return null;

  const unclaimedCount = mail.filter((m) => !m.claimed && !claimedIds.includes(m.id)).length;

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <p className="text-muted-foreground text-sm font-mono animate-pulse">Loading mailbox...</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Mailbox</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {unclaimedCount} unclaimed item{unclaimedCount !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={load}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-xs text-red-400 font-mono flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {mail.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <p className="text-4xl">📬</p>
          <p className="font-medium text-muted-foreground">Mailbox empty</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Gifts from friends, sold listings, and marketplace purchases appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {mail.map((entry) => (
            <MailCard
              key={entry.id}
              entry={entry}
              claimed={entry.claimed || claimedIds.includes(entry.id)}
              claiming={claiming === entry.id}
              onClaim={() => handleClaim(entry)}
              onViewProfile={onViewProfile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mail card ─────────────────────────────────────────────────────────────────

function MailCard({
  entry,
  claimed,
  claiming,
  onClaim,
  onViewProfile,
}: {
  entry:         MailboxEntry;
  claimed:       boolean;
  claiming:      boolean;
  onClaim:       () => void;
  onViewProfile: (username: string) => void;
}) {
  // ── Resolve attachment display ─────────────────────────────────────────────
  const isCoins      = entry.kind === "coins";
  const isFertilizer = entry.kind === "fertilizer";
  const isGear       = entry.kind === "gear";
  const isFlower     = entry.kind === "flower" || entry.kind === "seed";

  let attachEmoji = "📦";
  let attachTitle = "";
  let attachSub   = "";
  let glow        = "";

  if (isCoins) {
    attachEmoji = "🟡";
    attachTitle = `${formatCoins(entry.amount ?? 0)} coins`;

  } else if (isFertilizer && entry.species_id) {
    const fertType = entry.species_id.startsWith("fert:")
      ? entry.species_id.replace("fert:", "") as FertilizerType
      : entry.species_id as FertilizerType;
    const def = FERTILIZERS[fertType];
    if (def) {
      attachEmoji = def.emoji;
      attachTitle = def.name;
      attachSub   = `${def.speedMultiplier}× growth`;
    }

  } else if (isGear && entry.species_id) {
    const gearType = entry.species_id.startsWith("gear:")
      ? entry.species_id.replace("gear:", "") as GearType
      : entry.species_id as GearType;
    const def    = GEAR_CATALOG[gearType];
    const rarity = def ? RARITY_CONFIG[def.rarity] : null;
    if (def) {
      attachEmoji = def.emoji;
      attachTitle = def.name;
      attachSub   = rarity?.label ?? "Gear";
      glow        = rarity?.glow ?? "";
    }

  } else if (isFlower && entry.species_id) {
    const species = getFlower(entry.species_id);
    const mut     = entry.mutation ? MUTATIONS[entry.mutation as MutationType] : null;
    const rarity  = species ? RARITY_CONFIG[species.rarity] : null;
    if (species) {
      attachEmoji = entry.kind === "seed"
        ? (species.emoji.seed ?? "🌱")
        : (species.emoji.bloom ?? "🌸");
      attachTitle = species.name + (entry.kind === "seed" ? " Seed" : "");
      attachSub   = [mut?.name, rarity?.label].filter(Boolean).join(" · ");
      glow        = rarity?.glow ?? "";
    }
  }

  const sender   = entry.from_profile;
  const isAdmin  = !sender && entry.subject !== "Listing Sold" && entry.subject !== "Marketplace Purchase";
  const subject  = entry.subject || (isCoins ? "Listing Sold" : "New Item");

  const [open, setOpen]       = useState(false);
  const bodyRef               = useRef<HTMLDivElement>(null);
  const [height, setHeight]   = useState<number | undefined>(undefined);

  // Measure content height whenever open changes so we can animate smoothly
  useEffect(() => {
    if (!bodyRef.current) return;
    setHeight(open ? bodyRef.current.scrollHeight : 0);
  }, [open, entry]);

  // Small attachment preview shown in the collapsed header row
  const attachPreview = attachTitle
    ? `${attachEmoji} ${attachTitle}`
    : null;

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all duration-300 ${glow} ${open ? "border-primary/40" : "border-border"} ${claimed ? "opacity-40" : "bg-card/60"}`}>

      {/* ── Collapsed header — always visible, click to toggle ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-primary/5 transition-colors"
      >
        {/* Sender avatar: profile flower for friends, 👑 for admin, 🏪 for marketplace */}
        <div className="relative flex-shrink-0 w-7 h-7 flex items-center justify-center">
          <span className="text-xl leading-none">
            {sender ? (getFlower(sender.display_flower)?.emoji.bloom ?? "🌱") : isAdmin ? "👑" : "🏪"}
          </span>
          {sender?.display_mutation && (
            <span className="absolute -top-1 -right-1 text-[10px] leading-none">
              {MUTATIONS[sender.display_mutation as MutationType]?.emoji}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{subject}</p>
          <p className="text-xs text-muted-foreground truncate">
            {sender ? `From ${sender.username}` : isAdmin ? "From Admin 👑" : "From Marketplace 🏪"}
            {attachPreview ? ` · ${attachPreview}` : ""}
            {" · "}{timeAgo(entry.created_at)}
          </p>
        </div>

        {/* Chevron */}
        <span className={`text-muted-foreground text-xs transition-transform duration-200 flex-shrink-0 ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {/* ── Expandable body ── */}
      <div
        style={{ height: height ?? (open ? "auto" : 0) }}
        className="overflow-hidden transition-[height] duration-200 ease-in-out"
      >
        <div ref={bodyRef} className="px-4 pb-4 space-y-3">

          {/* Sender line */}
          <p className="text-xs text-muted-foreground">
            {sender ? (
              <>
                From{" "}
                <button
                  onClick={(e) => { e.stopPropagation(); onViewProfile(sender.username); }}
                  className="text-primary hover:underline"
                >
                  {sender.username}
                </button>
              </>
            ) : isAdmin ? (
              <span>From Admin 👑</span>
            ) : (
              <span>From Marketplace 🏪</span>
            )}
            {" · "}{timeAgo(entry.created_at)}
          </p>

          {/* Body message */}
          {entry.message && (
            <div className="bg-background border border-border rounded-xl px-3 py-2">
              <p className="text-xs text-foreground/80 italic">"{entry.message}"</p>
            </div>
          )}

          {/* Attachment */}
          {attachTitle && (
            <div className="flex items-center gap-3 bg-background/60 border border-border/60 rounded-xl px-3 py-2">
              <div className="relative flex-shrink-0 w-9 h-9 flex items-center justify-center">
                <span className="text-2xl leading-none">{attachEmoji}</span>
                {isFlower && entry.mutation && (
                  <span className="absolute -top-1 -right-1 text-sm leading-none">
                    {MUTATIONS[entry.mutation as MutationType]?.emoji}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{attachTitle}</p>
                {attachSub && <p className="text-xs text-muted-foreground">{attachSub}</p>}
              </div>
            </div>
          )}

          {/* Collect button */}
          <button
            onClick={(e) => { e.stopPropagation(); onClaim(); }}
            disabled={claiming || claimed}
            className="w-full py-2 rounded-xl text-xs font-semibold text-center transition-opacity disabled:opacity-50 bg-primary text-primary-foreground hover:opacity-90"
          >
            {claimed
              ? "✓ Collected"
              : claiming
                ? "Collecting..."
                : isCoins
                  ? `Collect ${formatCoins(entry.amount ?? 0)} 🟡`
                  : "Collect"}
          </button>
        </div>
      </div>
    </div>
  );
}
