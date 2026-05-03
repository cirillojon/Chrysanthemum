# Manual QA Checklist

Automated checks (lint, typecheck, 281 unit + contract tests, build) run in CI on every push.
This checklist covers behaviour that requires a real browser + live Supabase.

Run this before merging any release branch into `main`.

---

## A. Coins on Harvest

| # | Action | Expected |
|---|--------|----------|
| A1 | Harvest any flower manually (tap a bloomed plot) | Coin balance **does not change** |
| A2 | Harvest a **mutated** bloom (Golden, Frozen, etc.) manually | Coin balance still **does not change** |
| A3 | Sell that mutated bloom from the Inventory tab | Coins **do** increase by `sellValue × multiplier` |
| A4 | DevTools → Network → `harvest` edge function response | Body contains `ok: true`, **no** `bonusCoins`, **no** `coins` field |
| A5 | Supabase Table Editor → `game_saves` → watch `coins` column during a harvest | Column value **does not change** on harvest, only on sell |

---

## B. Harvest Bell — Off-Tab Popup

| # | Action | Expected |
|---|--------|----------|
| B1 | Place a Harvest Bell. Navigate to **Inventory** tab. Wait for a plant to bloom and be in range. | Harvest popup appears **on the Inventory tab** |
| B2 | Same setup, navigate to **Shop** tab | Popup appears on Shop tab |
| B3 | Same setup, navigate to **Social** tab | Popup appears on Social tab |
| B4 | Navigate back to Garden after the popup appeared off-tab | Garden grid correctly shows the plant is gone |
| B5 | Check Inventory tab | Bloom was added to inventory correctly |

---

## C. Harvest Bell — Continues Running Off-Tab

| # | Action | Expected |
|---|--------|----------|
| C1 | Set up a bell + bloomed plant. Navigate away from Garden. Wait 2–3 min. Return. | Bell harvested plants while off-tab; grid is cleared; inventory has blooms |
| C2 | DevTools → Network while on a non-garden tab | `harvest` edge calls fire even when Garden tab is not visible |
| C3 | Watch the **Blooms** badge on the Inventory tab icon | Badge increments when the bell fires off-tab |

---

## D. Auto-Planter — Continues Running Off-Tab

| # | Action | Expected |
|---|--------|----------|
| D1 | Set up an auto-planter with seeds in inventory. Navigate away. Wait 30 s. Return. | Plants were planted while off-tab; seed count in inventory decreased |
| D2 | Trigger a cron race (plant manually while planter is active) | No repeated `plant-seed` calls for already-occupied cells (check DevTools Network) |

---

## E. Profile Page — Real-Time Updates

| # | Action | Expected |
|---|--------|----------|
| E1 | Open your own profile (Social → Me) with a harvest bell and plants | Bell harvests and profile garden updates live every ~5 s without a page reload |
| E2 | From a **second account**, open the first account's profile | Profile updates when the first account's cron ticks (~30 s) |
| E3 | Watch a plant transition seed → sprout → bloom on the other account's profile | Stage advances every ~5 s between cron ticks (client-side simulation) |
| E4 | Bell harvest visible from second account | Profile shows the plot clearing after cron tick |

---

## F. Tab Switching / Mount Stability

| # | Action | Expected |
|---|--------|----------|
| F1 | Rapidly switch between all tabs | No crashes, no white screen, no stuck loading |
| F2 | Plant a seed on Garden tab, switch to Shop, return | Plant is still there with correct growth state |
| F3 | Open Seed Picker on Garden tab, switch tabs | Picker closes; app does not hang |
| F4 | Swipe between tabs while a harvest popup is showing | Popup persists across the swipe and auto-dismisses |

---

## G. Server Integrity (Supabase)

| # | Check | Expected |
|---|--------|----------|
| G1 | `action_log` rows for `harvest` actions | `result` column contains `{ ok: true }`, **no** `bonusCoins` or `newCoins` |
| G2 | `game_saves.coins` across a full session | Only changes on sell/buy, never on harvest |
| G3 | Place gear while a cron tick is in flight | Placement succeeds (CAS retry handles the race); gear appears in grid |

