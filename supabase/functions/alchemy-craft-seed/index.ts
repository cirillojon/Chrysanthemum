import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function b64url(s: string): string {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  return t + "=".repeat((4 - t.length % 4) % 4);
}

// ── Types ──────────────────────────────────────────────────────────────────

type Rarity = "common" | "uncommon" | "rare" | "legendary" | "mythic" | "exalted" | "prismatic";

// ── Flower catalogue (id → rarity) ────────────────────────────────────────

const FLOWERS: { id: string; rarity: Rarity }[] = [
  // Common
  { id: "quickgrass",      rarity: "common" },
  { id: "dustweed",        rarity: "common" },
  { id: "sprig",           rarity: "common" },
  { id: "dewdrop",         rarity: "common" },
  { id: "pebblebloom",     rarity: "common" },
  { id: "ember_moss",      rarity: "common" },
  { id: "dandelion",       rarity: "common" },
  { id: "clover",          rarity: "common" },
  { id: "violet",          rarity: "common" },
  { id: "lemongrass",      rarity: "common" },
  { id: "daisy",           rarity: "common" },
  { id: "honeywort",       rarity: "common" },
  { id: "buttercup",       rarity: "common" },
  { id: "dawnpetal",       rarity: "common" },
  { id: "poppy",           rarity: "common" },
  { id: "chamomile",       rarity: "common" },
  { id: "marigold",        rarity: "common" },
  { id: "sunflower",       rarity: "common" },
  { id: "coppercup",       rarity: "common" },
  { id: "ivybell",         rarity: "common" },
  { id: "thornberry",      rarity: "common" },
  { id: "saltmoss",        rarity: "common" },
  { id: "ashpetal",        rarity: "common" },
  { id: "snowdrift",       rarity: "common" },
  // Uncommon
  { id: "swiftbloom",      rarity: "uncommon" },
  { id: "shortcress",      rarity: "uncommon" },
  { id: "thornwhistle",    rarity: "uncommon" },
  { id: "starwort",        rarity: "uncommon" },
  { id: "mintleaf",        rarity: "uncommon" },
  { id: "tulip",           rarity: "uncommon" },
  { id: "inkbloom",        rarity: "uncommon" },
  { id: "hyacinth",        rarity: "uncommon" },
  { id: "snapdragon",      rarity: "uncommon" },
  { id: "beebalm",         rarity: "uncommon" },
  { id: "candleflower",    rarity: "uncommon" },
  { id: "carnation",       rarity: "uncommon" },
  { id: "ribbonweed",      rarity: "uncommon" },
  { id: "hibiscus",        rarity: "uncommon" },
  { id: "wildberry",       rarity: "uncommon" },
  { id: "frostbell",       rarity: "uncommon" },
  { id: "bluebell",        rarity: "uncommon" },
  { id: "cherry_blossom",  rarity: "uncommon" },
  { id: "rose",            rarity: "uncommon" },
  { id: "peacockflower",   rarity: "uncommon" },
  { id: "bamboo_bloom",    rarity: "uncommon" },
  { id: "hummingbloom",    rarity: "uncommon" },
  { id: "water_lily",      rarity: "uncommon" },
  { id: "lanternflower",   rarity: "uncommon" },
  { id: "dovebloom",       rarity: "uncommon" },
  { id: "coral_bells",     rarity: "uncommon" },
  { id: "sundew",          rarity: "uncommon" },
  { id: "bubblebloom",     rarity: "uncommon" },
  // Rare
  { id: "flashpetal",        rarity: "rare" },
  { id: "rushwillow",        rarity: "rare" },
  { id: "sweetheart_lily",   rarity: "rare" },
  { id: "glassbell",         rarity: "rare" },
  { id: "stormcaller",       rarity: "rare" },
  { id: "lavender",          rarity: "rare" },
  { id: "amber_crown",       rarity: "rare" },
  { id: "peach_blossom",     rarity: "rare" },
  { id: "foxglove",          rarity: "rare" },
  { id: "butterbloom",       rarity: "rare" },
  { id: "peony",             rarity: "rare" },
  { id: "tidebloom",         rarity: "rare" },
  { id: "starweave",         rarity: "rare" },
  { id: "wisteria",          rarity: "rare" },
  { id: "dreamcup",          rarity: "rare" },
  { id: "coralbell",         rarity: "rare" },
  { id: "foxfire",           rarity: "rare" },
  { id: "bird_of_paradise",  rarity: "rare" },
  { id: "solarbell",         rarity: "rare" },
  { id: "moonpetal",         rarity: "rare" },
  { id: "orchid",            rarity: "rare" },
  { id: "duskrose",          rarity: "rare" },
  { id: "passionflower",     rarity: "rare" },
  { id: "glasswing",         rarity: "rare" },
  { id: "mirror_orchid",     rarity: "rare" },
  { id: "stargazer_lily",    rarity: "rare" },
  { id: "prism_lily",        rarity: "rare" },
  { id: "dusk_orchid",       rarity: "rare" },
  // Legendary
  { id: "firstbloom",        rarity: "legendary" },
  { id: "haste_lily",        rarity: "legendary" },
  { id: "verdant_crown",     rarity: "legendary" },
  { id: "ironwood_bloom",    rarity: "legendary" },
  { id: "sundial",           rarity: "legendary" },
  { id: "lotus",             rarity: "legendary" },
  { id: "candy_blossom",     rarity: "legendary" },
  { id: "prismbark",         rarity: "legendary" },
  { id: "dolphinia",         rarity: "legendary" },
  { id: "ghost_orchid",      rarity: "legendary" },
  { id: "nestbloom",         rarity: "legendary" },
  { id: "black_rose",        rarity: "legendary" },
  { id: "pumpkin_blossom",   rarity: "legendary" },
  { id: "starburst_lily",    rarity: "legendary" },
  { id: "sporebloom",        rarity: "legendary" },
  { id: "fire_lily",         rarity: "legendary" },
  { id: "stargazer",         rarity: "legendary" },
  { id: "fullmoon_bloom",    rarity: "legendary" },
  { id: "ice_crown",         rarity: "legendary" },
  { id: "diamond_bloom",     rarity: "legendary" },
  { id: "oracle_eye",        rarity: "legendary" },
  { id: "halfmoon_bloom",    rarity: "legendary" },
  { id: "aurora_bloom",      rarity: "legendary" },
  { id: "mirrorpetal",       rarity: "legendary" },
  { id: "emberspark",        rarity: "legendary" },
  { id: "phoenix_lily",      rarity: "legendary" },
  { id: "eclipse_bloom",     rarity: "legendary" },
  { id: "tempest_orchid",    rarity: "legendary" },
  { id: "blightmantle",      rarity: "legendary" },
  { id: "cosmosbloom",       rarity: "legendary" },
  { id: "dreamgust",         rarity: "legendary" },
  // Mythic
  { id: "blink_rose",        rarity: "mythic" },
  { id: "dawnfire",          rarity: "mythic" },
  { id: "moonflower",        rarity: "mythic" },
  { id: "jellybloom",        rarity: "mythic" },
  { id: "celestial_bloom",   rarity: "mythic" },
  { id: "void_blossom",      rarity: "mythic" },
  { id: "seraph_wing",       rarity: "mythic" },
  { id: "solar_rose",        rarity: "mythic" },
  { id: "nebula_drift",      rarity: "mythic" },
  { id: "superbloom",        rarity: "mythic" },
  { id: "wanderbloom",       rarity: "mythic" },
  { id: "chrysanthemum",     rarity: "mythic" },
  { id: "solarburst",        rarity: "mythic" },
  { id: "tidalune",          rarity: "mythic" },
  { id: "whisperleaf",       rarity: "mythic" },
  { id: "crystalmind",       rarity: "mythic" },
  // Exalted
  { id: "umbral_bloom",      rarity: "exalted" },
  { id: "obsidian_rose",     rarity: "exalted" },
  { id: "duskmantle",        rarity: "exalted" },
  { id: "graveweb",          rarity: "exalted" },
  { id: "nightwing",         rarity: "exalted" },
  { id: "ashenveil",         rarity: "exalted" },
  { id: "voidfire",          rarity: "exalted" },
  { id: "void_chrysalis",    rarity: "exalted" },
  { id: "starloom",          rarity: "exalted" },
  // Prismatic
  { id: "dreambloom",        rarity: "prismatic" },
  { id: "fairy_blossom",     rarity: "prismatic" },
  { id: "lovebind",          rarity: "prismatic" },
  { id: "eternal_heart",     rarity: "prismatic" },
  { id: "nova_bloom",        rarity: "prismatic" },
  { id: "princess_blossom",  rarity: "prismatic" },
  { id: "the_first_bloom",   rarity: "prismatic" },
];

