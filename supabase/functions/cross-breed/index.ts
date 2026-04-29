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

// ── Types ─────────────────────────────────────────────────────────────────────

type Rarity     = "common" | "uncommon" | "rare" | "legendary" | "mythic" | "exalted" | "prismatic";
type FlowerType = "blaze" | "tide" | "grove" | "frost" | "storm" | "lunar" | "solar" | "fairy" | "shadow" | "arcane" | "stellar" | "zephyr";

interface FlowerDef { id: string; rarity: Rarity; types: FlowerType[]; }
interface InventoryItem { speciesId: string; quantity: number; mutation?: string; isSeed?: boolean; }

// ── Rarity ordering ───────────────────────────────────────────────────────────

const RARITY_ORDER: Rarity[] = [
  "common", "uncommon", "rare", "legendary", "mythic", "exalted", "prismatic",
];

function rarityIndex(r: Rarity): number { return RARITY_ORDER.indexOf(r); }

// ── All flowers (id + rarity + types) ────────────────────────────────────────
// Includes recipe-only species — needed for type/rarity validation of inputs.

const ALL_FLOWERS: FlowerDef[] = [
  // Common
  { id: "quickgrass",      rarity: "common",    types: ["grove"]                     },
  { id: "dustweed",        rarity: "common",    types: ["zephyr", "shadow"]          },
  { id: "sprig",           rarity: "common",    types: ["grove"]                     },
  { id: "dewdrop",         rarity: "common",    types: ["tide"]                      },
  { id: "pebblebloom",     rarity: "common",    types: ["grove"]                     },
  { id: "ember_moss",      rarity: "common",    types: ["blaze"]                     },
  { id: "dandelion",       rarity: "common",    types: ["zephyr"]                    },
  { id: "clover",          rarity: "common",    types: ["grove", "fairy"]            },
  { id: "violet",          rarity: "common",    types: ["shadow", "fairy"]           },
  { id: "lemongrass",      rarity: "common",    types: ["grove", "solar"]            },
  { id: "daisy",           rarity: "common",    types: ["solar"]                     },
  { id: "honeywort",       rarity: "common",    types: ["fairy", "grove"]            },
  { id: "buttercup",       rarity: "common",    types: ["solar", "fairy"]            },
  { id: "dawnpetal",       rarity: "common",    types: ["solar"]                     },
  { id: "poppy",           rarity: "common",    types: ["blaze", "solar"]            },
  { id: "chamomile",       rarity: "common",    types: ["solar", "fairy"]            },
  { id: "marigold",        rarity: "common",    types: ["solar", "blaze"]            },
  { id: "sunflower",       rarity: "common",    types: ["solar"]                     },
  { id: "coppercup",       rarity: "common",    types: ["blaze"]                     },
  { id: "ivybell",         rarity: "common",    types: ["grove"]                     },
  { id: "thornberry",      rarity: "common",    types: ["grove", "shadow"]           },
  { id: "saltmoss",        rarity: "common",    types: ["tide"]                      },
  { id: "ashpetal",        rarity: "common",    types: ["blaze", "shadow"]           },
  { id: "snowdrift",       rarity: "common",    types: ["frost"]                     },
  // Uncommon
  { id: "swiftbloom",      rarity: "uncommon",  types: ["zephyr"]                    },
  { id: "shortcress",      rarity: "uncommon",  types: ["grove"]                     },
  { id: "thornwhistle",    rarity: "uncommon",  types: ["storm", "grove"]            },
  { id: "starwort",        rarity: "uncommon",  types: ["stellar"]                   },
  { id: "mintleaf",        rarity: "uncommon",  types: ["frost", "grove"]            },
  { id: "tulip",           rarity: "uncommon",  types: ["solar", "fairy"]            },
  { id: "inkbloom",        rarity: "uncommon",  types: ["shadow", "arcane"]          },
  { id: "hyacinth",        rarity: "uncommon",  types: ["fairy"]                     },
  { id: "snapdragon",      rarity: "uncommon",  types: ["blaze", "storm"]            },
  { id: "beebalm",         rarity: "uncommon",  types: ["solar", "grove"]            },
  { id: "candleflower",    rarity: "uncommon",  types: ["blaze", "fairy"]            },
  { id: "carnation",       rarity: "uncommon",  types: ["fairy"]                     },
  { id: "ribbonweed",      rarity: "uncommon",  types: ["zephyr", "fairy"]           },
  { id: "hibiscus",        rarity: "uncommon",  types: ["solar", "tide"]             },
  { id: "wildberry",       rarity: "uncommon",  types: ["grove", "fairy"]            },
  { id: "frostbell",       rarity: "uncommon",  types: ["frost"]                     },
  { id: "bluebell",        rarity: "uncommon",  types: ["frost", "fairy"]            },
  { id: "cherry_blossom",  rarity: "uncommon",  types: ["fairy"]                     },
  { id: "rose",            rarity: "uncommon",  types: ["fairy"]                     },
  { id: "peacockflower",   rarity: "uncommon",  types: ["fairy", "solar"]            },
  { id: "bamboo_bloom",    rarity: "uncommon",  types: ["grove", "zephyr"]           },
  { id: "hummingbloom",    rarity: "uncommon",  types: ["fairy", "zephyr"]           },
  { id: "water_lily",      rarity: "uncommon",  types: ["tide", "lunar"]             },
  { id: "lanternflower",   rarity: "uncommon",  types: ["blaze", "fairy"]            },
  { id: "dovebloom",       rarity: "uncommon",  types: ["fairy", "zephyr"]           },
  { id: "coral_bells",     rarity: "uncommon",  types: ["tide", "fairy"]             },
  { id: "sundew",          rarity: "uncommon",  types: ["solar", "tide"]             },
  { id: "bubblebloom",     rarity: "uncommon",  types: ["tide", "zephyr"]            },
  // Rare
  { id: "flashpetal",      rarity: "rare",      types: ["storm", "blaze"]            },
  { id: "rushwillow",      rarity: "rare",      types: ["zephyr", "grove"]           },
  { id: "sweetheart_lily", rarity: "rare",      types: ["fairy", "lunar"]            },
  { id: "glassbell",       rarity: "rare",      types: ["frost", "arcane"]           },
  { id: "stormcaller",     rarity: "rare",      types: ["storm"]                     },
  { id: "lavender",        rarity: "rare",      types: ["fairy", "arcane"]           },
  { id: "amber_crown",     rarity: "rare",      types: ["solar", "blaze"]            },
  { id: "peach_blossom",   rarity: "rare",      types: ["solar", "fairy"]            },
  { id: "foxglove",        rarity: "rare",      types: ["shadow", "fairy"]           },
  { id: "butterbloom",     rarity: "rare",      types: ["solar", "fairy"]            },
  { id: "peony",           rarity: "rare",      types: ["fairy"]                     },
  { id: "tidebloom",       rarity: "rare",      types: ["tide"]                      },
  { id: "starweave",       rarity: "rare",      types: ["stellar", "arcane"]         },
  { id: "wisteria",        rarity: "rare",      types: ["fairy", "arcane"]           },
  { id: "dreamcup",        rarity: "rare",      types: ["lunar", "fairy"]            },
  { id: "coralbell",       rarity: "rare",      types: ["tide", "blaze"]             },
  { id: "foxfire",         rarity: "rare",      types: ["blaze", "shadow"]           },
  { id: "bird_of_paradise",rarity: "rare",      types: ["solar", "zephyr"]           },
  { id: "solarbell",       rarity: "rare",      types: ["solar", "arcane"]           },
  { id: "moonpetal",       rarity: "rare",      types: ["lunar"]                     },
  { id: "orchid",          rarity: "rare",      types: ["fairy", "arcane"]           },
  { id: "duskrose",        rarity: "rare",      types: ["shadow", "lunar"]           },
  { id: "passionflower",   rarity: "rare",      types: ["solar", "fairy"]            },
  { id: "glasswing",       rarity: "rare",      types: ["zephyr", "frost"]           },
  { id: "mirror_orchid",   rarity: "rare",      types: ["arcane", "lunar"]           },
  { id: "stargazer_lily",  rarity: "rare",      types: ["stellar", "fairy"]          },
  { id: "prism_lily",      rarity: "rare",      types: ["arcane", "frost"]           },
  { id: "dusk_orchid",     rarity: "rare",      types: ["shadow", "arcane"]          },
  // Legendary
  { id: "firstbloom",      rarity: "legendary", types: ["solar", "fairy"]            },
  { id: "haste_lily",      rarity: "legendary", types: ["zephyr", "storm"]           },
  { id: "verdant_crown",   rarity: "legendary", types: ["grove", "fairy"]            },
  { id: "ironwood_bloom",  rarity: "legendary", types: ["grove"]                     },
  { id: "sundial",         rarity: "legendary", types: ["solar", "arcane"]           },
  { id: "lotus",           rarity: "legendary", types: ["tide", "arcane"]            },
  { id: "candy_blossom",   rarity: "legendary", types: ["fairy"]                     },
  { id: "prismbark",       rarity: "legendary", types: ["grove", "arcane"]           },
  { id: "dolphinia",       rarity: "legendary", types: ["tide"]                      },
  { id: "ghost_orchid",    rarity: "legendary", types: ["shadow", "arcane"]          },
  { id: "nestbloom",       rarity: "legendary", types: ["grove", "fairy"]            },
  { id: "black_rose",      rarity: "legendary", types: ["shadow"]                    },
  { id: "pumpkin_blossom", rarity: "legendary", types: ["blaze", "grove"]            },
  { id: "starburst_lily",  rarity: "legendary", types: ["stellar"]                   },
  { id: "sporebloom",      rarity: "legendary", types: ["grove", "shadow"]           },
  { id: "fire_lily",       rarity: "legendary", types: ["blaze"]                     },
  { id: "stargazer",       rarity: "legendary", types: ["stellar", "arcane"]         },
  { id: "fullmoon_bloom",  rarity: "legendary", types: ["lunar"]                     },
  { id: "ice_crown",       rarity: "legendary", types: ["frost"]                     },
  { id: "diamond_bloom",   rarity: "legendary", types: ["arcane", "frost"]           },
  { id: "oracle_eye",      rarity: "legendary", types: ["arcane"]                    },
  { id: "halfmoon_bloom",  rarity: "legendary", types: ["lunar", "shadow"]           },
  { id: "aurora_bloom",    rarity: "legendary", types: ["storm", "frost"]            },
  { id: "mirrorpetal",     rarity: "legendary", types: ["arcane", "lunar"]           },
  { id: "emberspark",      rarity: "legendary", types: ["blaze", "storm"]            },
  // Mythic
  { id: "blink_rose",      rarity: "mythic",    types: ["arcane", "shadow"]          },
  { id: "dawnfire",        rarity: "mythic",    types: ["solar", "blaze"]            },
  { id: "moonflower",      rarity: "mythic",    types: ["lunar"]                     },
  { id: "jellybloom",      rarity: "mythic",    types: ["tide", "arcane"]            },
  { id: "celestial_bloom", rarity: "mythic",    types: ["stellar"]                   },
  { id: "void_blossom",    rarity: "mythic",    types: ["shadow", "arcane"]          },
  { id: "seraph_wing",     rarity: "mythic",    types: ["zephyr", "fairy"]           },
  { id: "solar_rose",      rarity: "mythic",    types: ["solar"]                     },
  { id: "nebula_drift",    rarity: "mythic",    types: ["stellar", "arcane"]         },
  { id: "superbloom",      rarity: "mythic",    types: ["storm", "stellar"]          },
  { id: "wanderbloom",     rarity: "mythic",    types: ["zephyr", "arcane"]          },
  { id: "chrysanthemum",   rarity: "mythic",    types: ["arcane", "stellar", "fairy"]},
  // Exalted (standard botany-conversion obtainable)
  { id: "umbral_bloom",    rarity: "exalted",   types: ["shadow", "lunar"]           },
  { id: "obsidian_rose",   rarity: "exalted",   types: ["shadow"]                    },
  { id: "duskmantle",      rarity: "exalted",   types: ["shadow", "lunar"]           },
  { id: "graveweb",        rarity: "exalted",   types: ["shadow"]                    },
  { id: "nightwing",       rarity: "exalted",   types: ["shadow", "zephyr"]          },
  { id: "ashenveil",       rarity: "exalted",   types: ["shadow", "blaze"]           },
  { id: "voidfire",        rarity: "exalted",   types: ["shadow", "blaze"]           },
  // Prismatic (standard)
  { id: "dreambloom",      rarity: "prismatic", types: ["fairy", "arcane"]           },
  { id: "fairy_blossom",   rarity: "prismatic", types: ["fairy"]                     },
  { id: "lovebind",        rarity: "prismatic", types: ["fairy", "arcane"]           },
  { id: "eternal_heart",   rarity: "prismatic", types: ["fairy", "solar"]            },
  { id: "nova_bloom",      rarity: "prismatic", types: ["stellar", "storm", "blaze"] },
  { id: "princess_blossom",rarity: "prismatic", types: ["fairy", "arcane"]           },
  // ── Recipe-only cross-breed species ────────────────────────────────────────
  // Tier 1 — Legendary
  { id: "phoenix_lily",    rarity: "legendary", types: ["blaze", "frost"]            },
  { id: "eclipse_bloom",   rarity: "legendary", types: ["lunar", "solar"]            },
  { id: "tempest_orchid",  rarity: "legendary", types: ["tide", "storm"]             },
  { id: "blightmantle",    rarity: "legendary", types: ["grove", "shadow"]           },
  { id: "cosmosbloom",     rarity: "legendary", types: ["arcane", "stellar"]         },
  { id: "dreamgust",       rarity: "legendary", types: ["fairy", "zephyr"]           },
  // Tier 2 — Mythic
  { id: "solarburst",      rarity: "mythic",    types: ["blaze", "solar"]            },
  { id: "tidalune",        rarity: "mythic",    types: ["lunar", "tide"]             },
  { id: "whisperleaf",     rarity: "mythic",    types: ["grove", "zephyr"]           },
  { id: "crystalmind",     rarity: "mythic",    types: ["frost", "arcane"]           },
  // Tier 3 — Exalted
  { id: "void_chrysalis",  rarity: "exalted",   types: ["arcane"]                    },
  { id: "starloom",        rarity: "exalted",   types: ["stellar"]                   },
  // Tier 4 — Prismatic
  { id: "the_first_bloom", rarity: "prismatic", types: ["arcane", "stellar"]         },
];

