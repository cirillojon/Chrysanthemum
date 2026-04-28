import { useEffect, useState, useCallback } from "react";
import { useGame } from "../store/GameContext";
import { getFlower, RARITY_CONFIG, MUTATIONS } from "../data/flowers";
import type { MutationType } from "../data/flowers";
import { FERTILIZERS } from "../data/upgrades";
import type { FertilizerType } from "../data/upgrades";
import { GEAR as GEAR_CATALOG } from "../data/gear";
import type { GearType } from "../data/gear";
import { getPendingGifts, getUnclaimedMail } from "../store/cloudSave";
import type { GiftWithSender, MailboxEntry } from "../store/cloudSave";
import { edgeClaimGift, edgeClaimMail } from "../lib/edgeFunctions";

interface Props {
  onViewProfile:    (username: string) => void;
  onCountChange?:   (total: number) => void;  // notify parent of combined unread
}

function formatCoins(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export function MailboxPage({ onViewProfile, onCountChange }: Props) {
  const { user, state, update } = useGame();

  const [mail,    setMail]    = useState<MailboxEntry[]>([]);
  const [gifts,   setGifts]   = useState<GiftWithSender[]>([]);
  const [loading, setLoading] = useState(true);

  const [claimingMail,  setClaimingMail]  = useState<string | null>(null);
  const [claimingGift,  setClaimingGift]  = useState<string | null>(null);
  const [claimedIds,    setClaimedIds]    = useState<string[]>([]);
  const [error,         setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [m, g] = await Promise.all([
        getUnclaimedMail(user.id),
        getPendingGifts(user.id),
      ]);
      setMail(m);
      setGifts(g);
      onCountChange?.(m.length + g.length);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, onCountChange]);

  useEffect(() => { load(); }, [load]);

  // ── Claim marketplace mail ────────────────────────────────────────────────
  async function handleClaimMail(entry: MailboxEntry) {
    if (!user || claimingMail) return;
    setClaimingMail(entry.id);
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
      onCountChange?.(
        mail.filter((m) => m.id !== entry.id && !claimedIds.includes(m.id)).length +
        gifts.filter((g) => !claimedIds.includes(g.gift.id)).length
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to claim");
    } finally {
      setClaimingMail(null);
    }
  }

  // ── Claim gift ────────────────────────────────────────────────────────────
  async function handleClaimGift(gw: GiftWithSender) {
    if (!user || claimingGift) return;
    setClaimingGift(gw.gift.id);
    setError(null);
    try {
      const result = await edgeClaimGift(gw.gift.id);
      update({ ...state, inventory: result.inventory, discovered: result.discovered });
      setClaimedIds((prev) => [...prev, gw.gift.id]);
      onCountChange?.(
        mail.filter((m) => !claimedIds.includes(m.id)).length +
        gifts.filter((g) => g.gift.id !== gw.gift.id && !claimedIds.includes(g.gift.id)).length
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to claim");
    } finally {
      setClaimingGift(null);
    }
  }

  if (!user) return null;

  const unclaimedMail  = mail.filter((m) => !claimedIds.includes(m.id));
  const unclaimedGifts = gifts.filter((g) => !claimedIds.includes(g.gift.id));
  const totalUnclaimed = unclaimedMail.length + unclaimedGifts.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground text-sm font-mono animate-pulse">Loading mailbox...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Mailbox</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalUnclaimed} unclaimed item{totalUnclaimed !== 1 ? "s" : ""}
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

      {totalUnclaimed === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <p className="text-4xl">📬</p>
          <p className="font-medium text-muted-foreground">Mailbox empty</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Sold listings and friend gifts will appear here to claim.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">

          {/* ── Marketplace mail ────────────────────────────────────────────── */}
          {unclaimedMail.length > 0 && (
            <>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wide">
                Marketplace
              </p>
              {unclaimedMail.map((entry) => (
                <MailEntryCard
                  key={entry.id}
                  entry={entry}
                  claiming={claimingMail === entry.id}
                  onClaim={() => handleClaimMail(entry)}
                />
              ))}
            </>
          )}

          {/* ── Gifts from friends ──────────────────────────────────────────── */}
          {unclaimedGifts.length > 0 && (
            <>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wide mt-2">
                Gifts
              </p>
              {unclaimedGifts.map((gw) => (
                <GiftCard
                  key={gw.gift.id}
                  gw={gw}
                  claiming={claimingGift === gw.gift.id}
                  onClaim={() => handleClaimGift(gw)}
                  onViewProfile={onViewProfile}
                />
              ))}
            </>
          )}

        </div>
      )}
    </div>
  );
}

// ── Marketplace mail card ──────────────────────────────────────────────────

