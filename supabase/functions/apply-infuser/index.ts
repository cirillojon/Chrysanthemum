import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// base64url → base64 with proper padding for Deno's strict atob()
function b64url(s: string): string {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  return t + "=".repeat((4 - t.length % 4) % 4);
}

// ── Response helpers ──────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const err = (msg: string, status = 400) => json({ error: msg }, status);

// ── Species → rarity lookup ───────────────────────────────────────────────────
// Mirrors src/data/flowers.ts + the recipe-only species in cross-breed/index.ts.
// Only rarity matters here — types are not needed for infuser matching.

const SPECIES_RARITY: Record<string, string> = {
  // Common
  quickgrass: "common",    dustweed: "common",       sprig: "common",
  dewdrop: "common",       pebblebloom: "common",    ember_moss: "common",
  dandelion: "common",     clover: "common",          violet: "common",
  lemongrass: "common",    daisy: "common",           honeywort: "common",
  buttercup: "common",     dawnpetal: "common",       poppy: "common",
  chamomile: "common",     marigold: "common",        sunflower: "common",
  coppercup: "common",     ivybell: "common",         thornberry: "common",
  saltmoss: "common",      ashpetal: "common",        snowdrift: "common",
  // Uncommon
  swiftbloom: "uncommon",  shortcress: "uncommon",    thornwhistle: "uncommon",
  starwort: "uncommon",    mintleaf: "uncommon",      tulip: "uncommon",
  inkbloom: "uncommon",    hyacinth: "uncommon",      snapdragon: "uncommon",
  beebalm: "uncommon",     candleflower: "uncommon",  carnation: "uncommon",
  ribbonweed: "uncommon",  hibiscus: "uncommon",      wildberry: "uncommon",
  frostbell: "uncommon",   bluebell: "uncommon",      cherry_blossom: "uncommon",
  rose: "uncommon",        peacockflower: "uncommon", bamboo_bloom: "uncommon",
  hummingbloom: "uncommon",water_lily: "uncommon",    lanternflower: "uncommon",
  dovebloom: "uncommon",   coral_bells: "uncommon",   sundew: "uncommon",
  bubblebloom: "uncommon",
  // Rare
  flashpetal: "rare",      rushwillow: "rare",        sweetheart_lily: "rare",
  glassbell: "rare",       stormcaller: "rare",       lavender: "rare",
  amber_crown: "rare",     peach_blossom: "rare",     foxglove: "rare",
  butterbloom: "rare",     peony: "rare",             tidebloom: "rare",
  starweave: "rare",       wisteria: "rare",          dreamcup: "rare",
  coralbell: "rare",       foxfire: "rare",           bird_of_paradise: "rare",
  solarbell: "rare",       moonpetal: "rare",         orchid: "rare",
  duskrose: "rare",        passionflower: "rare",     glasswing: "rare",
  mirror_orchid: "rare",   stargazer_lily: "rare",    prism_lily: "rare",
  dusk_orchid: "rare",
  // Legendary
  firstbloom: "legendary",    haste_lily: "legendary",     verdant_crown: "legendary",
  ironwood_bloom: "legendary",sundial: "legendary",         lotus: "legendary",
  candy_blossom: "legendary", prismbark: "legendary",       dolphinia: "legendary",
  ghost_orchid: "legendary",  nestbloom: "legendary",       black_rose: "legendary",
  pumpkin_blossom: "legendary",starburst_lily: "legendary",  sporebloom: "legendary",
  fire_lily: "legendary",     stargazer: "legendary",       fullmoon_bloom: "legendary",
  ice_crown: "legendary",     diamond_bloom: "legendary",   oracle_eye: "legendary",
  halfmoon_bloom: "legendary",aurora_bloom: "legendary",    mirrorpetal: "legendary",
  emberspark: "legendary",
  // Recipe-only Legendary (Tier 1)
  phoenix_lily: "legendary",  eclipse_bloom: "legendary",   tempest_orchid: "legendary",
  blightmantle: "legendary",  cosmosbloom: "legendary",     dreamgust: "legendary",
  // Mythic
  blink_rose: "mythic",    dawnfire: "mythic",        moonflower: "mythic",
  jellybloom: "mythic",    celestial_bloom: "mythic", void_blossom: "mythic",
  seraph_wing: "mythic",   solar_rose: "mythic",      nebula_drift: "mythic",
  superbloom: "mythic",    wanderbloom: "mythic",     chrysanthemum: "mythic",
  // Recipe-only Mythic (Tier 2)
  solarburst: "mythic",    tidalune: "mythic",        whisperleaf: "mythic",
  crystalmind: "mythic",
  // Exalted (standard + recipe-only Tier 3)
  umbral_bloom: "exalted",  obsidian_rose: "exalted", duskmantle: "exalted",
  graveweb: "exalted",      nightwing: "exalted",     ashenveil: "exalted",
  voidfire: "exalted",
  void_chrysalis: "exalted",starloom: "exalted",
  // Prismatic (standard + recipe-only Tier 4)
  dreambloom: "prismatic",  fairy_blossom: "prismatic", lovebind: "prismatic",
  eternal_heart: "prismatic",nova_bloom: "prismatic",   princess_blossom: "prismatic",
  the_first_bloom: "prismatic",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type InfuserItem = { rarity: string; quantity: number };
type PlantData   = { speciesId: string; bloomedAt?: number; infused?: boolean; [key: string]: unknown };
type GridCell    = { id: string; plant: PlantData | null; gear?: unknown };

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return err("Unauthorized", 401);

    const token = authHeader.replace("Bearer ", "");
    let userId: string;
    try {
      const p = JSON.parse(atob(b64url(token.split(".")[1])));
      userId = p.sub;
    } catch {
      return err("Unauthorized", 401);
    }

    // ── Parse input ───────────────────────────────────────────────────────────

    const { row, col } = await req.json() as { row: number; col: number };

    if (typeof row !== "number" || typeof col !== "number") {
      return err("row and col are required");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Auth + load save in parallel ──────────────────────────────────────────

    const [authResult, saveResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin
        .from("game_saves")
        .select("grid, infusers, updated_at")
        .eq("user_id", userId)
        .single(),
    ]);

    if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
      return err("Unauthorized", 401);
    }
    if (saveResult.error || !saveResult.data) {
      return err("Save not found", 404);
    }

    const save           = saveResult.data;
    const priorUpdatedAt = save.updated_at as string;
    const grid           = (save.grid     ?? []) as GridCell[][];
    const infusers       = (save.infusers ?? []) as InfuserItem[];

    // ── Validate plot ─────────────────────────────────────────────────────────

    const cell = grid[row]?.[col];
    if (!cell)       return err("Invalid cell coordinates");
    if (!cell.plant) return err("No plant in this cell");

    const plant = cell.plant;

    if (!plant.bloomedAt)  return err("Plant has not bloomed yet");
    if (plant.infused)     return err("Plant is already infused");

    // ── Rarity match ──────────────────────────────────────────────────────────

    const rarity = SPECIES_RARITY[plant.speciesId];
    if (!rarity) return err("Unknown species");

    const infuserItem = infusers.find((i) => i.rarity === rarity && i.quantity > 0);
    if (!infuserItem) return err(`No ${rarity} Flower Infuser in inventory`);

    // ── Apply changes ─────────────────────────────────────────────────────────

    const newGrid = grid.map((r, ri) =>
      r.map((p, ci) =>
        ri === row && ci === col
          ? { ...p, plant: { ...p.plant!, infused: true } }
          : p
      )
    );

    const newInfusers = infusers
      .map((i) => i.rarity === rarity ? { ...i, quantity: i.quantity - 1 } : i)
      .filter((i) => i.quantity > 0);

    // ── CAS write ─────────────────────────────────────────────────────────────

    const { data: ud, error: ue } = await supabaseAdmin
      .from("game_saves")
      .update({ grid: newGrid, infusers: newInfusers, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("updated_at", priorUpdatedAt)
      .select("updated_at")
      .single();

    if (ue || !ud) return err("Save conflict — please retry", 409);

    void supabaseAdmin.from("action_log").insert({
      user_id: userId, action: "apply_infuser",
      payload: { row, col, rarity },
      result:  { remainingInfusers: infuserItem.quantity - 1 },
    });

    return json({ ok: true, grid: newGrid, infusers: newInfusers, serverUpdatedAt: ud.updated_at });

  } catch (e) {
    console.error("apply-infuser error:", e);
    return err("Internal server error", 500);
  }
});