// ── Recipe table ──────────────────────────────────────────────────────────────

interface Recipe { id: string; tier: number; typeA: FlowerType; typeB: FlowerType; minRarity: Rarity; outputSpeciesId: string; }

const RECIPES: Recipe[] = [
  { id: "blaze+frost",      tier: 1, typeA: "blaze",  typeB: "frost",   minRarity: "rare",      outputSpeciesId: "phoenix_lily"    },
  { id: "lunar+solar",      tier: 1, typeA: "lunar",  typeB: "solar",   minRarity: "rare",      outputSpeciesId: "eclipse_bloom"   },
  { id: "tide+storm",       tier: 1, typeA: "tide",   typeB: "storm",   minRarity: "rare",      outputSpeciesId: "tempest_orchid"  },
  { id: "grove+shadow",     tier: 1, typeA: "grove",  typeB: "shadow",  minRarity: "rare",      outputSpeciesId: "blightmantle"    },
  { id: "arcane+stellar",   tier: 1, typeA: "arcane", typeB: "stellar", minRarity: "rare",      outputSpeciesId: "cosmosbloom"     },
  { id: "fairy+zephyr",     tier: 1, typeA: "fairy",  typeB: "zephyr",  minRarity: "rare",      outputSpeciesId: "dreamgust"       },
  { id: "blaze+solar",      tier: 2, typeA: "blaze",  typeB: "solar",   minRarity: "legendary", outputSpeciesId: "solarburst"      },
  { id: "lunar+tide",       tier: 2, typeA: "lunar",  typeB: "tide",    minRarity: "legendary", outputSpeciesId: "tidalune"        },
  { id: "grove+zephyr",     tier: 2, typeA: "grove",  typeB: "zephyr",  minRarity: "legendary", outputSpeciesId: "whisperleaf"     },
  { id: "frost+arcane",     tier: 2, typeA: "frost",  typeB: "arcane",  minRarity: "legendary", outputSpeciesId: "crystalmind"     },
  { id: "arcane+shadow-t3", tier: 3, typeA: "arcane", typeB: "shadow",  minRarity: "mythic",    outputSpeciesId: "void_chrysalis"  },
  { id: "stellar+zephyr-t3",tier: 3, typeA: "stellar",typeB: "zephyr",  minRarity: "mythic",    outputSpeciesId: "starloom"        },
  { id: "arcane+stellar-t4",tier: 4, typeA: "arcane", typeB: "stellar", minRarity: "exalted",   outputSpeciesId: "the_first_bloom" },
];

