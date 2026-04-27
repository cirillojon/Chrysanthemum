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

// ── Flower sell values (mirrors src/data/flowers.ts) ─────────────────────────
const FLOWER_SELL_VALUES: Record<string, number> = {
  quickgrass: 10, dustweed: 10, sprig: 12, dewdrop: 12, pebblebloom: 12,
  ember_moss: 12, dandelion: 13, clover: 13, violet: 14, lemongrass: 14,
  daisy: 14, honeywort: 14, buttercup: 14, dawnpetal: 15, poppy: 15,
  chamomile: 15, marigold: 16, sunflower: 17, coppercup: 17, ivybell: 17,
  thornberry: 18, saltmoss: 19, ashpetal: 19, snowdrift: 20,
  swiftbloom: 42, shortcress: 44, thornwhistle: 48, starwort: 50, mintleaf: 50,
  tulip: 50, inkbloom: 52, hyacinth: 53, snapdragon: 55, beebalm: 57,
  candleflower: 57, carnation: 59, ribbonweed: 60, hibiscus: 62, wildberry: 64,
  frostbell: 63, bluebell: 64, cherry_blossom: 66, rose: 67, peacockflower: 69,
  bamboo_bloom: 70, hummingbloom: 70, water_lily: 71, lanternflower: 73,
  dovebloom: 76, coral_bells: 78, sundew: 81, bubblebloom: 84,
  flashpetal: 250, rushwillow: 260, sweetheart_lily: 280, glassbell: 285,
  stormcaller: 290, lavender: 300, amber_crown: 300, peach_blossom: 300,
  foxglove: 320, butterbloom: 330, peony: 340, tidebloom: 350, starweave: 350,
  wisteria: 360, dreamcup: 360, coralbell: 370, foxfire: 375,
  bird_of_paradise: 380, solarbell: 380, moonpetal: 390, orchid: 400,
  duskrose: 410, passionflower: 420, glasswing: 435, mirror_orchid: 450,
  stargazer_lily: 460, prism_lily: 480, dusk_orchid: 500,
  firstbloom: 3_600, haste_lily: 3_800, verdant_crown: 4_200, ironwood_bloom: 4_300,
  sundial: 4_400, lotus: 4_500, candy_blossom: 4_700, prismbark: 4_700,
  dolphinia: 4_800, ghost_orchid: 4_800, nestbloom: 5_000, black_rose: 5_100,
  pumpkin_blossom: 5_100, starburst_lily: 5_100, sporebloom: 5_300, fire_lily: 5_400,
  stargazer: 5_600, fullmoon_bloom: 5_700, ice_crown: 5_700, diamond_bloom: 6_000,
  oracle_eye: 6_300, halfmoon_bloom: 6_600, aurora_bloom: 6_700, mirrorpetal: 6_900,
  emberspark: 7_200,
  blink_rose: 50_000, dawnfire: 53_000, moonflower: 58_000, jellybloom: 59_000,
  celestial_bloom: 63_000, void_blossom: 69_000, seraph_wing: 77_000,
  solar_rose: 79_000, nebula_drift: 84_000, superbloom: 90_000,
  wanderbloom: 90_000, chrysanthemum: 100_000,
  umbral_bloom: 250_000, obsidian_rose: 285_000, duskmantle: 310_000,
  graveweb: 355_000, nightwing: 430_000, ashenveil: 465_000, voidfire: 500_000,
  dreambloom: 1_000_000, fairy_blossom: 1_200_000, lovebind: 1_350_000,
  eternal_heart: 1_550_000, nova_bloom: 1_800_000, princess_blossom: 2_000_000,
};

// ── Marketplace slot upgrade costs (mirrors src/data/upgrades.ts) ─────────────
const MARKETPLACE_SLOT_UPGRADES = [
  { slots: 1, cost: 10_000  },
  { slots: 2, cost: 50_000  },
  { slots: 3, cost: 150_000 },
  { slots: 4, cost: 350_000 },
  { slots: 5, cost: 650_000 },
];

const MAX_MARKETPLACE_SLOTS = 5;
const LISTING_FEE_PCT       = 0.05; // 5% listing fee, non-refundable
const LISTING_DURATION_MS   = 48 * 60 * 60 * 1_000; // 48 hours