---

## H. Rollback Reliability — Sell All / Plant All (v2.2.5)

Throttle to **Slow 4G** (DevTools → Network → Throttling) for these.

### H1. Sell All — concurrent harvest preserved on failure

| # | Action | Expected |
|---|--------|----------|
| H1.1 | Have several blooms + a bloomed plant in the garden. Click **Sell All** on the Inventory > Blooms tab. While the `shop-action` POST is in flight, harvest the bloomed plant. Then block the `shop-action` URL (DevTools → Network → right-click → Block request URL) so it fails. | Sold blooms restored; coins back to original; **the freshly-harvested bloom remains in inventory** (was the bug). |
| H1.2 | Same as H1.1 but use the per-card **Sell** / **Sell All** buttons in `InventoryItemCard` (single bloom row) instead of the global Sell All. | Same outcome — concurrent harvest preserved. |

### H2. Plant All — failed plant doesn't wipe successful ones

| # | Action | Expected |
|---|--------|----------|
| H2.1 | Open the app in two tabs (same account). Empty plots in both. In tab 1, click **Plant All**. In tab 2, click **Plant All** within ~1 s. Watch tab 1's Network tab. | Some `plant-seed` calls return 200, some return 409 ("Save was modified by another action"). The plots that returned 200 **stay planted** in tab 1; only 409'd plots roll back. (Pre-fix: any single 409 wiped the entire batch.) |
| H2.2 | Same setup but harvest a bloomed plant in tab 1 mid-way through Plant All | Harvest is preserved — Plant All rollbacks don't clobber the new bloom. |

### H3. Plant All flicker — instant visual stays in place

| # | Action | Expected |
|---|--------|----------|
| H3.1 | Empty grid, ≥4 seeds. Throttle Slow 4G. Click **Plant All**. | All seeds appear in their plots **instantly** and stay there. **No flicker** — no plants disappearing then re-planting one at a time as `plant-seed` responses arrive. |
| H3.2 | DevTools Network during H3.1 | `plant-seed` POSTs fire one at a time (serialized). UI does not visibly change as each completes. |

### H4. "Plot already occupied" desync recovery

| # | Action | Expected |
|---|--------|----------|
| H4.1 | Spam Plant All on Slow 4G several times. If you see a 400 "Plot already occupied" in the console for a tile that *looks* empty, try clicking that tile and selecting a seed. | The tile self-heals via `reloadFromCloud` — a brief 400 in console, then the tile updates to show the real server state (either occupied with the actual plant, or genuinely empty and your seed plants). No stuck "can't plant here forever" state. |
| H4.2 | Two-tab repro: in tab 1, plant a seed at (0,0) and wait for confirmation. In tab 2 (without refreshing), click on (0,0) — it still looks empty in tab 2. Pick a seed. | Tab 2 logs one 400 in console, then the tile updates to show tab 1's plant. Subsequent clicks on other tiles in tab 2 work normally. |

### H5. Plant All visual + Collect All interaction (intentional behaviour)

| # | Action | Expected |
|---|--------|----------|
| H5.1 | Click **Collect All** (Harvest All), then immediately click **Plant All** | Plant All visually waits a moment for harvests to settle before planting. **This is intentional** — it prevents a rare flicker if a harvest fails. Don't file as a bug. |

---

## I. v2.3.0 — Shovel, Stage Stability & Fertilizer Guard

### I1. Shovel — required to dig up a growing plant