// ── Recipe matching ───────────────────────────────────────────────────────────

function findRecipe(a: FlowerDef, b: FlowerDef): Recipe | null {
  const matches = RECIPES.filter((r) => {
    if (rarityIndex(a.rarity) < rarityIndex(r.minRarity)) return false;
    if (rarityIndex(b.rarity) < rarityIndex(r.minRarity)) return false;
    const fwd = a.types.includes(r.typeA) && b.types.includes(r.typeB);
    const rev = a.types.includes(r.typeB) && b.types.includes(r.typeA);
    return fwd || rev;
  });
  if (matches.length === 0) return null;
  return [...matches].sort((x, y) => y.tier - x.tier)[0];
}

function isAlmostThere(a: FlowerDef, b: FlowerDef): boolean {
  return RECIPES.some((r) => {
    const aA = a.types.includes(r.typeA), aB = a.types.includes(r.typeB);
    const bA = b.types.includes(r.typeA), bB = b.types.includes(r.typeB);
    return (aA !== bB) || (aB !== bA); // one side partial
  });
}

function outputCount(a: FlowerDef, b: FlowerDef, r: Recipe): 1 | 2 {
  return rarityIndex(a.rarity) > rarityIndex(r.minRarity) &&
         rarityIndex(b.rarity) > rarityIndex(r.minRarity) ? 2 : 1;
}