// ── Rarity output weights per pouch tier ──────────────────────────────────
// Weights within each tier sum to 100.

type RarityWeight = [Rarity, number];

const POUCH_RARITY_WEIGHTS: Record<string, RarityWeight[]> = {
  seed_pouch_1: [["rare",      78], ["legendary", 17], ["mythic",   5]],
  seed_pouch_2: [["legendary", 72], ["mythic",    20], ["exalted",  7], ["prismatic", 1]],
  seed_pouch_3: [["mythic",    68], ["exalted",   24], ["prismatic",8]],
  seed_pouch_4: [["exalted",   72], ["prismatic", 28]],
  seed_pouch_5: [["prismatic", 100]],
};

const VALID_POUCH_IDS = new Set(Object.keys(POUCH_RARITY_WEIGHTS));

// ── Helpers ────────────────────────────────────────────────────────────────

function weightedRandom<T>(items: [T, number][]): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [item, weight] of items) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1][0];
}

/** Pick a species at the given rarity — undiscovered base forms first. */
function selectSpecies(rarity: Rarity, discovered: string[]): string {
  const pool        = FLOWERS.filter((f) => f.rarity === rarity);
  const undiscovered = pool.filter((f) => !discovered.includes(f.id));
  const candidates  = undiscovered.length > 0 ? undiscovered : pool;
  return candidates[Math.floor(Math.random() * candidates.length)].id;
}

// ── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");

    let userId: string;
    try {
      const p = JSON.parse(atob(b64url(token.split(".")[1])));
      userId = p.sub;
    } catch {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Parse + validate input ────────────────────────────────────────────────
    const { consumableId } = await req.json() as { consumableId: string };

    if (!VALID_POUCH_IDS.has(consumableId)) {
      return new Response(JSON.stringify({ error: "Invalid consumableId — must be a seed_pouch_1…5" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify JWT + load save in parallel ────────────────────────────────────
    const [authResult, saveResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin
        .from("game_saves")
        .select("inventory, consumables, discovered, updated_at")
        .eq("user_id", userId)
        .single(),
    ]);

    if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (saveResult.error || !saveResult.data) {
      return new Response(JSON.stringify({ error: "Save not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const save = saveResult.data;
    const priorUpdatedAt = save.updated_at as string;

    let inventory    = (save.inventory    ?? []) as { speciesId: string; quantity: number; isSeed?: boolean; mutation?: string }[];
    let consumables  = (save.consumables  ?? []) as { id: string; quantity: number }[];
    let discovered   = (save.discovered   ?? []) as string[];

    // ── Validate: player must own ≥1 of this pouch ───────────────────────────
    const pouchIdx = consumables.findIndex((c) => c.id === consumableId);
    if (pouchIdx < 0 || consumables[pouchIdx].quantity < 1) {
      return new Response(JSON.stringify({ error: "You don't own that pouch" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Roll output ───────────────────────────────────────────────────────────
    const outputRarity    = weightedRandom(POUCH_RARITY_WEIGHTS[consumableId]);
    const outputSpeciesId = selectSpecies(outputRarity, discovered);

    // ── Deduct 1 pouch from consumables ───────────────────────────────────────
    consumables = consumables
      .map((c, i) => i === pouchIdx ? { ...c, quantity: c.quantity - 1 } : c)
      .filter((c) => c.quantity > 0);

    // ── Add seed to inventory ─────────────────────────────────────────────────
    const seedIdx = inventory.findIndex(
      (i) => i.speciesId === outputSpeciesId && i.isSeed === true && !i.mutation
    );
    if (seedIdx >= 0) {
      inventory = inventory.map((i, idx) =>
        idx === seedIdx ? { ...i, quantity: i.quantity + 1 } : i
      );
    } else {
      inventory = [...inventory, { speciesId: outputSpeciesId, quantity: 1, isSeed: true }];
    }

    // ── Update discovered ─────────────────────────────────────────────────────
    if (!discovered.includes(outputSpeciesId)) {
      discovered = [...discovered, outputSpeciesId];
    }

    // ── CAS write ─────────────────────────────────────────────────────────────
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from("game_saves")
      .update({ inventory, consumables, discovered, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("updated_at", priorUpdatedAt)
      .select("updated_at")
      .single();

    if (updateError || !updateData) {
      return new Response(JSON.stringify({ error: "Save was modified by another action — please retry" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    void supabaseAdmin.from("action_log").insert({
      user_id: userId,
      action:  "open_seed_pouch",
      payload: { consumableId },
      result:  { outputSpeciesId, outputRarity },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        inventory,
        consumables,
        discovered,
        outputSpeciesId,
        serverUpdatedAt: updateData.updated_at,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("alchemy-craft-seed error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