| # | Action | Expected |
|---|--------|----------|
| I1 | Plant a seed. Open tooltip. Have **no Shovel** in consumables. | "🥄 Need a Shovel to dig up" message shown; no remove button |
| I2 | Craft or buy a Shovel. Open tooltip on a growing plant. Click **🥄 Remove plant** → confirm. | Plot cleared, seed returned to inventory, shovel count decreases by 1 |
| I3 | Place a Garden Pin on a growing plant. Open tooltip with a Shovel present. | "📌 Remove Pin first to dig up" shown; shovel has no effect while pinned |
| I4 | Open tooltip on a **bloomed** plant. | No remove / dig-up section visible at all (harvest section shown instead) |
| I5 | DevTools → Network: block `remove-plant` after clicking confirm. | Plant and shovel both restored to pre-click state (rollback works) |

---

### I2. Stage Stability — no revert when gear multiplier changes

| # | Action | Expected |
|---|--------|----------|
| I6 | Place a 3× Grow Lamp or Mythic Sprinkler next to a plant that is very close to bloom (< 5 s remaining). Watch it cross into bloom stage. Immediately remove the gear. | Stage stays **bloom** — does not revert to sprout or seed |
| I7 | Same as I6 but remove the gear **while the plant is still a sprout** with high multiplier. | Stage stays **sprout** — does not revert to seed |
| I8 | DevTools Console: look for any errors during I6 / I7 | No errors, no warnings about unexpected stage transitions |

---

### I3. Fertilizer — cannot be applied to a bloomed plant

| # | Action | Expected |
|---|--------|----------|
| I9 | Open tooltip on a **bloomed** plant with fertilizer in inventory. | No fertilizer section shown (guarded by bloom state) |
| I10 | Open tooltip on a **sprout**, open fertilizer picker, wait for the plant to bloom before clicking. | Fertilizer picker disappears as soon as plant crosses into bloom |
| I11 | DevTools → Network: manually POST to `apply-fertilizer` with a `row`/`col` pointing at a bloomed plant. | Server returns **400** `"Cannot apply fertilizer to a bloomed plant"` |

---

### I4. Mutation Vials — blocked on blooms that already have a mutation

| # | Action | Expected |
|---|--------|----------|
| I12 | Have a **shocked** bloom (or any mutated bloom). Open its tooltip with a Frost Vial in inventory. | Frost Vial (and all other mutation vials) **do not appear** in the consumable picker |
| I13 | Same bloom — have a **Purity Vial** in inventory. | Purity Vial **does** appear and is usable |
| I14 | Apply Purity Vial to clear the mutation. Re-open tooltip with a mutation vial. | Mutation vial now **appears** and can be applied |
| I15 | DevTools → Network: manually POST to `use-consumable` with a mutation vial targeting a bloomed plant that has a mutation. | Server returns **400** `"This bloom already has a mutation — use a Purity Vial to remove it first"` |

---

## J. Sell — v2.3.1 Flowers Award Correct Coins

`shop-action` had missing entries for all v2.3.1 flowers — they were removed from inventory but awarded 0 coins.

| # | Action | Expected |
|---|--------|----------|
| J1 | Sell a **Galebloom** (legendary, 4,000 sell value) from Inventory | Coins increase by **4,000** (or × mutation multiplier); bloom removed |
| J2 | Sell any other v2.3.1 flower (e.g. Infernopetal, Anchorweed, Stormcap) | Coins increase by the correct sell value shown in the inventory card |
| J3 | DevTools → Network → `shop-action` response for a v2.3.1 sell | `coins` field in response equals pre-sell coins + earned amount (not equal to pre-sell coins) |
| J4 | Sell a v2.3.1 flower with a mutation (e.g. Golden Galebloom) | Coins increase by `sellValue × mutationMultiplier`; matches the "X 🟡 total" shown on the card |

---

## K. Weather Mutation Rates (v2.3.1 Balance)

All weather mutation rates reduced by ~1/3. Mutations should still occur but feel rarer.