function MailEntryCard({
  entry,
  claiming,
  onClaim,
}: {
  entry:    MailboxEntry;
  claiming: boolean;
  onClaim:  () => void;
}) {
  const isCoins      = entry.kind === "coins";
  const isFertilizer = entry.kind === "fertilizer";
  const isGear       = entry.kind === "gear";
  const isFlower     = entry.kind === "flower" || entry.kind === "seed";

  // Resolve display info
  let emoji    = "📦";
  let title    = "Marketplace mail";
  let subtitle = "";
  let glow     = "";

  if (isCoins) {
    emoji    = "🟡";
    title    = `${formatCoins(entry.amount ?? 0)} coins`;
    subtitle = "Your listing sold";

  } else if (isFertilizer && entry.species_id) {
    const fertType = entry.species_id.startsWith("fert:")
      ? entry.species_id.replace("fert:", "") as FertilizerType
      : entry.species_id as FertilizerType;
    const def = FERTILIZERS[fertType];
    if (def) {
      emoji    = def.emoji;
      title    = def.name;
      subtitle = `${def.speedMultiplier}× growth speed · Fertilizer`;
    }

  } else if (isGear && entry.species_id) {
    const gearType = entry.species_id.startsWith("gear:")
      ? entry.species_id.replace("gear:", "") as GearType
      : entry.species_id as GearType;
    const def    = GEAR_CATALOG[gearType];
    const rarity = def ? RARITY_CONFIG[def.rarity] : null;
    if (def) {
      emoji    = def.emoji;
      title    = def.name;
      subtitle = rarity?.label ?? "Gear";
      glow     = rarity?.glow ?? "";
    }

  } else if (isFlower && entry.species_id) {
    const species = getFlower(entry.species_id);
    const mut     = entry.mutation ? MUTATIONS[entry.mutation as MutationType] : null;
    const rarity  = species ? RARITY_CONFIG[species.rarity] : null;
    if (species) {
      emoji    = entry.kind === "seed"
        ? (species.emoji.seed ?? "🌱")
        : (species.emoji.bloom ?? "🌸");
      title    = species.name + (entry.kind === "seed" ? " Seed" : "");
      subtitle = [
        mut?.name,
        rarity?.label,
      ].filter(Boolean).join(" · ");
      glow     = rarity?.glow ?? "";
    }
  }

  return (
    <div className={`bg-card/60 border rounded-2xl p-4 space-y-3 transition-all ${glow} border-border`}>
      <div className="flex items-center gap-3">
        <span className="text-3xl flex-shrink-0">{emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold">{title}</p>
            {isCoins && (
              <span className="text-xs font-mono text-green-400">From sale</span>
            )}
            {(isFertilizer || isGear || isFlower) && (
              <span className="text-xs font-mono text-muted-foreground">Purchased</span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      <button
        onClick={onClaim}
        disabled={claiming}
        className="w-full py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold text-center hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {claiming
          ? "Claiming..."
          : isCoins
            ? `Collect ${formatCoins(entry.amount ?? 0)} 🟡`
            : "Collect Item"}
      </button>
    </div>
  );
}

// ── Gift card (from friends) ───────────────────────────────────────────────

function GiftCard({
  gw,
  claiming,
  onClaim,
  onViewProfile,
}: {
  gw:            GiftWithSender;
  claiming:      boolean;
  onClaim:       () => void;
  onViewProfile: (username: string) => void;
}) {
  const species  = getFlower(gw.gift.species_id);
  const mut      = gw.gift.mutation ? MUTATIONS[gw.gift.mutation as MutationType] : null;
  const rarity   = species ? RARITY_CONFIG[species.rarity] : null;

  return (
    <div className={`bg-card/60 border rounded-2xl p-4 space-y-3 transition-all ${rarity?.glow ?? ""} border-border hover:border-primary/30`}>
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <span className="text-3xl">{species?.emoji.bloom ?? "🌱"}</span>
          {mut && <span className="absolute -top-1 -right-1 text-sm">{mut.emoji}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold">{species?.name ?? "Unknown"}</p>
            {mut && <span className={`text-xs font-mono font-bold ${mut.color}`}>{mut.name}</span>}
            <span className={`text-xs font-mono ${rarity?.color}`}>{rarity?.label}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            From{" "}
            <button
              onClick={() => onViewProfile(gw.senderProfile.username)}
              className="text-primary hover:underline"
            >
              {gw.senderProfile.username}
            </button>
            {" · "}
            {new Date(gw.gift.created_at).toLocaleDateString(undefined, {
              month: "short", day: "numeric",
            })}
          </p>
        </div>
      </div>

      {gw.gift.message && (
        <div className="bg-background border border-border rounded-xl px-3 py-2">
          <p className="text-xs text-foreground/80 italic">"{gw.gift.message}"</p>
        </div>
      )}

      <button
        onClick={onClaim}
        disabled={claiming}
        className="w-full py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold text-center hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {claiming ? "Claiming..." : "Claim Gift 🎁"}
      </button>
    </div>
  );
}