// ── Inventory helpers ─────────────────────────────────────────────────────────

function removeOne(inv: InventoryItem[], sId: string, mut: string | undefined): InventoryItem[] {
  let done = false;
  return inv
    .map((item) => {
      if (!done && item.speciesId === sId && item.mutation === (mut ?? undefined) && !item.isSeed && item.quantity > 0) {
        done = true;
        return { ...item, quantity: item.quantity - 1 };
      }
      return item;
    })
    .filter((i) => i.quantity > 0);
}

function addSeed(inv: InventoryItem[], sId: string, qty: number): InventoryItem[] {
  const idx = inv.findIndex((i) => i.speciesId === sId && i.isSeed);
  if (idx >= 0) {
    return inv.map((item, i) => i === idx ? { ...item, quantity: item.quantity + qty } : item);
  }
  return [...inv, { speciesId: sId, quantity: qty, isSeed: true }];
}

// ── Handler ───────────────────────────────────────────────────────────────────

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
      speciesIdA: string; mutationA?: string;
      speciesIdB: string; mutationB?: string;
    };

    const { speciesIdA, mutationA, speciesIdB, mutationB } = body;
    if (!speciesIdA || !speciesIdB) {
      return new Response(JSON.stringify({ error: "speciesIdA and speciesIdB required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [authResult, saveResult] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      supabaseAdmin
        .from("game_saves")
        .select("inventory, discovered, discovered_recipes, updated_at")
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

    const save           = saveResult.data;
    const priorUpdatedAt = save.updated_at as string;
    const inventory      = (save.inventory          ?? []) as InventoryItem[];
    const discovered     = (save.discovered          ?? []) as string[];
    const discoveredRecipes = (save.discovered_recipes ?? []) as string[];

    // ── Validate both flowers are in inventory ────────────────────────────────

    const sameSlot = speciesIdA === speciesIdB && (mutationA ?? "") === (mutationB ?? "");
    const itemA = inventory.find((i) =>
      i.speciesId === speciesIdA && i.mutation === (mutationA ?? undefined) && !i.isSeed && i.quantity > 0
    );
    if (!itemA) {
      return new Response(JSON.stringify({ error: "Flower A not in inventory" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (sameSlot && itemA.quantity < 2) {
      return new Response(JSON.stringify({ error: "Need at least 2 of this flower" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!sameSlot) {
      const itemB = inventory.find((i) =>
        i.speciesId === speciesIdB && i.mutation === (mutationB ?? undefined) && !i.isSeed && i.quantity > 0
      );
      if (!itemB) {
        return new Response(JSON.stringify({ error: "Flower B not in inventory" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Look up flower definitions ────────────────────────────────────────────

    const speciesA = ALL_FLOWERS.find((f) => f.id === speciesIdA);
    const speciesB = ALL_FLOWERS.find((f) => f.id === speciesIdB);
    if (!speciesA || !speciesB) {
      return new Response(JSON.stringify({ error: "Unknown species" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Recipe matching ───────────────────────────────────────────────────────

    const recipe = findRecipe(speciesA, speciesB);

    if (!recipe) {
      const almostThere = isAlmostThere(speciesA, speciesB);
      return new Response(
        JSON.stringify({ ok: true, result: "no_match", almostThere }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── First discovery — return inputs, record recipe ────────────────────────

    const isFirstDiscovery = !discoveredRecipes.includes(recipe.id);

    if (isFirstDiscovery) {
      const newDiscoveredRecipes = [...discoveredRecipes, recipe.id];
      const newUpdatedAt = new Date().toISOString();

      const { data: updateData, error: updateError } = await supabaseAdmin
        .from("game_saves")
        .update({ discovered_recipes: newDiscoveredRecipes, updated_at: newUpdatedAt })
        .eq("user_id", userId)
        .eq("updated_at", priorUpdatedAt)
        .select("updated_at")
        .single();

      if (updateError || !updateData) {
        return new Response(JSON.stringify({ error: "Save conflict — please retry" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      void supabaseAdmin.from("action_log").insert({
        user_id: userId, action: "cross_breed_discover",
        payload: { speciesIdA, speciesIdB, recipeId: recipe.id },
        result:  { outputSpeciesId: recipe.outputSpeciesId },
      });

      return new Response(
        JSON.stringify({
          ok: true, result: "match", firstDiscovery: true,
          recipeId: recipe.id, outputSpeciesId: recipe.outputSpeciesId, outputCount: 1,
          discoveredRecipes: newDiscoveredRecipes,
          serverUpdatedAt: updateData.updated_at,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Subsequent craft — consume inputs, award seeds ────────────────────────

    const count = outputCount(speciesA, speciesB, recipe);

    let newInventory = inventory;
    newInventory = removeOne(newInventory, speciesIdA, mutationA);
    newInventory = removeOne(newInventory, speciesIdB, mutationB);
    newInventory = addSeed(newInventory, recipe.outputSpeciesId, count);

    const newDiscovered = discovered.includes(recipe.outputSpeciesId)
      ? discovered
      : [...discovered, recipe.outputSpeciesId];

    const newUpdatedAt = new Date().toISOString();

    const { data: updateData, error: updateError } = await supabaseAdmin
      .from("game_saves")
      .update({
        inventory:          newInventory,
        discovered:         newDiscovered,
        discovered_recipes: discoveredRecipes, // unchanged on craft
        updated_at:         newUpdatedAt,
      })
      .eq("user_id", userId)
      .eq("updated_at", priorUpdatedAt)
      .select("updated_at")
      .single();

    if (updateError || !updateData) {
      return new Response(JSON.stringify({ error: "Save conflict — please retry" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    void supabaseAdmin.from("action_log").insert({
      user_id: userId, action: "cross_breed_craft",
      payload: { speciesIdA, speciesIdB, recipeId: recipe.id, outputCount: count },
      result:  { outputSpeciesId: recipe.outputSpeciesId },
    });

    return new Response(
      JSON.stringify({
        ok: true, result: "match", firstDiscovery: false,
        recipeId: recipe.id, outputSpeciesId: recipe.outputSpeciesId, outputCount: count,
        discoveredRecipes,
        inventory:       newInventory,
        discovered:      newDiscovered,
        serverUpdatedAt: updateData.updated_at,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("cross-breed error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