| # | Action | Expected |
|---|--------|----------|
| K1 | Wait through a full **Rain** event (20 min) with several bloomed plants | Some plants receive Wet mutation; roughly 1-in-4 chance per plant (down from ~1-in-3) |
| K2 | Wait through a full **Heatwave** or **Cold Front** (15 min) | Scorched / Frozen mutations appear occasionally; roughly ~11% per plant |
| K3 | Wait through a **Tornado** (10 min) | Windstruck mutations apply to some bloomed plants; roughly ~23% per plant |
| K4 | Wait through **Golden Hour**, **Prismatic Skies**, or **Star Shower** | Respective mutations appear on ~5% of bloomed plants |
| K5 | Let a plant bloom overnight (10 hr) | Occasional passive Moonlit mutation (~3.5% chance over the night) |
| K6 | DevTools Console: no JS errors or warnings during any weather event | Clean console throughout |

---

## L. Craft Duration Display

`formatDurationLabel` previously rounded 1m 30s → "2 min". Now shows exact minutes + seconds and hours + minutes.

| # | Action | Expected |
|---|--------|----------|
| L1 | Open crafting recipe for any **Uncommon** gear (e.g. Fan I, Composter I) | Duration shows **"1m 30s"** — not "2 min" |
| L2 | Open crafting recipe for any **Rare** gear (e.g. Sprinkler I) | Duration shows **"5 min"** |
| L3 | Open crafting recipe for any **Legendary** gear (e.g. Sprinkler II) | Duration shows **"25 min"** |
| L4 | Open crafting recipe for any **Mythic** gear (e.g. Sprinkler III) | Duration shows **"1 hr"** |
| L5 | Open crafting recipe for any **Exalted** gear (e.g. Sprinkler IV) | Duration shows **"3 hr"** |
| L6 | Open crafting recipe for any **Prismatic** gear (e.g. Sprinkler V) | Duration shows **"6 hr"** |
| L7 | Craft a quantity > 1 (e.g. 3× Fan I) | Duration shows e.g. **"4m 30s"** (3 × 1m 30s); per-item breakdown shows "1m 30s × 3" |

---

## M. Bloom Reveal — Unknown Seeds Show Species at Bloom

Previously, seeds planted before their species was discovered stayed as "???" even at bloom stage.

| # | Action | Expected |
|---|--------|----------|
| M1 | Plant a seed whose species is **not** in your codex. Let it grow to bloom. Open the plot tooltip. | Tooltip shows the **real species name**, emoji, rarity badge, and type badges — not "???" |
| M2 | Same plant — check before bloom (seed or sprout stage) | Tooltip still shows **"???"** and seed/sprout emoji (species only revealed at bloom) |
| M3 | Hover the bloomed plot while it shows the real name. Harvest it. Re-plant the same seed. | During re-grow the species is now in the codex, so it remains identified at all stages |
| M4 | Use a **Magnifying Glass** on an unknown seed/sprout | Still works as before — reveals species before bloom |
| M5 | Open the consumable picker on an unknown bloomed plant | Magnifying Glass **does not appear** (already revealed at bloom; no wasted glass) |

---

## N. Mutation Sell Multipliers

Multipliers synced between client and server. Key values: Golden 4×, Rainbow 5×, Moonlit 2.5×, Shocked 2.5×, Frozen/Scorched/Giant 2×, Wet 1.1×, Windstruck 0.7×.

| # | Action | Expected |
|---|--------|----------|
| N1 | Sell a **Golden** bloom (any species) | Coins increase by `sellValue × 4` |
| N2 | Sell a **Rainbow** bloom | Coins increase by `sellValue × 5` |
| N3 | Sell a **Shocked** bloom | Coins increase by `sellValue × 2.5` |
| N4 | Sell a **Wet** bloom | Coins increase by `sellValue × 1.1` |
| N5 | Sell a **Windstruck** bloom | Coins increase by `sellValue × 0.7` (less than base) |
| N6 | DevTools → Network → `shop-action` response | `coins` field matches pre-sell coins + expected amount for each mutation tier |

---

## O. Weather Time Gating

Golden Hour, Prismatic Skies, and Star Shower are now gated to correct Eastern Time windows (server extracts ET hour directly — no longer uses a hardcoded default).

