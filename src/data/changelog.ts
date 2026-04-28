export type ChangelogItemType = "added" | "fixed" | "changed";

export interface ChangelogItem {
  type: ChangelogItemType;
  text: string;
}

export interface ChangelogEntry {
  version: string;
  title: string;
  items: ChangelogItem[];
}

// Most recent version first — update this with every release
export const CHANGELOGS: ChangelogEntry[] = [
  {
    version: "2.2.0",
    title:   "The Gear Update",
    items: [
      { type: "added",   text: "⚙️ Gear system — place gear on any farm plot to boost, protect, or automate the plants around it" },
      { type: "added",   text: "🏪 Supply Shop — new shop tab that sells fertilizers and gear; items roll by rarity and restock independently of the seed shop" },
      { type: "added",   text: "🚿 Regular Sprinklers (3 tiers) — speed up nearby plants and may apply the Wet mutation; Rare 1.5× cross (1 h), Legendary 1.75× 3×3 (2 h), Mythic 2× diamond (4 h)" },
      { type: "added",   text: "🧪 Mutation Sprinklers (6 types) — 50% chance per hour to apply a specific mutation to nearby blooms over 2 hours: Heater ♨️ (Scorched), Cooler 🧊 (Frosted), Generator 🔋 (Shocked), Crystal Ball 🔮 (Moonlit), Gold Vial 💰 (Gilded), Kaleidoscope 🔭 (Rainbow)" },
      { type: "added",   text: "💡 Grow Lamp — boosts growth during night periods (dusk / night / midnight) and stacks with sprinklers; Uncommon 1.2× (4 h) and Rare 1.5× (8 h)" },
      { type: "added",   text: "🧹 Scarecrow — fully blocks weather mutations on nearby plants while active; sprinkler mutations still apply; Rare (4 h) and Legendary (8 h)" },
      { type: "added",   text: "🧺 Composter — generates a fertilizer each time a nearby plant blooms; stores up to 10 (Uncommon, 4 h) or 20 (Rare, 8 h); collect from the plot tooltip" },
      { type: "added",   text: "💨 Fan — point it in a direction to strip mutations from blooms in its path, or apply Windstruck if there's none; Uncommon 2-tile (2 h) and Rare 3-tile (4 h)" },
      { type: "added",   text: "🔔 Harvest Bell — automatically harvests bloomed plants in range even while offline; Rare cross (4 h) and Legendary 3×3 (8 h)" },
      { type: "added",   text: "🌾 Auto-Planter — automatically plants seeds from your inventory into empty cells in a diamond area even while offline; Prismatic only, 12 hours" },
      { type: "added",   text: "Plant indicators — active gear effects show as small badges on plots so you can see what's boosting or protecting each plant at a glance" },
      { type: "added",   text: "Gear in plot tooltip — placed gear is listed in the tooltip with its name and time remaining" },
      { type: "added",   text: "Profile gear slots — your currently placed gear is displayed on your public profile with slot animations" },
      { type: "added",   text: "Supplies on Marketplace — fertilizers and gear can now be listed and purchased; price history charts work for supplies too" },
      { type: "added",   text: "Flower types — each species now has a type category (e.g. Wild, Tropical, Garden) shown in the Codex and seed picker" },
      { type: "added",   text: "App settings — new settings panel with fertilizer badge toggle and UI theme selection" },
      { type: "added",   text: "Inventory tabs — Inventory is now split into Flowers, Seeds, and Gear sub-tabs" },
      { type: "added",   text: "Notification badges — the nav bar shows a badge for unread mailbox items and unclaimed gifts" },
      { type: "added",   text: "User presence — see whether friends and profile visitors are currently online" },
      { type: "changed", text: "Botany conversion rates reduced — tiers now require 3 / 4 / 5 / 5 / 6 / 7 blooms (Common → Exalted), down from a flat 5× across the board" },
      { type: "changed", text: "Generator (🔋 Shocked) can only mutate a plant that already carries the Wet mutation" },
      { type: "changed", text: "Auto-Planter now covers a diamond area (12 plots) and lasts 12 hours instead of a 5×5 square over 24 hours" },
      { type: "fixed",   text: "Botany Convert All no longer deletes blooms on a failed server call — blooms are restored and the button cools down for 5 seconds before retrying" },
      { type: "fixed",   text: "Weather no longer permanently freezes after Clear expires — the advance_weather function now runs with correct database permissions" },
      { type: "fixed",   text: "Kaleidoscope now correctly shows its prismatic rainbow border and glow in inventory and the supply shop" },
      { type: "fixed",   text: "Harvest Bell and Auto-Planter now process correctly during offline catch-up ticks" },
      { type: "fixed",   text: "Settings no longer affect other players' profile gardens when you change your own preferences" },
      { type: "fixed",   text: "Grow Lamp no longer shows two rarity borders when placed; fertilizer items also display the correct rarity border" },
    ],
  },
  {
    version: "2.1.6",
    title:   "Bug Fixes",
    items: [
      { type: "fixed", text: "Plot tooltip no longer hides behind the navigation bar on mobile — it now flips below the plot when it would be covered by the sticky nav" },
    ],
  },
  {
    version: "2.1.5",
    title:   "Mobile UX",
    items: [
      { type: "added",   text: "📱 Swipe left or right to navigate between tabs on mobile — also works between Seeds ↔ Fertilizers in the Shop and between sub-views in Social" },
      { type: "added",   text: "Slide animations when switching tabs — the incoming view slides in from the direction you're navigating; the sub-nav stays put" },
      { type: "added",   text: "🌿 Shop split into Seeds and Fertilizers sub-tabs — each has its own grid and empty state" },
      { type: "added",   text: "Sticky header & nav — the header and navigation bar stay pinned to the top of the screen while you scroll" },
      { type: "changed", text: "Day/night ambient tint now cross-fades smoothly over 3 seconds when the time period changes, instead of snapping instantly" },
    ],
  },
  {
    version: "2.1.4",
    title:   "Gifting Fixes",
    items: [
      { type: "fixed", text: "Gifting a flower no longer incorrectly awards coins as if it was sold" },
      { type: "fixed", text: "Gifted flowers are now validated and deducted server-side — no more duplication on page reload" },
      { type: "fixed", text: "You can no longer gift an item that is already listed on the Marketplace" },
      { type: "fixed", text: "Claimed gifts are now written directly to your DB inventory — gifted flowers are immediately usable in Botany" },
      { type: "fixed", text: "Friend profile flowers now show mutation emojis, matching the leaderboard" },
    ],
  },
  {
    version: "2.1.3",
    title:   "Marketplace & Garden",
    items: [
      { type: "added",   text: "🌱 Seeds can now be listed and bought on the Marketplace — seed listings show the seed emoji and a \"Seed\" label so they're easy to spot" },
      { type: "added",   text: "⚡ Marketplace listings update in real time — new listings appear instantly and sold/cancelled listings disappear without a page refresh" },
      { type: "fixed",   text: "Buying a listing that was just sold now shows a friendly \"just sold\" message and removes the phantom listing, instead of throwing an error" },
      { type: "added",   text: "🗑 You can now remove a growing (non-bloomed) plant from the garden — your seed is returned to inventory. Tap the plot to open the tooltip and use \"Remove plant\"" },
      { type: "fixed",   text: "Plot tooltip no longer gets clipped off-screen on mobile — it automatically nudges itself back into the viewport on the left and right edges" },
    ],
  },
  {
    version: "2.1.2",
    title:   "Bug Fixes & UI",
    items: [
      { type: "fixed",   text: "Shop \"Flower not in stock\" errors are now fully resolved — if the post-restock server sync failed silently, the buy handler auto-resyncs the shop and retries before giving up" },
      { type: "changed", text: "🏪 Marketplace moved into the Social tab — all player-to-player features are now in one place, and the main nav is one tab shorter" },
    ],
  },
  {
    version: "2.1.1",
    title:   "Bug Fixes",
    items: [
      { type: "fixed", text: "Collect All now adds all harvested blooms to your inventory at once instead of one by one" },
      { type: "fixed", text: "A failed harvest no longer leaves a ghost flower in your inventory" },
      { type: "fixed", text: "Shop \"Flower not in stock\" errors after a restock are fixed — buys now wait for the shop sync to complete first" },
    ],
  },
  {
    version: "2.1.0",
    title:   "Marketplace",
    items: [
      { type: "added",   text: "🏪 Marketplace — buy and sell flowers with other players; listings are visible to everyone" },
      { type: "added",   text: "Listing slots — unlock your first slot for 10,000 coins, up to 5 slots total" },
      { type: "added",   text: "5% listing fee charged upfront when creating a listing; fee is non-refundable" },
      { type: "added",   text: "48-hour listing expiry — unsold flowers are automatically returned to your inventory" },
      { type: "added",   text: "Price history chart — tap any listing to see the last 30 sale prices for that flower" },
      { type: "added",   text: "My Listings tab — view your active listings, cancel them, and see sold/expired history" },
      { type: "added",   text: "Search, rarity filter, and sort (newest, price ↑, price ↓) on the Browse tab" },
      { type: "fixed",   text: "Botany conversion race condition (#61) — simultaneous conversions no longer produce errors" },
      { type: "fixed",   text: "Forecast slots 5–8 showing \"Pending\" (#62) — SQL now generates enough entries for all 8 slots" },
      { type: "fixed",   text: "Golden Hour, Prismatic Skies, and Star Shower now correctly gate by Eastern Time — they no longer appear outside their allowed time windows" },
      { type: "fixed",   text: "Forecast relative times now show hours/minutes (e.g. \"in 2h 30m\") and days/hours (e.g. \"in 1d 6h\") for longer durations" },
      { type: "fixed",   text: "Plot tooltip growth time now shows days/hours (e.g. \"2d 6h\") when remaining time exceeds 24 hours" },
      { type: "changed", text: "Fertilizer speed multipliers rebalanced — Basic 1.1×, Advanced 1.25×, Premium 1.5×, Elite 1.75×, Miracle 2×" },
      { type: "changed", text: "Clear skies is now more common; special weather events are slightly rarer" },
    ],
  },
  {
    version: "2.0.3",
    title:   "UI Bug Fixes",
    items: [
      { type: "fixed", text: "Claim Gift button text is now properly centered" },
      { type: "fixed", text: "Codex rarity breakdown and filter now include Prismatic" },
      { type: "fixed", text: "Codex rarity labels now show the full name instead of a 3-letter abbreviation" },
    ],
  },
  {
    version: "2.0.2",
    title:   "Concurrency & Race Condition Fixes",
    items: [
      { type: "fixed", text: "Rapidly harvesting multiple plots no longer produces errors or ghost plants — all harvest calls are serialized so DB writes never race each other" },
      { type: "fixed", text: "\"Collect All\" and individual tile harvests no longer double-queue the same plot when both fire at the same time" },
      { type: "fixed", text: "\"Plant All\" no longer races a harvest that hasn't committed to the DB yet — it waits for all in-flight harvests to finish first" },
      { type: "fixed", text: "Rapidly clicking \"Sell 1\" or \"Sell All\" no longer causes inventory errors or refunded items" },
      { type: "fixed", text: "Rapidly clicking \"Buy\" or \"Buy All\" in the shop no longer causes stock errors or lost coins" },
      { type: "fixed", text: "Rollback from a failed action now only restores the specific changed field — other concurrent successful actions are no longer undone" },
    ],
  },
  {
    version: "2.0.1",
    title:   "Edge Function Hotfix",
    items: [
      { type: "fixed",   text: "All game actions (plant, harvest, sell, buy, fertilize, upgrade) were reverting — fixed broken JWT verification that was rejecting every request with 401 Unauthorized" },
      { type: "fixed",   text: "Harvest incorrectly rejecting ready flowers — server now computes bloom status from planting time rather than relying on a client-only field" },
      { type: "fixed",   text: "Selling newer flowers returned 0 coins — sell value catalog was stale and missing recent species" },
      { type: "fixed",   text: "Advanced and Elite fertilizers were rejected by the apply-fertilizer function" },
      { type: "changed", text: "Auth verification and save loading now run in parallel — slightly faster action response times" },
    ],
  },
  {
    version: "2.0.0",
    title:   "Server-Authoritative Architecture",
    items: [
      { type: "added",   text: "🔒 All game actions (plant, harvest, buy, sell, fertilize, upgrade, convert) are now validated server-side via Edge Functions — no client can fake progress" },
      { type: "added",   text: "Optimistic UI with automatic rollback — actions feel instant but revert if the server rejects them" },
      { type: "changed", text: "Game saves are now protected by Row Level Security — all writes go through the server" },
      { type: "changed", text: "Coin calculations, inventory changes, and codex discoveries are all validated server-side" },
    ],
  },
  {
    version: "1.6.0",
    title:   "Economy & Prismatic Update",
    items: [
      { type: "added",   text: "🌈 Prismatic rarity — a new tier above Exalted with animated rainbow borders, glow, and color; obtainable only through Botany" },
      { type: "added",   text: "20 new flowers — 3 Uncommon, 5 Rare, 4 Legendary, 1 Mythic, and 6 Prismatic including the special Princess Blossom" },
      { type: "added",   text: "⚡ Codex Mastery — fully discover a flower (base bloom + all 9 mutations) to permanently grow that species 20% faster" },
      { type: "added",   text: "Mastery indicators — ⚡ badge in the seed picker and yellow highlighted timer in the plot tooltip show when a mastery bonus is active" },
      { type: "changed", text: "Shop now rolls rarity first (weighted: Common → Mythic), then picks a random flower from that tier — guaranteeing variety across all rarities" },
      { type: "changed", text: "Shop buy price changed from 60% → 75% of sell value" },
      { type: "changed", text: "Sell values rebalanced across all tiers — each tier now has at most a 2× spread from cheapest to most expensive, scaled by growth time" },
      { type: "fixed",   text: "Coral Bells renamed to Pearlwort with a working emoji (previous emoji was broken on older devices)" },
    ],
  },
  {
    version: "1.5.2",
    title:   "Bug Fixes",
    items: [
      { type: "fixed", text: "Leaderboard filter buttons (Global, Friends, Coins, Codex) are now a single equal-width row on mobile" },
    ],
  },
  {
    version: "1.5.1",
    title:   "Quick Fix",
    items: [
      { type: "fixed", text: "Changelog modal is now scrollable on mobile so the dismiss button is always reachable" },
    ],
  },
  {
    version: "1.5.0",
    title:   "Weather & Mutations Update",
    items: [
      { type: "added",   text: "Weather Forecast — unlock up to 8 slots to preview upcoming weather events with estimated start times" },
      { type: "added",   text: "⛈️ Thunderstorm — 2× growth speed; unmutated plants can become Wet or Shocked, Wet plants can upgrade to Shocked over the storm" },
      { type: "added",   text: "🌪️ Tornado — instantly applies a random mutation to every bloomed flower in your garden" },
      { type: "added",   text: "⚡ Shocked mutation — applied by thunderstorm, upgraded from Wet during a storm" },
      { type: "added",   text: "💨 Windstruck mutation — applied instantly by tornado" },
      { type: "added",   text: "Day/night ambient tint — screen shifts through dawn, morning, midday, afternoon, sunset, dusk, night, and midnight" },
      { type: "added",   text: "Display flower mutation badge — your active mutation shows as a small icon on your profile flower in the HUD" },
      { type: "fixed",   text: "Rarity borders and backgrounds now correctly display on other players' profile gardens" },
      { type: "fixed",   text: "Fertilizers in plot tooltip are now sorted by effectiveness (weakest → strongest)" },
      { type: "fixed",   text: "Social tab buttons are equal-width and emoji-only on mobile" },
      { type: "fixed",   text: "Social tab no longer deselects in the navbar when viewing a profile" },
      { type: "fixed",   text: "Weather forecast no longer shows '0m 0s' during clear skies" },
      { type: "changed", text: "Profile page is now embedded inside the Social tab — the 5-button nav stays visible at all times" },
      { type: "changed", text: "Wet → Shocked upgrade now applies gradually (~50% chance over the storm duration) instead of instantly" },
    ],
  },
  {
    version: "1.4.0",
    title:   "Mutations Update",
    items: [
      { type: "added",   text: "Flower mutations — bloomed flowers can carry a mutation that multiplies their sell value" },
      { type: "added",   text: "8 mutation types: Giant, Wet, Scorched, Frosted, Stellar, Prismatic, Gilded, Moonlit" },
      { type: "added",   text: "Mutations discovered via harvest or gift are registered in the Floral Codex" },
      { type: "changed", text: "Weather mutations only roll on fully bloomed flowers" },
      { type: "changed", text: "Growth bar now speeds up during rain and slows back down smoothly" },
      { type: "fixed",   text: "Rarity glow border was being overwritten by mutation colour in inventory" },
      { type: "fixed",   text: "Flowers received as gifts now appear in Botany Lab and Floral Codex" },
      { type: "fixed",   text: "Manipulated local saves with future timestamps are rejected in favour of cloud save" },
    ],
  },
  {
    version: "1.3.0",
    title:   "Quality of Life",
    items: [
      { type: "added",   text: "Collect All button — harvest every bloomed flower in one tap" },
      { type: "added",   text: "Plant All button — fills empty plots with your highest-rarity seeds automatically" },
      { type: "added",   text: "Buy All button on shop slots — purchase the entire stock in one click" },
      { type: "added",   text: "Convert All button in Botany Lab — runs as many conversions as possible at once" },
      { type: "added",   text: "My Profile button on the Social tab for quick access to your own profile" },
      { type: "added",   text: "Profile status message — set a short message displayed on your profile" },
    ],
  },
  {
    version: "1.2.2",
    title:   "Polish & Fixes",
    items: [
      { type: "fixed", text: "Harvest popup now appears immediately on harvest, not on the next plant action" },
      { type: "fixed", text: "Shop cards show a green '✓ Bought!' flash to confirm purchases" },
      { type: "fixed", text: "Codex descriptions no longer truncate on mobile — tap to expand" },
      { type: "fixed", text: "Plant tooltip correctly shows accelerated stage and countdown during rain" },
      { type: "fixed", text: "Username hidden on mobile HUD to reduce crowding" },
      { type: "fixed", text: "Weather countdown on mobile shows minutes only" },
    ],
  },
  {
    version: "1.2.1",
    title:   "Bug Fixes & Balancing",
    items: [
      { type: "fixed",   text: "Progress no longer lost on page refresh — save recovered automatically if cloud write was in-flight" },
      { type: "fixed",   text: "Signing in after a guest session no longer overwrites your cloud progress" },
      { type: "fixed",   text: "Two devices on the same account now load the most recent save correctly" },
      { type: "fixed",   text: "Removed stray flower previews from Botany Lab tier cards" },
      { type: "changed", text: "Farm upgrade costs rebalanced" },
    ],
  },
  {
    version: "1.2.0",
    title:   "The Botany Update",
    items: [
      { type: "added",   text: "Botany Lab — convert harvested blooms into a seed of the next rarity" },
      { type: "added",   text: "Exalted rarity — 7 new flowers obtainable only through Botany" },
      { type: "added",   text: "20 new flowers across all rarities" },
      { type: "added",   text: "Purchasable shop slots — buy up to 12 flower slots independently of farm size" },
      { type: "added",   text: "Rectangular farm expansion — up to 9×6 via three new upgrade tiers" },
      { type: "added",   text: "Exalted added to Floral Codex with its own filter and breakdown column" },
      { type: "added",   text: "Leaderboard can now be sorted by codex completion percentage" },
      { type: "changed", text: "Shop countdown timer removed from HUD" },
    ],
  },
  {
    version: "1.1.2",
    title:   "Weather Tick Fix",
    items: [
      { type: "fixed", text: "Weather events now last longer and transition less frequently" },
      { type: "fixed", text: "More reliable weather tick timing via 15-minute cron interval" },
      { type: "added", text: "Client-side fallback advances weather immediately on page load if expired" },
      { type: "added", text: "Offline banner now greets you by name with a time-of-day message" },
    ],
  },
];

export const LATEST_CHANGELOG_VERSION = CHANGELOGS[0].version;

export const CHANGELOG_ITEM_ICONS: Record<ChangelogItemType, string> = {
  added:   "✨",
  fixed:   "🔧",
  changed: "🔄",
};
