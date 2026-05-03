import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { WEATHER, WEATHER_LIST } from "../data/weather";
import type { WeatherType } from "../data/weather";
import { FLOWERS, MUTATIONS } from "../data/flowers";
import type { MutationType } from "../data/flowers";
import { FERTILIZERS } from "../data/upgrades";
import type { FertilizerType } from "../data/upgrades";
import { GEAR } from "../data/gear";
import type { GearType } from "../data/gear";
import { CONSUMABLE_RECIPES, type ConsumableId } from "../data/consumables";
import { useGame } from "../store/GameContext";
import { codexKey, setDevMutationMultiplier, getDevMutationMultiplier, setDevShowGrowthDebug, getDevShowGrowthDebug } from "../store/gameStore";
import type { GameState } from "../store/gameStore";
import { saveToCloud } from "../store/cloudSave";
import {
  WEATHER_MUT_CHANCE_PER_TICK,
  THUNDERSTORM_WET_CHANCE_PER_TICK,
  THUNDERSTORM_SHOCKED_CHANCE_PER_TICK,
  MOONLIT_NIGHT_CHANCE_PER_TICK,
} from "../data/weatherMutationRates";

const DURATION_MS = 600_000; // 10 min — long enough for the offline cron to fire multiple times

const CHART_ROWS: Array<{
  label: string; mutLabel: string; perTick: number; ticks: number; bar: string;
}> = [
  { label: "🌧️ Rain",        mutLabel: "💧 wet",         perTick: WEATHER_MUT_CHANCE_PER_TICK["rain"],            ticks: 1200,  bar: "bg-blue-400"    },
  { label: "⛈️ Storm",       mutLabel: "💧 → wet",       perTick: THUNDERSTORM_WET_CHANCE_PER_TICK,               ticks: 1200,  bar: "bg-blue-400"    },
  { label: "⛈️ Storm",       mutLabel: "⚡ wet→shocked",  perTick: THUNDERSTORM_SHOCKED_CHANCE_PER_TICK,           ticks: 1200,  bar: "bg-yellow-300"  },
  { label: "🔥 Heatwave",    mutLabel: "🔥 scorched",    perTick: WEATHER_MUT_CHANCE_PER_TICK["heatwave"],         ticks: 900,   bar: "bg-orange-400"  },
  { label: "❄️ Cold Front",  mutLabel: "❄️ frozen",      perTick: WEATHER_MUT_CHANCE_PER_TICK["cold_front"],       ticks: 900,   bar: "bg-cyan-400"    },
  { label: "✨ Golden Hr",   mutLabel: "✨ golden",       perTick: WEATHER_MUT_CHANCE_PER_TICK["golden_hour"],      ticks: 900,   bar: "bg-amber-300"   },
  { label: "🌈 Prismatic",   mutLabel: "🌈 rainbow",     perTick: WEATHER_MUT_CHANCE_PER_TICK["prismatic_skies"],  ticks: 900,   bar: "bg-fuchsia-400" },
  { label: "🌙 Star Shower", mutLabel: "🌙 moonlit",     perTick: WEATHER_MUT_CHANCE_PER_TICK["star_shower"],      ticks: 1050,  bar: "bg-indigo-400"  },
  { label: "🌪️ Tornado",     mutLabel: "🌪️ windstruck",  perTick: WEATHER_MUT_CHANCE_PER_TICK["tornado"],          ticks: 600,   bar: "bg-stone-400"   },
  { label: "🌙 Night",       mutLabel: "🌙 moonlit",     perTick: MOONLIT_NIGHT_CHANCE_PER_TICK,                   ticks: 36000, bar: "bg-indigo-300"  },
];

async function setWeather(type: WeatherType) {
  await supabase.rpc("dev_set_weather", { p_type: type, p_duration_ms: DURATION_MS });
}

type Tab = "weather" | "items" | "broadcast";

