import { supabase } from "./supabase";
import type { GameState } from "../store/gameStore";

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

// ── Base fetch wrapper ────────────────────────────────────────────────────────

async function callEdge<T>(name: string, body: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${BASE_URL}/${name}`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error ?? "Edge function error");
  return json as T;
}

// ── Return types ──────────────────────────────────────────────────────────────
// Each function returns only the fields it modified — merged into state on reconcile.

export interface HarvestResult {
  ok:         true;
  // coins intentionally omitted — coins never change on harvest (only on sell).
  // grid intentionally omitted — client optimistic state owns the grid.
  inventory:  GameState["inventory"];
  discovered: GameState["discovered"];
  mutation:   string | undefined;
  serverUpdatedAt: string;
}

export interface SellAllResult {
  ok:          true;
  coins:       number;
  inventory:   GameState["inventory"];
  serverUpdatedAt: string;
}

export interface PlantSeedResult {
  ok:        true;
  grid:      GameState["grid"];
  inventory: GameState["inventory"];
  serverUpdatedAt: string;
}

export interface ShopActionResult {
  ok:          true;
  coins:       number;
  shop:        GameState["shop"];
  inventory:   GameState["inventory"];
  fertilizers: GameState["fertilizers"];
  serverUpdatedAt: string;
}

export interface ApplyFertilizerResult {
  ok:          true;
  grid:        GameState["grid"];
  fertilizers: GameState["fertilizers"];
  serverUpdatedAt: string;
}

export interface UpgradeResult {
  ok:         true;
  coins:      number;
  // farm upgrade fields
  farm_size?: number;
  farm_rows?: number;
  grid?:      GameState["grid"];
  // shop slot upgrade fields
  shop_slots?: number;
  shop?:       GameState["shop"];
  serverUpdatedAt: string;
}

export interface BotanyResult {
  ok:              true;
  inventory:       GameState["inventory"];
  outputSpeciesIds: string[];
  serverUpdatedAt: string;
}

// ── Typed callers ─────────────────────────────────────────────────────────────

export async function edgeHarvest(row: number, col: number): Promise<Omit<HarvestResult, "inventory">> {
  // Strip inventory from the merge delta. Each serialized harvest returns the DB
  // snapshot at that moment, which would overwrite optimistic flowers added by
  // subsequent harvests that haven't hit the server yet — causing the "count one
  // by one" effect. The client's optimistic inventory is correct; rollback handles
  // the failure case.
  const { inventory: _omit, ...delta } = await callEdge<HarvestResult>("harvest", { row, col });
  return delta;
}

export function edgeSyncShop(shop: GameState["shop"], lastShopReset: number) {
  return callEdge<{ ok: true }>("shop-action", { action: "sync", shop, lastShopReset });
}

export function edgePlantSeed(row: number, col: number, speciesId: string) {
  return callEdge<PlantSeedResult>("plant-seed", { row, col, speciesId });
}

export function edgePlantBloom(row: number, col: number, speciesId: string, mutation?: string) {
  return callEdge<PlantSeedResult>("plant-bloom", { row, col, speciesId, mutation });
}

export interface RemovePlantResult {
  ok:        true;
  grid:      GameState["grid"];
  inventory: GameState["inventory"];
  serverUpdatedAt: string;
}

export function edgeRemovePlant(row: number, col: number) {
  return callEdge<RemovePlantResult>("remove-plant", { row, col });
}

export function edgeBuyFlower(speciesId: string, buyAll = false) {
  return callEdge<ShopActionResult>("shop-action", {
    action: buyAll ? "buy_all" : "buy",
    speciesId,
  });
}

export function edgeBuyFertilizer(fertType: string, buyAll = false) {
  return callEdge<ShopActionResult>("shop-action", {
    action:   buyAll ? "buy_all" : "buy",
    fertType,
  });
}

export function edgeSellFlower(speciesId: string, mutation: string | undefined, quantity = 1) {
  return callEdge<ShopActionResult>("shop-action", {
    action: "sell",
    speciesId,
    mutation,
    quantity,
  });
}

/** Sell all blooms in a single atomic server write — avoids the partial-failure
 *  rollback bug from N sequential edgeSellFlower calls. */
export function edgeSellAll(items: { speciesId: string; mutation?: string; quantity: number }[]) {
  return callEdge<SellAllResult>("shop-action", { action: "sell_all", items });
}

export function edgeApplyFertilizer(row: number, col: number, fertType: string) {
  return callEdge<ApplyFertilizerResult>("apply-fertilizer", { row, col, fertType });
}

export function edgeUpgradeFarm() {
  return callEdge<UpgradeResult>("upgrade", { action: "farm" });
}

export function edgeUpgradeShopSlots() {
  return callEdge<UpgradeResult>("upgrade", { action: "shop_slots" });
}

export function edgeUpgradeSupplySlots() {
  return callEdge<UpgradeResult>("upgrade", { action: "supply_slots" });
}

// ── Gear actions ──────────────────────────────────────────────────────────────

export interface GearActionResult {
  ok:            true;
  grid:          GameState["grid"];
  gearInventory?: GameState["gearInventory"];
  fertilizers?:  GameState["fertilizers"];
  serverUpdatedAt: string;
}

export function edgePlaceGear(row: number, col: number, gearType: string, direction?: string) {
  return callEdge<GearActionResult>("gear-action", { action: "place", row, col, gearType, direction });
}

export function edgeRemoveGear(row: number, col: number) {
  return callEdge<GearActionResult>("gear-action", { action: "remove", row, col });
}

export function edgeSetFanDirection(row: number, col: number, direction: string) {
  return callEdge<GearActionResult>("gear-action", { action: "set_direction", row, col, direction });
}

export function edgeCollectFromComposter(row: number, col: number) {
  return callEdge<GearActionResult>("gear-action", { action: "collect", row, col });
}

// ── Supply shop actions ───────────────────────────────────────────────────────

export interface SupplyBuyResult {
  ok:            true;
  coins:         number;
  supplyShop:    GameState["supplyShop"];
  fertilizers:   GameState["fertilizers"];
  gearInventory: GameState["gearInventory"];
  serverUpdatedAt: string;
}

export function edgeBuyFromSupplyShop(slotId: string) {
  return callEdge<SupplyBuyResult>("supply-action", { action: "buy", slotId });
}

export function edgeSyncSupplyShop(supplyShop: GameState["supplyShop"], lastSupplyReset: number) {
  return callEdge<{ ok: true }>("supply-action", { action: "sync", supplyShop, lastSupplyReset });
}

export function edgeBotanyConvert(selections: { speciesId: string; mutation?: string }[]) {
  return callEdge<BotanyResult>("botany-convert", { action: "convert", selections });
}

export function edgeBotanyConvertAll(rarity: string) {
  return callEdge<BotanyResult>("botany-convert", { action: "convert_all", rarity });
}

// ── Gifting ───────────────────────────────────────────────────────────────────

export interface SendGiftResult {
  ok:        true;
  inventory: GameState["inventory"];
  serverUpdatedAt: string;
}

export interface ClaimGiftResult {
  ok:         true;
  inventory:  GameState["inventory"];
  discovered: GameState["discovered"];
  serverUpdatedAt: string;
}

export function edgeSendGift(
  receiverId: string,
  speciesId:  string,
  mutation:   string | undefined,
  message:    string | undefined,
) {
  return callEdge<SendGiftResult>("send-gift", { receiverId, speciesId, mutation, message });
}

export function edgeClaimGift(giftId: string) {
  return callEdge<ClaimGiftResult>("claim-gift", { giftId });
}

// ── Marketplace ───────────────────────────────────────────────────────────────

export interface MarketplaceListResult {
  ok:             true;
  coins:          number;
  inventory:      GameState["inventory"];
  fertilizers?:   GameState["fertilizers"];
  gearInventory?: GameState["gearInventory"];
  listingId:      string;
  serverUpdatedAt: string;
}

export interface MarketplaceUpgradeSlotsResult {
  ok:               true;
  coins:            number;
  marketplaceSlots: number;
  serverUpdatedAt:  string;
}

export interface MarketplaceBuyResult {
  ok:    true;
  coins: number;
  // Item is delivered via mailbox — no direct inventory update
  serverUpdatedAt: string;
}

export interface ClaimMailResult {
  ok:             true;
  kind:           "coins" | "flower" | "seed" | "fertilizer" | "gear";
  coins:          number;
  inventory:      GameState["inventory"];
  fertilizers:    GameState["fertilizers"];
  gearInventory:  GameState["gearInventory"];
  discovered:     GameState["discovered"];
  alreadyClaimed?: boolean;
  serverUpdatedAt: string;
}

export interface MarketplaceCancelResult {
  ok:             true;
  inventory:      GameState["inventory"];
  fertilizers?:   GameState["fertilizers"];
  gearInventory?: GameState["gearInventory"];
  serverUpdatedAt: string;
}

export function edgeMarketplaceCreateListing(
  speciesId: string,
  mutation: string | undefined,
  askPrice: number,
  isSeed = false,
) {
  return callEdge<MarketplaceListResult>("marketplace-list", {
    action: "create_listing",
    speciesId,
    mutation,
    askPrice,
    isSeed,
  });
}

export function edgeMarketplaceCreateFertilizerListing(
  fertilizerType: string,
  askPrice: number,
) {
  return callEdge<MarketplaceListResult>("marketplace-list", {
    action:         "create_listing",
    isFertilizer:   true,
    fertilizerType,
    askPrice,
  });
}

export function edgeMarketplaceCreateGearListing(
  gearType: string,
  askPrice: number,
) {
  return callEdge<MarketplaceListResult>("marketplace-list", {
    action:   "create_listing",
    isGear:   true,
    gearType,
    askPrice,
  });
}

export function edgeMarketplaceUpgradeSlots() {
  return callEdge<MarketplaceUpgradeSlotsResult>("marketplace-list", {
    action: "upgrade_slots",
  });
}

export function edgeMarketplaceBuy(listingId: string) {
  return callEdge<MarketplaceBuyResult>("marketplace-buy", { listingId });
}

export function edgeMarketplaceCancel(listingId: string) {
  return callEdge<MarketplaceCancelResult>("marketplace-cancel", { listingId });
}

export function edgeClaimMail(mailId: string) {
  return callEdge<ClaimMailResult>("claim-mail", { mailId });
}

// ── Infuser ───────────────────────────────────────────────────────────────────

export interface ApplyInfuserResult {
  ok:              true;
  grid:            GameState["grid"];
  infusers:        GameState["infusers"];
  serverUpdatedAt: string;
}

export function edgeApplyInfuser(row: number, col: number) {
  return callEdge<ApplyInfuserResult>("apply-infuser", { row, col });
}

// ── Alchemy ───────────────────────────────────────────────────────────────────

export interface AlchemySacrificeResult {
  ok:              true;
  inventory:       GameState["inventory"];
  essences:        GameState["essences"];
  serverUpdatedAt: string;
}

export function edgeAlchemySacrifice(
  sacrifices: { speciesId: string; mutation?: string; quantity: number }[]
) {
  return callEdge<AlchemySacrificeResult>("alchemy-sacrifice", { sacrifices });
}

export interface CraftUniversalResult {
  ok:              true;
  essences:        GameState["essences"];
  serverUpdatedAt: string;
}

export function edgeCraftUniversalEssence(quantity: number) {
  return callEdge<CraftUniversalResult>("craft-universal-essence", { quantity });
}

export interface AlchemyCraftResult {
  ok:              true;
  essences:        GameState["essences"];
  consumables:     GameState["consumables"];
  infusers:        GameState["infusers"];
  serverUpdatedAt: string;
}

export function edgeAlchemyCraft(
  craftType: "consumable" | "infuser",
  id: string,
) {
  return callEdge<AlchemyCraftResult>("alchemy-craft", { craftType, id });
}

// ── Consumable usage ──────────────────────────────────────────────────────────

export interface UseConsumableResult {
  ok:              true;
  grid?:           GameState["grid"];
  consumables:     GameState["consumables"];
  inventory?:      GameState["inventory"];   // returned when supply shop refreshed
  supplyShop?:     GameState["supplyShop"];
  lastWindShearUsed?: number;
  lastEclipseTonic?:  string;
  serverUpdatedAt: string;
}

/** Apply a plant-targeting consumable (Bloom Burst, vials, Heirloom Charm) */
export function edgeApplyPlantConsumable(row: number, col: number, consumableId: string) {
  return callEdge<UseConsumableResult>("use-consumable", { action: "apply_to_plant", row, col, consumableId });
}

/** Use Eclipse Tonic — advances all garden plants by advanceHours */
export function edgeUseEclipseTonic(consumableId: string) {
  return callEdge<UseConsumableResult>("use-consumable", { action: "eclipse_tonic", consumableId });
}

/** Use Wind Shear — refreshes supply shop bypassing cooldown */
export function edgeUseWindShear() {
  return callEdge<UseConsumableResult>("use-consumable", { action: "wind_shear", consumableId: "wind_shear" });
}

/** Use Slot Lock — locks a supply shop slot through the next refresh */
export function edgeUseSlotLock(slotId: string) {
  return callEdge<UseConsumableResult>("use-consumable", { action: "slot_lock", consumableId: "slot_lock", slotId });
}