| # | Action | Expected |
|---|--------|----------|
| O1 | Check weather forecast between **5–7 AM ET** or **5–9 PM ET** | **Golden Hour** may appear in the forecast; Prismatic Skies and Star Shower do not |
| O2 | Check forecast between **7 AM–5 PM ET** | **Prismatic Skies** may appear; Golden Hour and Star Shower do not |
| O3 | Check forecast between **9 PM–5 AM ET** | **Star Shower** may appear; Golden Hour and Prismatic Skies do not |
| O4 | Wait for a Golden Hour event to fire | Occurs only during a dawn, sunset, or dusk period |
| O5 | DevTools Console during any weather advance | No errors; weather type matches the current ET time window |

---

## P. Fan — Wet Strip & Windstruck

Fan now only strips the **Wet** mutation (not all mutations). Windstruck application uses a separate lower rate.

| # | Action | Expected |
|---|--------|----------|
| P1 | Place a Fan next to a **Wet** bloomed plant | Wet mutation is stripped over time (50–80%/hr depending on tier); plant becomes unmutated |
| P2 | Place a Fan next to a **Scorched** (or any non-Wet, non-Windstruck) bloomed plant | Fan does **nothing** — mutation stays |
| P3 | Place a Fan next to an **unmutated** bloomed plant | Windstruck may appear at a low rate (~15%/hr); much rarer than Wet stripping |
| P4 | Place a Fan next to a **Windstruck** plant | Fan does nothing — already Windstruck |
| P5 | Navigate away. Return after 10+ minutes with a Fan active on a Wet plant | Wet was stripped during offline tick (server processed it) |

---

## Q. Sprinklers & Mutation Sprinklers — Offline

Sprinklers now run during offline cron ticks. Scarecrow blocks all gear mutations; Aegis blocks weather only.

| # | Action | Expected |
|---|--------|----------|
| Q1 | Place a **regular Sprinkler** next to unmutated blooms. Navigate away for 30+ min. Return. | Some blooms have the **Wet** mutation |
| Q2 | Place a **Heater** (Scorched) or **Cooler** (Frozen) next to unmutated blooms. Navigate away. Return. | Some blooms carry the sprinkler's mutation |
| Q3 | Place a **Generator** (Shocked) next to Wet blooms. Navigate away. Return. | Some Wet blooms upgraded to **Shocked** |
| Q4 | Place a **Scarecrow** between an active mutation sprinkler and its target blooms. Navigate away. Return. | Blooms covered by the Scarecrow have **no new mutations** from the sprinkler |
| Q5 | Place an **Aegis** between a mutation sprinkler and target blooms. Navigate away. Return. | Blooms covered by the Aegis **still receive** the sprinkler mutation (Aegis only blocks weather) |
| Q6 | Place a **Scarecrow** during a Rain event. Navigate away. Return. | Blooms covered by the Scarecrow have **no Wet mutation** from rain |
| Q7 | Place an **Aegis** during a Rain event. Navigate away. Return. | Blooms covered by the Aegis have **no Wet mutation** from rain (Aegis blocks weather) |

---

## R. Marketplace — Expired Listing Mail-Back

Expired listings are now delivered via the mailbox instead of silently patching `game_saves` inventory.

| # | Action | Expected |
|---|--------|----------|
| R1 | Let a marketplace listing expire (or trigger the cron manually via GitHub Actions → workflow_dispatch) | Seller receives a "Listing Expired" mail with the correct item kind, species, mutation, and is_seed |
| R2 | Open the expired-listing mail and press Claim | Item is added to the seller's inventory (flower/seed/gear/fertilizer/consumable as appropriate) |
| R3 | Verify a fertilizer listing expires | Mail kind is `fertilizer`; claiming it increments the correct fertilizer type |
| R4 | Verify a gear listing expires | Mail kind is `gear`; claiming it adds the gear to gear_inventory |

---

## S. v2.3.2 — Harvest v2.3.1 Flowers (#175)

`FLOWER_GROWTH_TIMES` in the harvest edge function was missing all 38 v2.3.1 species, causing a 400 "Unknown species" error.