export function DevWeatherPanel() {
  const { state, update, user } = useGame();

  const [open, setOpen] = useState(false);

  // ── Weather tab state ──────────────────────────────────────────────────────
  const [cycling, setCycling]   = useState(false);
  const [current, setCurrent]   = useState<WeatherType | null>(null);
  const cycleRef                = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weatherTypes            = WEATHER_LIST.map((w) => w.id);
  const [mutMult, setMutMult]         = useState(getDevMutationMultiplier());
  const [growthDebug, setGrowthDebug] = useState(getDevShowGrowthDebug());
  const [showRates, setShowRates]     = useState(false);

  // ── Items tab state ────────────────────────────────────────────────────────
  const [tab, setTab]               = useState<Tab>("weather");
  const [flowerSearch, setFlowerSearch] = useState("");
  const [selectedFlower, setSelectedFlower] = useState(FLOWERS[0].id);
  const [itemType, setItemType]     = useState<"seed" | "bloom">("seed");
  const [mutation, setMutation]     = useState<MutationType | "none">("none");
  const [quantity, setQuantity]     = useState(1);
  const [coins, setCoins]           = useState(1000);
  const [fertType, setFertType]     = useState<FertilizerType>("basic");
  const [fertQty, setFertQty]       = useState(5);
  const [gearType, setGearType]     = useState<GearType>("sprinkler_rare");
  const [gearQty, setGearQty]       = useState(1);
  const [consumableSearch, setConsumableSearch] = useState("");
  const [selectedConsumable,    setSelectedConsumable]    = useState<ConsumableId>(CONSUMABLE_RECIPES[0]?.id as ConsumableId);
  const [consumableQty, setConsumableQty]   = useState(1);
  const [infuserRarity, setInfuserRarity]   = useState<"rare" | "legendary" | "mythic" | "exalted" | "prismatic">("rare");
  const [infuserQty,    setInfuserQty]      = useState(1);
  const [toast, setToast]           = useState<string | null>(null);

  // ── Broadcast tab state ───────────────────────────────────────────────────
  const [bcSubject,   setBcSubject]   = useState("📢 Message from Admin");
  const [bcMessage,   setBcMessage]   = useState("");
  const [bcKind,      setBcKind]      = useState<"coins" | "flower" | "seed" | "fertilizer" | "gear" | "none">("none");
  const [bcAmount,    setBcAmount]    = useState(100);
  const [bcFlower,    setBcFlower]    = useState(FLOWERS[0].id);
  const [bcMutation,  setBcMutation]  = useState<MutationType | "none">("none");
  const [bcFert,      setBcFert]      = useState<FertilizerType>("basic");
  const [bcGear,      setBcGear]      = useState<GearType>("sprinkler_rare");
  const [bcSending,   setBcSending]   = useState(false);
  const [bcResult,    setBcResult]    = useState<string | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Dev-only save that bypasses stale-CAS failures by re-reading updated_at first.
   *  Regular saveToCloud uses the client's serverUpdatedAt as a CAS guard; if any
   *  edge function or offline tick ran since the last client sync, that stamp is stale
   *  and the save silently fails (406). This helper fetches the current stamp fresh
   *  before writing, ensuring dev panel actions always persist. */
  async function devSave(newState: GameState) {
    if (!user) return;
    // Read the latest updated_at from DB so our CAS stamp is always current
    const { data: row } = await supabase
      .from("game_saves")
      .select("updated_at")
      .eq("user_id", user.id)
      .single();
    const freshState = { ...newState, serverUpdatedAt: row?.updated_at ?? null };
    const newUpdatedAt = await saveToCloud(user.id, freshState);
    // Keep client serverUpdatedAt in sync so subsequent actions don't CAS-fail
    if (newUpdatedAt) update({ ...newState, serverUpdatedAt: newUpdatedAt });
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  // ── Weather helpers ────────────────────────────────────────────────────────
  function stopCycle() {
    if (cycleRef.current) clearTimeout(cycleRef.current);
    cycleRef.current = null;
    setCycling(false);
    setCurrent(null);
  }

  async function runCycle(remaining: WeatherType[]) {
    if (remaining.length === 0) { stopCycle(); return; }
    const [next, ...rest] = remaining;
    setCurrent(next);
    await setWeather(next);
    cycleRef.current = setTimeout(() => runCycle(rest), DURATION_MS + 500);
  }

  async function startCycle() {
    stopCycle();
    setCycling(true);
    await runCycle([...weatherTypes]);
  }

  useEffect(() => () => stopCycle(), []);

  // ── Item give actions ──────────────────────────────────────────────────────
  async function giveItem() {
    const mut = mutation === "none" ? undefined : mutation as MutationType;
    const isSeed = itemType === "seed";

    const newInventory = [...state.inventory];
    const existing = newInventory.find(
      (i) => i.speciesId === selectedFlower && i.mutation === mut && !!i.isSeed === isSeed
    );
    if (existing) {
      existing.quantity += quantity;
    } else {
      newInventory.push({ speciesId: selectedFlower, quantity, mutation: mut, isSeed });
    }

    const newState = { ...state, inventory: newInventory };
    await devSave(newState);
    const flower = FLOWERS.find((f) => f.id === selectedFlower);
    showToast(`+${quantity} ${flower?.name ?? selectedFlower} ${isSeed ? "seed" : mut ? `(${mut})` : "bloom"}`);
  }

  async function fillCodex() {
    const allMutations = Object.keys(MUTATIONS) as MutationType[];
    const newDiscovered = [...state.discovered];

    const baseKey = codexKey(selectedFlower);
    if (!newDiscovered.includes(baseKey)) newDiscovered.push(baseKey);
    for (const mut of allMutations) {
      const key = codexKey(selectedFlower, mut);
      if (!newDiscovered.includes(key)) newDiscovered.push(key);
    }

    const newState = { ...state, discovered: newDiscovered };
    await devSave(newState);
    const flower = FLOWERS.find((f) => f.id === selectedFlower);
    showToast(`Codex filled for ${flower?.name ?? selectedFlower}`);
  }

  async function giveCoins() {
    const newState = { ...state, coins: state.coins + coins };
    await devSave(newState);
    showToast(`${coins >= 0 ? "+" : ""}${coins.toLocaleString()} coins`);
  }

  function forceShopRestock() {
    // Set lastShopReset 10 s before the interval threshold so the shop restocks in ~10 s.
    const SHOP_RESET_INTERVAL = 5 * 60 * 1_000;
    update({ ...state, lastShopReset: Date.now() - (SHOP_RESET_INTERVAL - 10_000) });
    showToast("Shop restocks in ~10s");
  }

  async function giveFertilizer() {
    const newFertilizers = [...state.fertilizers];
    const existing = newFertilizers.find((f) => f.type === fertType);
    if (existing) {
      existing.quantity += fertQty;
    } else {
      newFertilizers.push({ type: fertType, quantity: fertQty });
    }
    const newState = { ...state, fertilizers: newFertilizers };
    await devSave(newState);
    showToast(`+${fertQty} ${FERTILIZERS[fertType].name}`);
  }

  async function giveGear() {
    const newGearInventory = [...(state.gearInventory ?? [])];
    const existing = newGearInventory.find((g) => g.gearType === gearType);
    if (existing) {
      existing.quantity += gearQty;
    } else {
      newGearInventory.push({ gearType, quantity: gearQty });
    }
    const newState = { ...state, gearInventory: newGearInventory };
    await devSave(newState);
    showToast(`+${gearQty} ${GEAR[gearType].name} (${GEAR[gearType].rarity})`);
  }

  // Consumables aren't in saveToCloud's payload (production rule: server-authoritative
  // via use-consumable / alchemy-craft), so dev grants do a direct DB write instead.
  async function giveConsumable() {
    if (!user) return;
    const recipe = CONSUMABLE_RECIPES.find((r) => r.id === selectedConsumable);
    if (!recipe) return;

    const newConsumables = [...(state.consumables ?? [])];
    const existing = newConsumables.find((c) => c.id === selectedConsumable);
    if (existing) {
      existing.quantity += consumableQty;
    } else {
      newConsumables.push({ id: selectedConsumable, quantity: consumableQty });
    }

    const newUpdatedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("game_saves")
      .update({ consumables: newConsumables, updated_at: newUpdatedAt })
      .eq("user_id", user.id)
      .select("updated_at")
      .single();

    if (error || !data) {
      showToast(`✗ ${error?.message ?? "save failed"}`);
      return;
    }

    update({ ...state, consumables: newConsumables, serverUpdatedAt: data.updated_at as string });
    showToast(`+${consumableQty} ${recipe.name}`);
  }

  // Infusers (cross-breed crystals) — DB column is `infusers`, stored as
  // { rarity, quantity }[]. Direct DB write so the Alchemy Attune view
  // doesn't lose them on the next saveToCloud.
  async function giveInfuser() {
    if (!user) return;
    const newInfusers = [...(state.infusers ?? [])];
    const existing    = newInfusers.find((i) => i.rarity === infuserRarity);
    if (existing) {
      existing.quantity += infuserQty;
    } else {
      newInfusers.push({ rarity: infuserRarity, quantity: infuserQty });
    }

    const newUpdatedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("game_saves")
      .update({ infusers: newInfusers, updated_at: newUpdatedAt })
      .eq("user_id", user.id)
      .select("updated_at")
      .single();

    if (error || !data) {
      showToast(`✗ ${error?.message ?? "save failed"}`);
      return;
    }

    update({ ...state, infusers: newInfusers, serverUpdatedAt: data.updated_at as string });
    const tierLabel = infuserRarity[0].toUpperCase() + infuserRarity.slice(1);
    showToast(`+${infuserQty} Infuser (${tierLabel})`);
  }

  // ── Broadcast send ────────────────────────────────────────────────────────
  async function sendBroadcast() {
    if (!bcSubject.trim()) return;
    setBcSending(true);
    setBcResult(null);
    try {
      const secret = import.meta.env.VITE_CRON_SECRET as string | undefined;
      const kind   = bcKind === "none" ? "coins" : bcKind;
      const body: Record<string, unknown> = {
        subject: bcSubject.trim(),
        message: bcMessage.trim(),
        kind,
        ...(kind === "coins"      && { amount:        bcKind === "none" ? 0 : bcAmount }),
        ...(kind === "flower"     && { speciesId: bcFlower, mutation: bcMutation === "none" ? null : bcMutation }),
        ...(kind === "seed"       && { speciesId: bcFlower }),
        ...(kind === "fertilizer" && { fertilizerType: bcFert }),
        ...(kind === "gear"       && { gearType: bcGear }),
      };
      const { data, error } = await supabase.functions.invoke("admin-broadcast", {
        body,
        headers: secret ? { "x-admin-secret": secret } : {},
      });
      if (error) throw error;
      setBcResult(`✓ Sent to ${(data as { sent: number }).sent} players`);
      setBcMessage("");
    } catch (e) {
      setBcResult(`✗ ${e instanceof Error ? e.message : "Failed"}`);
    } finally {
      setBcSending(false);
    }
  }

  // ── Filtered flower list ───────────────────────────────────────────────────
  const filteredFlowers = FLOWERS.filter((f) =>
    flowerSearch.trim() === "" ||
    f.name.toLowerCase().includes(flowerSearch.toLowerCase()) ||
    f.id.includes(flowerSearch.toLowerCase())
  );

  // ── Filtered consumable list ───────────────────────────────────────────────
  const filteredConsumables = CONSUMABLE_RECIPES.filter((r) =>
    consumableSearch.trim() === "" ||
    r.name.toLowerCase().includes(consumableSearch.toLowerCase()) ||
    r.id.includes(consumableSearch.toLowerCase())
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[100] w-10 h-10 rounded-full bg-black/90 border border-yellow-500/40 text-yellow-400 text-lg shadow-2xl flex items-center justify-center hover:border-yellow-400/70 transition-colors"
        title="Open Dev Panel"
      >
        ⚗️
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-[100] bg-black/90 border border-yellow-500/40 rounded-2xl p-4 w-76 shadow-2xl text-xs max-h-[90vh] flex flex-col">

      {/* Header + tabs */}
      <div className="flex items-center gap-2 mb-3">
        <p className="font-bold text-yellow-400 flex-1">⚗️ Dev Panel</p>
        {toast && <span className="text-green-400 font-mono text-[10px] truncate">{toast}</span>}
        <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white/80 transition-colors leading-none">✕</button>
      </div>

      <div className="flex gap-1 mb-3">
        {(["weather", "items", "broadcast"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1 rounded-lg text-[10px] font-semibold transition-all capitalize text-center
              ${tab === t
                ? "bg-yellow-500/20 border border-yellow-500/50 text-yellow-400"
                : "bg-white/5 border border-white/10 text-white/50 hover:text-white/70"
              }`}
          >
            {t === "weather" ? "🌦 Weather" : t === "items" ? "🎒 Items" : "📢 Broadcast"}
          </button>
        ))}
      </div>

      {/* ── WEATHER TAB ─────────────────────────────────────────────────────── */}
      {tab === "weather" && (
        <>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {weatherTypes.map((type) => {
              const def = WEATHER[type];
              return (
                <button
                  key={type}
                  onClick={() => { stopCycle(); setCurrent(type); setWeather(type); }}
                  className={`
                    flex flex-col items-center gap-0.5 py-1.5 rounded-lg border transition-all
                    ${current === type
                      ? "border-yellow-400/80 bg-yellow-400/10 text-yellow-300"
                      : "border-white/10 bg-white/5 text-white/70 hover:border-white/30"
                    }
                  `}
                >
                  <span className="text-lg leading-none">{def.emoji}</span>
                  <span className="text-[9px] font-mono leading-none">{def.name.split(" ")[0]}</span>
                </button>
              );
            })}
          </div>

          <div className="flex gap-1.5 mb-2">
            <button
              onClick={cycling ? stopCycle : startCycle}
              className={`
                flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all text-center
                ${cycling
                  ? "bg-red-500/20 border border-red-500/50 text-red-400"
                  : "bg-yellow-500/20 border border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/30"
                }
              `}
            >
              {cycling ? `⏹ Stop (${WEATHER[current!]?.name ?? "…"})` : "▶ Auto-cycle (30s)"}
            </button>
            <button
              onClick={async () => {
                await supabase.rpc("dev_force_advance_weather");
                showToast("Skipped to next weather");
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-400/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 transition-all"
              title="Advance forecast queue to next slot"
            >
              ⏭ Skip
            </button>
          </div>

          {/* Mutation rate multiplier */}
          <div className="bg-white/5 rounded-xl p-2.5 space-y-1.5">
            <p className="text-yellow-400 font-semibold text-[10px] uppercase tracking-wide">
              Mutation Rate ×{mutMult}
            </p>
            <div className="flex gap-1.5 items-center">
              <input
                type="range"
                min={1}
                max={500}
                value={mutMult}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setMutMult(v);
                  setDevMutationMultiplier(v);
                }}
                className="flex-1 accent-yellow-400"
              />
              <button
                onClick={() => { setMutMult(1); setDevMutationMultiplier(1); }}
                className="text-[10px] text-white/40 hover:text-white/70 transition-colors"
              >
                Reset
              </button>
            </div>
            <p className="text-[9px] text-white/30 font-mono">
              Multiplies client-side weather mutation chances
            </p>
          </div>

          {/* Growth debug overlay toggle */}
          <button
            onClick={() => {
              const v = !growthDebug;
              setGrowthDebug(v);
              setDevShowGrowthDebug(v);
            }}
            className={`w-full py-1.5 rounded-lg text-xs font-semibold transition-all text-center mt-2
              ${growthDebug
                ? "bg-cyan-500/20 border border-cyan-400/50 text-cyan-300"
                : "bg-white/5 border border-white/10 text-white/50 hover:text-white/70"
              }`}
          >
            🔬 Growth Debug {growthDebug ? "ON" : "OFF"}
          </button>

          {/* Manual offline tick trigger */}
          <button
            onClick={async () => {
              const { data, error } = await supabase.functions.invoke("tick-offline-gardens");
              if (error) { showToast(`✗ ${error.message}`); return; }
              const d = data as { ok: boolean; scanned?: number; changed?: number; error?: string };
              showToast(d.ok ? `✓ scanned ${d.scanned}, changed ${d.changed}` : `✗ ${d.error}`);
            }}
            className="w-full py-1.5 rounded-lg text-xs font-semibold transition-all text-center mt-1 bg-white/5 border border-white/10 text-white/50 hover:text-white/70"
          >
            🔄 Trigger Offline Tick
          </button>

          {/* Mutation rates chart */}
          <button
            onClick={() => setShowRates(r => !r)}
            className="w-full mt-2 py-1 rounded-lg text-[10px] font-semibold bg-white/5 border border-white/10 text-white/50 hover:text-white/70 transition-all text-center"
          >
            📊 Mutation Rates {showRates ? "▲" : "▼"}
          </button>

          {showRates && (
            <div className="mt-2 space-y-2">
              {CHART_ROWS.map(({ label, mutLabel, perTick, ticks, bar }) => {
                const pct = (1 - Math.pow(1 - perTick, ticks)) * 100;
                return (
                  <div key={`${label}-${mutLabel}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-white/60 text-[9px]">{label} → {mutLabel}</span>
                      <span className="font-mono text-[9px] text-white/50">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1">
                      <div className={`${bar} h-1 rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <p className="text-white/25 text-[8px] text-center pt-0.5">chance over full event · bloomed plants only</p>
            </div>
          )}
        </>
      )}

      {/* ── BROADCAST TAB ───────────────────────────────────────────────────── */}
      {tab === "broadcast" && (
        <div className="flex flex-col gap-3 overflow-y-auto min-h-0 flex-1">

          {/* Subject */}
          <div className="bg-white/5 rounded-xl p-2.5 space-y-1.5">
            <p className="text-yellow-400 font-semibold text-[10px] uppercase tracking-wide">Subject</p>
            <input
              type="text"
              value={bcSubject}
              onChange={(e) => setBcSubject(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-500/50"
            />
          </div>

          {/* Message */}
          <div className="bg-white/5 rounded-xl p-2.5 space-y-1.5">
            <p className="text-yellow-400 font-semibold text-[10px] uppercase tracking-wide">Message</p>
            <textarea
              value={bcMessage}
              onChange={(e) => setBcMessage(e.target.value)}
              rows={3}
              placeholder="Write your message..."
              className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-yellow-500/50 resize-none"
            />
          </div>

          {/* Attachment type */}
          <div className="bg-white/5 rounded-xl p-2.5 space-y-1.5">
            <p className="text-yellow-400 font-semibold text-[10px] uppercase tracking-wide">Attachment</p>
            <select
              value={bcKind}
              onChange={(e) => setBcKind(e.target.value as typeof bcKind)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-500/50"
            >
              <option value="none">None (message only)</option>
              <option value="coins">🟡 Coins</option>
              <option value="flower">🌸 Flower (bloom)</option>
              <option value="seed">🌱 Flower (seed)</option>
              <option value="fertilizer">🌿 Fertilizer</option>
              <option value="gear">⚙️ Gear</option>
            </select>

            {/* Coins amount */}
            {bcKind === "coins" && (
              <div className="flex gap-1.5 items-center">
                <span className="text-white/50 text-[10px]">Amount</span>
                <input
                  type="number"
                  value={bcAmount}
                  min={1}
                  onChange={(e) => setBcAmount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-yellow-500/50"
                />
              </div>
            )}

            {/* Flower / Seed */}
            {(bcKind === "flower" || bcKind === "seed") && (
              <>
                <select
                  value={bcFlower}
                  onChange={(e) => setBcFlower(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-500/50"
                  size={4}
                >
                  {FLOWERS.map((f) => (
                    <option key={f.id} value={f.id}>{f.emoji.bloom} {f.name} ({f.rarity})</option>
                  ))}
                </select>
                {bcKind === "flower" && (
                  <select
                    value={bcMutation}
                    onChange={(e) => setBcMutation(e.target.value as MutationType | "none")}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-500/50"
                  >
                    <option value="none">No mutation</option>
                    {(Object.keys(MUTATIONS) as MutationType[]).map((m) => (
                      <option key={m} value={m}>{MUTATIONS[m].emoji} {MUTATIONS[m].name}</option>
                    ))}
                  </select>
                )}
              </>
            )}

            {/* Fertilizer */}
            {bcKind === "fertilizer" && (
              <select
                value={bcFert}
                onChange={(e) => setBcFert(e.target.value as FertilizerType)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-500/50"
              >
                {Object.values(FERTILIZERS).map((f) => (
                  <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>
                ))}
              </select>
            )}

            {/* Gear */}
            {bcKind === "gear" && (
              <select
                value={bcGear}
                onChange={(e) => setBcGear(e.target.value as GearType)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-500/50"
                size={4}
              >
                {(Object.values(GEAR) as typeof GEAR[GearType][]).map((def) => (
                  <option key={def.id} value={def.id}>{def.emoji} {def.name} ({def.rarity})</option>
                ))}
              </select>
            )}
          </div>

          {/* Send button */}
          <button
            onClick={sendBroadcast}
            disabled={bcSending || !bcSubject.trim()}
            className="w-full py-2 rounded-xl text-xs font-bold bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-40 text-center"
          >
            {bcSending ? "Sending..." : "👑 Send to All Players"}
          </button>

          {bcResult && (
            <p className={`text-[10px] font-mono text-center ${bcResult.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>
              {bcResult}
            </p>
          )}
        </div>
      )}

      {/* ── ITEMS TAB ───────────────────────────────────────────────────────── */}
      {tab === "items" && (
        <div className="flex flex-col gap-3 overflow-y-auto min-h-0 flex-1">

          {/* Coins */}
          <div className="bg-white/5 rounded-xl p-2.5 space-y-1.5">
            <p className="text-yellow-400 font-semibold text-[10px] uppercase tracking-wide">Coins</p>
            <div className="flex gap-1.5">
              <input
                type="number"
                value={coins}
                onChange={(e) => setCoins(parseInt(e.target.value) || 0)}
                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-yellow-500/50"
              />
              <button
                onClick={giveCoins}
                className="px-3 py-1 bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 rounded-lg font-semibold hover:bg-yellow-500/30 transition-all text-center"
              >
                {coins >= 0 ? "Give" : "Take"}
              </button>
            </div>
          </div>

          {/* Shop */}
          <div className="bg-white/5 rounded-xl p-2.5 space-y-1.5">
            <p className="text-yellow-400 font-semibold text-[10px] uppercase tracking-wide">Shop</p>
            <button
              onClick={forceShopRestock}
              className="w-full py-1 bg-blue-500/20 border border-blue-500/40 text-blue-400 rounded-lg font-semibold hover:bg-blue-500/30 transition-all text-center"
            >
              🔄 Restock in 10s
            </button>
          </div>

          {/* Fertilizer */}
          <div className="bg-white/5 rounded-xl p-2.5 space-y-1.5">
            <p className="text-yellow-400 font-semibold text-[10px] uppercase tracking-wide">Fertilizer</p>
            <div className="flex gap-1.5">
              <select
                value={fertType}
                onChange={(e) => setFertType(e.target.value as FertilizerType)}
                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-500/50"
              >
                {Object.values(FERTILIZERS).map((f) => (
                  <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>
                ))}
              </select>
              <input
                type="number"
                value={fertQty}
                min={1}
                onChange={(e) => setFertQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-12 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-yellow-500/50"
              />
              <button
                onClick={giveFertilizer}
                className="px-3 py-1 bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 rounded-lg font-semibold hover:bg-yellow-500/30 transition-all text-center"
              >
                Give
              </button>
            </div>
          </div>

          {/* Flower */}
          <div className="bg-white/5 rounded-xl p-2.5 space-y-1.5">
            <p className="text-yellow-400 font-semibold text-[10px] uppercase tracking-wide">Flower</p>

            {/* Search */}
            <input
              type="text"
              value={flowerSearch}
              onChange={(e) => setFlowerSearch(e.target.value)}
              placeholder="Search flowers..."
              className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-yellow-500/50"
            />

            {/* Flower select */}
            <select
              value={selectedFlower}
              onChange={(e) => setSelectedFlower(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-500/50"
              size={4}
            >
              {filteredFlowers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.emoji.bloom} {f.name} ({f.rarity})
                </option>
              ))}
            </select>

            {/* Seed / Bloom toggle */}
            <div className="flex gap-1">
              {(["seed", "bloom"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setItemType(t)}
                  className={`flex-1 py-1 rounded-lg text-[10px] font-semibold transition-all capitalize text-center
                    ${itemType === t
                      ? "bg-yellow-500/20 border border-yellow-500/50 text-yellow-400"
                      : "bg-white/5 border border-white/10 text-white/50 hover:text-white/70"
                    }`}
                >
                  {t === "seed" ? "🌱 Seed" : "🌸 Bloom"}
                </button>
              ))}
            </div>

            {/* Mutation (bloom only) */}
            {itemType === "bloom" && (
              <select
                value={mutation}
                onChange={(e) => setMutation(e.target.value as MutationType | "none")}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-500/50"
              >
                <option value="none">No mutation</option>
                {(Object.keys(MUTATIONS) as MutationType[]).map((m) => (
                  <option key={m} value={m}>{MUTATIONS[m].emoji} {MUTATIONS[m].name}</option>
                ))}
              </select>
            )}

            {/* Quantity + Give */}
            <div className="flex gap-1.5">
              <input
                type="number"
                value={quantity}
                min={1}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-yellow-500/50"
              />
              <button
                onClick={giveItem}
                className="flex-1 py-1 bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 rounded-lg font-semibold hover:bg-yellow-500/30 transition-all text-center"
              >
                Give Item
              </button>
            </div>

            {/* Fill codex */}
            <button
              onClick={fillCodex}
              className="w-full py-1 bg-green-500/20 border border-green-500/40 text-green-400 rounded-lg font-semibold hover:bg-green-500/30 transition-all text-center"
            >
              ⚡ Fill Codex (all 10)
            </button>
          </div>

          {/* Gear */}
          <div className="bg-white/5 rounded-xl p-2.5 space-y-1.5">
            <p className="text-yellow-400 font-semibold text-[10px] uppercase tracking-wide">Gear</p>
            <select
              value={gearType}
              onChange={(e) => setGearType(e.target.value as GearType)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-500/50"
              size={5}
            >
              {(Object.values(GEAR) as typeof GEAR[GearType][]).map((def) => (
                <option key={def.id} value={def.id}>
                  {def.emoji} {def.name} ({def.rarity})
                </option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <input
                type="number"
                value={gearQty}
                min={1}
                onChange={(e) => setGearQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-yellow-500/50"
              />
              <button
                onClick={giveGear}
                className="flex-1 py-1 bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 rounded-lg font-semibold hover:bg-yellow-500/30 transition-all text-center"
              >
                Give Gear
              </button>
            </div>
          </div>

          {/* Consumables — vials, tonics, magnifying glass, speed boosts, pouches, etc. */}
          <div className="bg-white/5 rounded-xl p-2.5 space-y-1.5">
            <p className="text-yellow-400 font-semibold text-[10px] uppercase tracking-wide">Consumables</p>
            <input
              type="text"
              value={consumableSearch}
              onChange={(e) => setConsumableSearch(e.target.value)}
              placeholder="Search consumables..."
              className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-yellow-500/50"
            />
            <select
              value={selectedConsumable}
              onChange={(e) => setSelectedConsumable(e.target.value as ConsumableId)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-500/50"
              size={5}
            >
              {filteredConsumables.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.emoji} {r.name} ({r.rarity})
                </option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <input
                type="number"
                value={consumableQty}
                min={1}
                onChange={(e) => setConsumableQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-yellow-500/50"
              />
              <button
                onClick={giveConsumable}
                className="flex-1 py-1 bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 rounded-lg font-semibold hover:bg-yellow-500/30 transition-all text-center"
              >
                Give Consumable
              </button>
            </div>
          </div>

          {/* Infusers — cross-breed crystals (Alchemy → Attune) */}
          <div className="bg-white/5 rounded-xl p-2.5 space-y-1.5">
            <p className="text-yellow-400 font-semibold text-[10px] uppercase tracking-wide">💉 Infusers</p>
            <select
              value={infuserRarity}
              onChange={(e) => setInfuserRarity(e.target.value as typeof infuserRarity)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-500/50"
            >
              <option value="rare">Infuser I (Rare)</option>
              <option value="legendary">Infuser II (Legendary)</option>
              <option value="mythic">Infuser III (Mythic)</option>
              <option value="exalted">Infuser IV (Exalted)</option>
              <option value="prismatic">Infuser V (Prismatic)</option>
            </select>
            <div className="flex gap-1.5">
              <input
                type="number"
                value={infuserQty}
                min={1}
                onChange={(e) => setInfuserQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-yellow-500/50"
              />
              <button
                onClick={giveInfuser}
                className="flex-1 py-1 bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 rounded-lg font-semibold hover:bg-yellow-500/30 transition-all text-center"
              >
                Give Infuser
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