interface InventoryItem { speciesId: string; quantity: number; mutation?: string; isSeed?: boolean; }

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

    const body = await req.json() as {
      action: "create_listing" | "upgrade_slots";
      speciesId?: string;
      mutation?: string;
      askPrice?: number;
    };

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Verify JWT + load save in parallel ────────────────────────────────────
    const [authResult, saveResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin
        .from("game_saves")
        .select("coins, inventory, marketplace_slots")
        .eq("user_id", userId)
        .single(),
    ]);

    if (authResult.error || !authResult.data.user || authResult.data.user.id !== userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (saveResult.error || !saveResult.data) {
      console.error("save load failed:", saveResult.error);
      return new Response(JSON.stringify({ error: "Save not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const save = saveResult.data;
    console.log("save loaded:", JSON.stringify({ coins: save.coins, marketplace_slots: save.marketplace_slots, action: body.action }));
    let coins             = save.coins as number;
    let newInventory      = [...(save.inventory ?? []) as InventoryItem[]];
    let marketplaceSlots  = (save.marketplace_slots ?? 0) as number;

    // ── upgrade_slots ─────────────────────────────────────────────────────────
    if (body.action === "upgrade_slots") {
      const next = MARKETPLACE_SLOT_UPGRADES.find((u) => u.slots > marketplaceSlots);
      if (!next) {
        return new Response(JSON.stringify({ error: "Already at max marketplace slots" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (coins < next.cost) {
        return new Response(JSON.stringify({ error: "Not enough coins" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      coins -= next.cost;
      marketplaceSlots = next.slots;

      const { error: updateError } = await supabaseAdmin
        .from("game_saves")
        .update({ coins, marketplace_slots: marketplaceSlots, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      if (updateError) {
        return new Response(JSON.stringify({ error: "Failed to save" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ ok: true, coins, marketplaceSlots }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── create_listing ────────────────────────────────────────────────────────
    if (body.action === "create_listing") {
      if (!body.speciesId || typeof body.askPrice !== "number" || body.askPrice < 1) {
        return new Response(JSON.stringify({ error: "speciesId and askPrice required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check active listing count vs slot limit
      const { count: activeCount } = await supabaseAdmin
        .from("marketplace_listings")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", userId)
        .eq("status", "active");

      if ((activeCount ?? 0) >= marketplaceSlots) {
        return new Response(JSON.stringify({ error: "No listing slots available" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate item in inventory
      const itemIdx = newInventory.findIndex(
        (i) => i.speciesId === body.speciesId && i.mutation === body.mutation && !i.isSeed
      );
      if (itemIdx === -1 || newInventory[itemIdx].quantity < 1) {
        return new Response(JSON.stringify({ error: "Item not in inventory" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Deduct listing fee (5%, floored, min 1)
      const fee = Math.max(1, Math.floor(body.askPrice * LISTING_FEE_PCT));
      if (coins < fee) {
        return new Response(JSON.stringify({ error: "Not enough coins for listing fee" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      coins -= fee;

      // Remove one from inventory
      newInventory = newInventory
        .map((i, idx) => idx === itemIdx ? { ...i, quantity: i.quantity - 1 } : i)
        .filter((i) => i.quantity > 0);

      const expiresAt = new Date(Date.now() + LISTING_DURATION_MS).toISOString();
      const baseValue = FLOWER_SELL_VALUES[body.speciesId] ?? 0;

      // Insert listing
      const { data: listing, error: insertError } = await supabaseAdmin
        .from("marketplace_listings")
        .insert({
          seller_id:  userId,
          species_id: body.speciesId,
          mutation:   body.mutation ?? null,
          ask_price:  body.askPrice,
          price:      body.askPrice,   // original column name — kept in sync with ask_price
          base_value: baseValue,
          fee_paid:   fee,
          status:     "active",
          expires_at: expiresAt,
        })
        .select("id")
        .single();

      if (insertError || !listing) {
        console.error("insert failed:", insertError);
        return new Response(JSON.stringify({ error: "Failed to create listing" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update save
      const { error: updateError } = await supabaseAdmin
        .from("game_saves")
        .update({ coins, inventory: newInventory, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      if (updateError) {
        console.error("save update failed:", updateError);
        await supabaseAdmin.from("marketplace_listings").delete().eq("id", listing.id);
        return new Response(JSON.stringify({ error: "Failed to save" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ ok: true, coins, inventory: newInventory, listingId: listing.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("marketplace-list error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
