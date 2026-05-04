import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  SPECIES_RARITY, SPECIES_TYPES, INFUSE_GOLD_COST,
  computeTier, attunementDurationMs,
  deductOne, type InvItem,
} from "../_shared/alchemyAttuneData.ts";
import { initSentry, Sentry } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function b64url(s: string): string {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  return t + "=".repeat((4 - t.length % 4) % 4);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const err = (msg: string, status = 400) => json({ error: msg }, status);

interface AttunementQueueEntry {
  id:           string;
  speciesId:    string;
  // Mutation is deliberately NOT stored — it's rolled at collect time so
  // the player doesn't know the outcome until the attunement finishes.
  tier:         number;
  startedAt:    string;
  durationMs:   number;
  flowerCount:  number;
  flowerSourceMutation?: string;
}

Deno.serve(async (req: Request) => {
  initSentry();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return err("Unauthorized", 401);

    const token = authHeader.replace("Bearer ", "");
    let userId: string;
    try {
      userId = JSON.parse(atob(b64url(token.split(".")[1]))).sub;
    } catch {
      return err("Unauthorized", 401);
    }

    const body = await req.json() as {
      speciesId:   string;
      essenceType: string;
      quantity:    number;
    };
    const { speciesId, essenceType, quantity } = body;
    if (!speciesId)                 return err("speciesId is required");
    if (!essenceType)               return err("essenceType is required");
    if (typeof quantity !== "number" || quantity < 1) return err("quantity must be a positive integer");

    const rarity = SPECIES_RARITY[speciesId];
    if (!rarity) return err("Unknown species");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [authResult, saveResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin.from("game_saves")
        .select("inventory, essences, coins, attunement_slots, attunement_queue, active_boosts, updated_at")
        .eq("user_id", userId)
        .single(),
    ]);

    if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
      return err("Unauthorized", 401);
    }
    if (saveResult.error || !saveResult.data) return err("Save not found", 404);

    const save           = saveResult.data;
    const priorUpdatedAt = save.updated_at as string;
    const inventory      = (save.inventory  ?? []) as InvItem[];
    const essences       = (save.essences   ?? []) as { type: string; amount: number }[];
    const coins          = (save.coins      ?? 0)  as number;
    const slots          = (save.attunement_slots ?? 0) as number;
    const queue          = [...((save.attunement_queue ?? []) as AttunementQueueEntry[])];

    // ── Validate slot availability ─────────────────────────────────────────
    if (slots <= 0) return err("No attunement slots — buy one in the Alchemy → Attune view");
    if (queue.length >= slots) return err("All attunement slots are in use");

    // ── Validate essence ──────────────────────────────────────────────────
    const essenceBank = essences.find((e) => e.type === essenceType);
    if (!essenceBank || essenceBank.amount < quantity) {
      return err(`Not enough ${essenceType} essence`);
    }

    // ── Compute tier + gold cost ──────────────────────────────────────────
    const flowerTypes      = SPECIES_TYPES[speciesId] ?? [];
    const isMatching       = essenceType === "universal" || flowerTypes.includes(essenceType);
    const effectiveEssence = quantity * (isMatching ? 2 : 1);
    const tier             = computeTier(effectiveEssence);

    const goldCost = INFUSE_GOLD_COST[rarity]?.[tier - 1] ?? 0;
    if (coins < goldCost) return err(`Not enough coins (need ${goldCost})`);

    // ── Validate + deduct an unmutated bloom of this species ──────────────
    const newInventory = deductOne(inventory, speciesId, undefined);
    if (!newInventory) return err("No unmutated bloom of this species in inventory");

    // Mutation is rolled at collect time, not here — keep the outcome a
    // surprise until the attunement finishes.

    // ── Compute duration with optional Resonance Draft (attunement) boost ──
    type BoostType = "growth" | "craft" | "attunement";
    const activeBoosts = (save.active_boosts ?? []) as { type: BoostType; expiresAt: string }[];
    const nowMs        = Date.now();
    const hasAttuneBoost = activeBoosts.some(
      (b) => b.type === "attunement" && new Date(b.expiresAt).getTime() > nowMs,
    );

    let durationMs = attunementDurationMs(tier, rarity);
    if (hasAttuneBoost) durationMs = Math.max(1, Math.floor(durationMs / 2));

    // ── Deduct essence ────────────────────────────────────────────────────
    const newEssences = essences
      .map((e) => e.type === essenceType ? { ...e, amount: e.amount - quantity } : e)
      .filter((e) => e.amount > 0);

    // ── Build queue entry ─────────────────────────────────────────────────
    const newEntry: AttunementQueueEntry = {
      id:          crypto.randomUUID(),
      speciesId,
      tier,
      startedAt:   new Date().toISOString(),
      durationMs,
      flowerCount: 1,
    };

    const newQueue = [...queue, newEntry];

    // ── CAS write ─────────────────────────────────────────────────────────
    const { data: ud, error: ue } = await supabaseAdmin
      .from("game_saves")
      .update({
        inventory:        newInventory,
        essences:         newEssences,
        coins:            coins - goldCost,
        attunement_queue: newQueue,
        updated_at:       new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("updated_at", priorUpdatedAt)
      .select("updated_at")
      .single();

    if (ue || !ud) return err("Save was modified by another action — please retry", 409);

    void supabaseAdmin.from("action_log").insert({
      user_id: userId, action: "attune_start",
      payload: { speciesId, essenceType, quantity, tier, goldCost, durationMs },
    });

    return json({
      ok:               true,
      coins:            coins - goldCost,
      inventory:        newInventory,
      essences:         newEssences,
      attunementQueue:  newQueue,
      serverUpdatedAt:  ud.updated_at,
    });

  } catch (e) {
    console.error("attune-start error:", e);
    Sentry.captureException(e);
    await Sentry.flush(2000);
    return err("Internal server error", 500);
  }
});