| # | Action | Expected |
|---|--------|----------|
| S1 | Harvest any v2.3.1 flower (e.g. **Galebloom**, **Infernopetal**, **Cloudveil**) manually or via bell | Harvest succeeds; bloom added to inventory; **no** "Unknown species" 400 in console |
| S2 | Harvest a mutated v2.3.1 flower (e.g. Golden Galebloom) | Harvest succeeds with the correct mutation applied to the inventory bloom |
| S3 | DevTools → Network → `harvest` response for a v2.3.1 flower | Response is `{ ok: true }` — no error body |

---

## T. v2.3.2 — Composter Offline Tick (#158)

Composter logic was previously client-side only. It now also runs in `tick-offline-gardens`.

| # | Action | Expected |
|---|--------|----------|
| T1 | Place a Composter next to several seeds. Navigate away for 30+ min. Return. | Some of the plots that bloomed while away have fertilizer applied (check plot tooltips) |
| T2 | Place a Composter I (Uncommon, 3×3 range) next to a bloom that blooms offline. Return. | Fertilizer roll occurred; rarity matches Uncommon tier (Common/Uncommon fertilizers) |
| T3 | Place a Composter III (Legendary, Diamond range) offline. | Range covers expected diamond-shaped cells; fertilizer is applied within range |
| T4 | Place a Composter with its `maxStorage` already full (10 charges). Navigate away. | No additional fertilizer piles up beyond the storage cap after plants bloom offline |

---

## U. v2.3.2 — Plot Tooltip Consumable Filter (#177 / #173)

Speed boosts (Forge Haste) and seed pouches should never appear in the per-plot consumable picker.

| # | Action | Expected |
|---|--------|----------|
| U1 | Open a plot tooltip (growing or bloomed plant). Have **Forge Haste** consumables in inventory. | Forge Haste does **not** appear in the consumable list |
| U2 | Same tooltip with any **Seed Pouch** in inventory. | Seed Pouch does **not** appear |
| U3 | Open the tooltip with Frost Vials, Fertilizer, etc. in inventory. | Those consumables **do** appear (filter only removes speed boosts and seed pouches) |
| U4 | Tooltip with many consumables (10+) visible. | Tooltip scrolls vertically; bottom items are accessible; tooltip does not extend off-screen |

---

## V. v2.3.2 — Shop Restock Flicker (#172)

A stale server response was clobbering the client's freshly-restocked shop list, causing a visible flicker back to the old items.

| # | Action | Expected |
|---|--------|----------|
| V1 | Wait for the seed shop to restock (or use the dev panel to force a restock). | Shop updates to new items **without** briefly showing the old shop list |
| V2 | Wait for the supply shop to restock. | Supply shop updates cleanly — **no flicker** back to the pre-restock gear/consumable list |
| V3 | Throttle to Slow 4G. Trigger a shop restock. Watch DevTools Network. | Even with slow responses arriving after the client reset, the new shop list holds |

---

## W. v2.3.2 — Balance Scale Rework (#181)

Range is now fixed at 1 cell each side for all tiers. Boost/slow values increased per tier: Scale I 4×/0.5×, Scale II 6×/0.33×, Scale III 8×/0.25×.

| # | Action | Expected |
|---|--------|----------|
| W1 | Place a **Balance Scale I** with one plant to its left and one to its right. Watch growth rates. | Boosted side grows **4×** faster than base; slowed side grows at **0.5×** base speed |
| W2 | Wait for the hour to flip (or use dev panel to advance time). | The boost and slow **swap sides** |
| W3 | Place a **Balance Scale II** and compare growth rates to Scale I. | Boosted side visibly faster (**6×**); slowed side more penalized (**0.33×**) than Scale I |
| W4 | Place a **Balance Scale III** and compare. | Boosted side at **8×**; slowed side at **0.25×** |
| W5 | Check gear tooltip descriptions for all three tiers. | Each description shows the correct boost and slow values for that tier |

