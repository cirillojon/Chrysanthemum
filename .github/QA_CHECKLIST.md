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

## Automated Gates (CI — must pass before merge)

```
npm run typecheck   # 0 errors
npm run lint        # 0 warnings
npm run test:ci     # all tests green
npm run build       # clean Vite build
```
