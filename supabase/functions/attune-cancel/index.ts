import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { addOrIncrement, type InvItem } from "../_shared/alchemyAttuneData.ts";
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
  mutation:     string;
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

    const { attunementId } = await req.json() as { attunementId?: string };
    if (!attunementId) return err("attunementId is required");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [authResult, saveResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin.from("game_saves")
        .select("inventory, attunement_queue, updated_at")
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
    const queue          = (save.attunement_queue ?? []) as AttunementQueueEntry[];

    const entry = queue.find((e) => e.id === attunementId);
    if (!entry) return err("Attunement not found", 404);

    // ── Refund flower(s) — essence is consumed at start, NOT refunded ─────
    let newInventory = inventory;
    const refundMutation = entry.flowerSourceMutation; // undefined = unmutated bloom
    for (let i = 0; i < entry.flowerCount; i++) {
      newInventory = addOrIncrement(newInventory, entry.speciesId, refundMutation);
    }

    const newQueue = queue.filter((e) => e.id !== attunementId);

    const { data: ud, error: ue } = await supabaseAdmin
      .from("game_saves")
      .update({
        inventory:        newInventory,
        attunement_queue: newQueue,
        updated_at:       new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("updated_at", priorUpdatedAt)
      .select("updated_at")
      .single();

    if (ue || !ud) return err("Save was modified by another action — please retry", 409);

    void supabaseAdmin.from("action_log").insert({
      user_id: userId, action: "attune_cancel",
      payload: { attunementId, speciesId: entry.speciesId, flowerCount: entry.flowerCount },
      result:  { refundedFlowers: entry.flowerCount, essenceLost: true },
    });

    return json({
      ok:               true,
      inventory:        newInventory,
      attunementQueue:  newQueue,
      serverUpdatedAt:  ud.updated_at,
    });

  } catch (e) {
    console.error("attune-cancel error:", e);
    Sentry.captureException(e);
    await Sentry.flush(2000);
    return err("Internal server error", 500);
  }
});