---

## X. v2.3.3 — Heirloom Charm Fixes

Seed now returned to inventory on harvest; duplicate bloom row fixed; seed toast fires; tooltip hides charm if already applied.

| # | Action | Expected |
|---|--------|----------|
| X1 | Apply a Heirloom Charm to a growing plant, wait for it to bloom, then harvest it. Check inventory. | Inventory gains **both** a bloom entry **and** a seed entry for that species in one harvest |
| X2 | Harvest the same species again without a charm. | Only one bloom row exists — no duplicate row created |
| X3 | Harvest a plant with Heirloom Charm active. Watch for toast notifications. | Two toasts appear: one for the bloom (with rarity colour) and a separate **green "+1 Seed"** toast |
| X4 | Open the plot tooltip on a plant that already has a Heirloom Charm applied. | **Heirloom Charm is not listed** in the consumable picker — it is hidden once `heirloomActive` is set |
| X5 | Check the Heirloom Charm I recipe in the Craft tab. | Recipe requires **4× Fairy Essence** + 4× Stellar Essence (not Grove Essence) |

---

## Y. v2.3.3 — Inventory Search Bar & Header Counts

| # | Action | Expected |
|---|--------|----------|
| Y1 | Open Inventory → Seeds tab. Type part of a flower name in the search bar. | List filters to matching seeds only; non-matching seeds are hidden |
| Y2 | Clear the search. Switch to Blooms tab. Search for a species. | Blooms tab has its own independent search; results filter correctly |
| Y3 | Search for a term with no matches on any tab. | Shows an empty state (no crash, no stale results) |
| Y4 | Open Inventory with consumables and essences in your inventory. Check the header line. | Header reads something like **"124 seeds · 46 blooms · 145 supplies · 3 consumables · 12 essences"** |

---

## Z. v2.3.3 — Codex Badge Cross-Device Sync

