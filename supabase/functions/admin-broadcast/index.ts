import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth: require CRON_SECRET passed as x-admin-secret header ────────────
    const cronSecret  = Deno.env.get("CRON_SECRET");
    const adminSecret = req.headers.get("x-admin-secret");
    if (!cronSecret || adminSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as {
      subject:        string;
      message:        string;
      kind:           "coins" | "flower" | "seed" | "fertilizer" | "gear";
      amount?:        number;
      speciesId?:     string;
      mutation?:      string | null;
      fertilizerType?: string;
      gearType?:      string;
    };

    if (!body.subject || !body.kind) {
      return new Response(JSON.stringify({ error: "subject and kind are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Fetch all player user IDs ─────────────────────────────────────────────
    const { data: saves, error: saveErr } = await supabase
      .from("game_saves")
      .select("user_id");

    if (saveErr || !saves) {
      return new Response(JSON.stringify({ error: saveErr?.message ?? "fetch failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (saves.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Build the species_id field from whichever attachment type was chosen ──
    let speciesId: string | null = null;
    if (body.kind === "fertilizer" && body.fertilizerType) {
      speciesId = `fert:${body.fertilizerType}`;
    } else if (body.kind === "gear" && body.gearType) {
      speciesId = `gear:${body.gearType}`;
    } else if ((body.kind === "flower" || body.kind === "seed") && body.speciesId) {
      speciesId = body.speciesId;
    }

    const now = new Date().toISOString();

    // ── Insert in batches of 500 to avoid payload limits ─────────────────────
    const BATCH = 500;
    let sent = 0;

    for (let i = 0; i < saves.length; i += BATCH) {
      const batch = saves.slice(i, i + BATCH);
      const rows = batch.map((s) => ({
        user_id:    s.user_id,
        from_user_id: null,           // null = system/admin (no from_profile loaded)
        subject:    body.subject,
        kind:       body.kind,
        species_id: speciesId,
        mutation:   body.mutation ?? null,
        is_seed:    body.kind === "seed",
        amount:     body.kind === "coins" ? (body.amount ?? 0) : null,
        message:    body.message ?? "",
        created_at: now,
      }));

      const { error: insertErr } = await supabase.from("mailbox").insert(rows);
      if (insertErr) {
        console.error("admin-broadcast: batch insert failed", insertErr);
      } else {
        sent += batch.length;
      }
    }

    void supabase.from("action_log").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      action:  "admin_broadcast",
      payload: { subject: body.subject, kind: body.kind, sent },
    });

    return new Response(
      JSON.stringify({ ok: true, sent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("admin-broadcast error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
