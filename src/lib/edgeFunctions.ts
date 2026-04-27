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
  coins:      number;
  // grid intentionally omitted — client optimistic state owns the grid.
  // Mutations are assigned client-side and must not be overwritten by the DB grid.
  inventory:  GameState["inventory"];
  discovered: GameState["discovered"];
  mutation:   string | undefined;
  bonusCoins: number;
}

export interface PlantSeedResult {
  ok:        true;
  grid:      GameState["grid"];
  inventory: GameState["inventory"];
}

export interface ShopActionResult {
  ok:          true;
  coins:       number;
  shop:        GameState["shop"];
  inventory:   GameState["inventory"];
  fertilizers: GameState["fertilizers"];
}

export interface ApplyFertilizerResult {
  ok:          true;
  grid:        GameState["grid"];
  fertilizers: GameState["fertilizers"];
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
}

export interface BotanyResult {
  ok:              true;
  inventory:       GameState["inventory"];
  outputSpeciesIds: string[];
}

// ── Typed callers ─────────────────────────────────────────────────────────────

export async function edgeHarvest(row: number, col: number, clientMutation?: string): Promise<Omit<HarvestResult, "inventory">> {
  // Strip inventory from the merge delta. Each serialized harvest returns the DB
  // snapshot at that moment, which would overwrite optimistic flowers added by
  // subsequent harvests that haven't hit the server yet — causing the "count one
  // by one" effect. The client's optimistic inventory is correct; rollback handles
  // the failure case.
  const { inventory: _omit, ...delta } = await callEdge<HarvestResult>("harvest", { row, col, clientMutation });
  return delta;
}

export function edgeSyncShop(shop: GameState["shop"], lastShopReset: number) {
  return callEdge<{ ok: true }>("shop-action", { action: "sync", shop, lastShopReset });
}

export function edgePlantSeed(row: number, col: number, speciesId: string) {
  return callEdge<PlantSeedResult>("plant-seed", { row, col, speciesId });
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

export function edgeApplyFertilizer(row: number, col: number, fertType: string) {
  return callEdge<ApplyFertilizerResult>("apply-fertilizer", { row, col, fertType });
}

export function edgeUpgradeFarm() {
  return callEdge<UpgradeResult>("upgrade", { action: "farm" });
}

export function edgeUpgradeShopSlots() {
  return callEdge<UpgradeResult>("upgrade", { action: "shop_slots" });
}

export function edgeBotanyConvert(selections: { speciesId: string; mutation?: string }[]) {
  return callEdge<BotanyResult>("botany-convert", { action: "convert", selections });
}

export function edgeBotanyConvertAll(rarity: string) {
  return callEdge<BotanyResult>("botany-convert", { action: "convert_all", rarity });
}

// ── Marketplace ───────────────────────────────────────────────────────────────

export interface MarketplaceListResult {
  ok:        true;
  coins:     number;
  inventory: GameState["inventory"];
  listingId: string;
}

export interface MarketplaceUpgradeSlotsResult {
  ok:               true;
  coins:            number;
  marketplaceSlots: number;
}

export interface MarketplaceBuyResult {
  ok:         true;
  coins:      number;
  inventory:  GameState["inventory"];
  discovered: GameState["discovered"];
}

export interface MarketplaceCancelResult {
  ok:        true;
  inventory: GameState["inventory"];
}

export function edgeMarketplaceCreateListing(
  speciesId: string,
  mutation: string | undefined,
  askPrice: number,
) {
  return callEdge<MarketplaceListResult>("marketplace-list", {
    action: "create_listing",
    speciesId,
    mutation,
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