| # | Action | Expected |
|---|--------|----------|
| Z1 | Discover a new species on Device A. Open the Codex and expand that species card. | Badge clears on Device A |
| Z2 | Open the same account on Device B (fresh load or tab refresh). | **No badge** for the already-acknowledged species — badge does not reappear |
| Z3 | Sign in on a brand-new device that has never loaded this account. | No flood of "newly discovered" badges for previously known species — all existing discoveries are pre-acknowledged |
| Z4 | Discover a new species (don't open the card yet). Open the app on another device. | The **new** species still shows a badge on both devices until the card is opened |

---

## AA. v2.3.4 — Lawnmower, Aqueduct & Balance Scale Crafting

Server-side recipe tables in `craft-start` and `craft-cancel` were missing all three gear families — attempts to craft them returned a 400 error.

| # | Action | Expected |
|---|--------|----------|
| AA1 | Open Craft tab → Gear. Start a **Lawnmower I** craft (requires Grove + Solar essence). | Craft queues successfully and completes after the timer |
| AA2 | Upgrade Lawnmower I → II → III via the craft queue. | Each upgrade tier accepts the previous tier as ingredient and produces the next |
| AA3 | Start an **Aqueduct I** craft (requires Tide + Zephyr essence). | Craft queues and completes correctly |
| AA4 | Start a **Balance Scale I** craft (requires Arcane + Solar + Shadow essence). | Craft queues and completes correctly |
| AA5 | Cancel an in-progress Lawnmower, Aqueduct, or Balance Scale craft. | Ingredients are refunded correctly |

---

## AB. v2.3.4 — Gear Expiry Toast Stacks With Other Notifications (#191)

Gear expiry banner was rendered outside the shared notification stack, causing it to overlap shop restock and craft completion banners.

| # | Action | Expected |
|---|--------|----------|
| AB1 | Let a piece of gear expire while the seed shop restocks at the same time. | Both the gear expiry banner and shop restock banner appear **stacked vertically** — no overlap |
| AB2 | Let gear expire while a craft completes. | Gear expiry and craft completion banners stack cleanly in the shared container |
| AB3 | Trigger gear expiry on its own (no other notifications). | Gear expiry banner appears at the bottom centre, same position as other banners |

---

## AC. v2.3.5 — Toast Notifications

Loss/gain pill toasts now fire for seeds, blooms, gear, consumables, fertilizer, and crafting costs.

| # | Action | Expected |
|---|--------|----------|
| AC1 | Plant a seed manually (tap plot → pick seed) | A **red "-1 [Seed Name] Seed"** toast appears at the bottom of the screen |
| AC2 | Plant a seed whose species is undiscovered | Toast shows **"-1 ❓ ??? Seed"** in red |
| AC3 | Click **Plant All** with several seeds in inventory | One red loss toast per species — toasts stack and accumulate count (e.g. "-3 🌸 Rose Seed") |
| AC4 | Harvest a bloomed plant | A loss toast fires for the bloom (with rarity colour); **no** extra gain toast |
| AC5 | Place a piece of gear on a plot | A red loss toast shows the gear emoji, name, and rarity colour |
| AC6 | Use a Shovel to dig up a growing plant | A red **"-1 🥄 Shovel"** toast appears |
| AC7 | Apply a consumable from the plot tooltip (e.g. Frost Vial) | A red loss toast for that consumable appears |
| AC8 | Buy a seed from the Shop | A **green "+1 [Seed Name] Seed"** toast appears |
| AC9 | Click **Buy All** for a seed in the Shop | Toast shows the total quantity purchased (e.g. "+5 🌸 Rose Seed") |
| AC10 | Buy an item from the Supply Shop (fertilizer, gear, or consumable) | A green gain toast appears with the correct emoji and label |
| AC11 | Craft a gear item in the Craft tab | Red loss toasts fire for each essence spent; a gain toast fires for the crafted item |
| AC12 | Multiple rapid actions of the same type (e.g. Plant All 3 of the same seed) | Toasts **accumulate** into a single pill with the combined count rather than spawning duplicates |

---

## AD. v2.3.5 — Balance: Vials & Heirloom Charms Rarity Nerf

Vials and Heirloom Charms now require the plant's rarity to be **strictly below** the consumable's tier (same-rarity no longer allowed).

| # | Action | Expected |
|---|--------|----------|
| AD1 | Open a plot tooltip on a **Rare** plant with a **Rare (Tier I)** Frost Vial in inventory | Frost Vial **does not appear** in the consumable list |
| AD2 | Same Rare plant with a **Legendary (Tier II)** Frost Vial | Frost Vial **does** appear and can be applied |
| AD3 | Open a tooltip on a **Rare** bloom with a **Rare (Tier I)** Heirloom Charm | Heirloom Charm **does not appear** |
| AD4 | Same bloom with a **Legendary (Tier II)** Heirloom Charm | Heirloom Charm **does** appear and can be applied |
| AD5 | Check the description of any Tier I vial (e.g. Frost Vial I) in the Craft tab | Description reads **"Uncommon or lower"** (not "Rare or lower") |
| AD6 | DevTools → Network: POST to `use-consumable` with a Tier I Rare vial targeting a Rare plant | Server returns **400** with "can't reach" error |

---

## AE. v2.3.5 — Balance: Seed Pouch Upgrade Cost

Upgrading any Seed Pouch (base or typed) now costs **4×** of the previous tier instead of 3×.

| # | Action | Expected |
|---|--------|----------|
| AE1 | Open Craft tab → Consumables → **Seed Pouch II** recipe | Cost shows **4× Seed Pouch I** (not 3×) |
| AE2 | Attempt to craft Seed Pouch II with only 3× Seed Pouch I in inventory | Craft button is **disabled** / server rejects the attempt |
| AE3 | Check any **typed** Seed Pouch upgrade (e.g. Blaze Seed Pouch II) | Cost is also **4×** of the previous tier |

---

## Automated Gates (CI — must pass before merge)

```
npm run typecheck
npm run lint
npm run test:ci
npm run build
```
