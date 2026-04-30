import { describe, expect, it } from "vitest";
import {
  defaultState,
  makeGrid,
  rollbackPlantOne,
  rollbackSellAll,
  type GameState,
} from "../../src/store/gameStore";
import type { MutationType } from "../../src/data/flowers";

// ── Test helpers ────────────────────────────────────────────────────────────

function baseState(overrides: Partial<GameState> = {}): GameState {
  return { ...defaultState(), ...overrides };
}

/** Convenience inventory entry builder. */
function bloom(speciesId: string, quantity: number, mutation?: MutationType) {
  return { speciesId, quantity, mutation, isSeed: false };
}
function seed(speciesId: string, quantity: number) {
  return { speciesId, quantity, isSeed: true };
}

// ── rollbackSellAll ─────────────────────────────────────────────────────────
//
// These tests exercise the v2.2.5 hotfix: the rollback must be SURGICAL —
// undoing only the specific blooms sold and the specific coin delta, against
// whatever the state looks like at rollback time. Snapshot rollbacks would
// erase concurrent state changes (e.g. a harvest the user did mid-sell) and
// produce the "items disappear, no money" symptom.

describe("rollbackSellAll", () => {
  it("restores a single sold bloom and subtracts the earnings", () => {
    // Optimistic state: 5 roses sold (bloom removed), +50 coins
    const state = baseState({
      coins: 100 + 50, // pretend earnings already applied
      inventory: [],   // pretend optimistic filter removed the entry
    });

    const rolled = rollbackSellAll(
      state,
      [{ speciesId: "rose", quantity: 5 }],
      50,
    );

    expect(rolled.coins).toBe(100);
    expect(rolled.inventory).toEqual([
      { speciesId: "rose", mutation: undefined, quantity: 5, isSeed: false },
    ]);
  });

  it("restores multiple species under the correct (speciesId, mutation) keys", () => {
    const state = baseState({
      coins: 200,
      inventory: [],
    });

    const rolled = rollbackSellAll(
      state,
      [
        { speciesId: "rose",   quantity: 3 },
        { speciesId: "rose",   quantity: 2, mutation: "golden" },
        { speciesId: "tulip",  quantity: 1 },
      ],
      150,
    );

    expect(rolled.coins).toBe(50);
    expect(rolled.inventory).toContainEqual(bloom("rose",  3));
    expect(rolled.inventory).toContainEqual(bloom("rose",  2, "golden"));
    expect(rolled.inventory).toContainEqual(bloom("tulip", 1));
    // Mutation-keyed entries are kept distinct from the unmutated row
    expect(rolled.inventory.length).toBe(3);
  });

  it("preserves a concurrent harvest that landed during the sell roundtrip (the bug-fix scenario)", () => {
    // Pre-sell: user has 5 roses. They click Sell All (optimistic empties inventory,
    // adds coins). While the request is in flight they harvest another rose, so
    // inventory now has +1 rose. Server fails — rollback fires.
    //
    // Pre-fix behavior: snapshot rollback restored inventory to the pre-sell state
    // (5 roses), erasing the new harvest.
    // Post-fix behavior: the SOLD 5 are added on top of whatever inventory looks
    // like now (1 from the harvest), giving 6 total — which is the correct count.
    const state = baseState({
      coins: 100 + 50,
      inventory: [bloom("rose", 1)], // the freshly-harvested rose
    });

    const rolled = rollbackSellAll(
      state,
      [{ speciesId: "rose", quantity: 5 }],
      50,
    );

    expect(rolled.coins).toBe(100);
    const roseEntry = rolled.inventory.find(
      (i) => i.speciesId === "rose" && !i.isSeed && i.mutation === undefined,
    );
    expect(roseEntry?.quantity).toBe(6);
    // No phantom mutation rows added, no other items touched
    expect(rolled.inventory.length).toBe(1);
  });

  it("pushes a new entry when the sold species was completely removed from inventory", () => {
    // Optimistic .filter(quantity > 0) removed the row entirely
    const state = baseState({ coins: 50, inventory: [] });

    const rolled = rollbackSellAll(
      state,
      [{ speciesId: "rose", quantity: 3, mutation: "golden" }],
      30,
    );

    expect(rolled.coins).toBe(20);
    expect(rolled.inventory).toContainEqual(bloom("rose", 3, "golden"));
  });

  it("keeps unrelated inventory items completely untouched", () => {
    const state = baseState({
      coins: 100,
      inventory: [
        bloom("daisy", 7),
        seed("rose", 4),
        bloom("rose", 0), // sold-out row in the inventory list
      ],
    });

    const rolled = rollbackSellAll(
      state,
      [{ speciesId: "rose", quantity: 2 }],
      20,
    );

    // Unrelated rows preserved
    expect(rolled.inventory).toContainEqual(bloom("daisy", 7));
    expect(rolled.inventory).toContainEqual(seed("rose", 4));
    // Rose bloom row got the +2
    const roseBloom = rolled.inventory.find(
      (i) => i.speciesId === "rose" && !i.isSeed,
    );
    expect(roseBloom?.quantity).toBe(2);
    // Coins reduced by exactly the earnings
    expect(rolled.coins).toBe(80);
  });

  it("treats mutated and unmutated of same species as separate keys", () => {
    const state = baseState({
      coins: 100,
      inventory: [bloom("rose", 5)], // unmutated rose still present
    });

    const rolled = rollbackSellAll(
      state,
      [{ speciesId: "rose", quantity: 1, mutation: "golden" }],
      50,
    );

    // Unmutated row untouched
    const plain = rolled.inventory.find(
      (i) => i.speciesId === "rose" && !i.isSeed && i.mutation === undefined,
    );
    expect(plain?.quantity).toBe(5);
    // New golden row pushed
    const golden = rolled.inventory.find(
      (i) => i.speciesId === "rose" && !i.isSeed && i.mutation === "golden",
    );
    expect(golden?.quantity).toBe(1);
  });

  it("is a no-op for empty soldItems", () => {
    const state = baseState({ coins: 100, inventory: [bloom("rose", 5)] });
    const rolled = rollbackSellAll(state, [], 0);
    expect(rolled.coins).toBe(100);
    expect(rolled.inventory).toEqual([bloom("rose", 5)]);
  });
});

// ── rollbackPlantOne ────────────────────────────────────────────────────────
//
// These tests exercise the v2.2.5 hotfix for Plant All: each plot's failure
// must roll back ONLY that plot, leaving any plants that succeeded — plus
// any concurrent state changes — untouched.

describe("rollbackPlantOne", () => {
  it("clears the target plot and refunds one seed", () => {
    const grid = makeGrid(3, 3);
    grid[1][1].plant = {
      speciesId: "rose",
      timePlanted: Date.now(),
      fertilizer: null,
    };
    const state = baseState({
      grid,
      inventory: [seed("rose", 2)],
    });

    const rolled = rollbackPlantOne(state, 1, 1, "rose");

    expect(rolled.grid[1][1].plant).toBeNull();
    const roseSeed = rolled.inventory.find(
      (i) => i.speciesId === "rose" && i.isSeed,
    );
    expect(roseSeed?.quantity).toBe(3);
  });

  it("preserves plants in OTHER plots that were planted in the same Plant-All batch (the bug-fix scenario)", () => {
    // Plant All fired 3 plants. Two succeeded server-side; the third failed.
    // Pre-fix: catch-all `update(prev)` wiped all 3 plants from the client.
    // Post-fix: rollback only clears plot (2,2), leaving (0,0) and (1,1) intact.
    const grid = makeGrid(3, 3);
    grid[0][0].plant = { speciesId: "rose", timePlanted: 1, fertilizer: null };
    grid[1][1].plant = { speciesId: "rose", timePlanted: 2, fertilizer: null };
    grid[2][2].plant = { speciesId: "rose", timePlanted: 3, fertilizer: null };

    const state = baseState({ grid, inventory: [seed("rose", 0)] });
    const rolled = rollbackPlantOne(state, 2, 2, "rose");

    expect(rolled.grid[0][0].plant?.timePlanted).toBe(1);
    expect(rolled.grid[1][1].plant?.timePlanted).toBe(2);
    expect(rolled.grid[2][2].plant).toBeNull();
  });

  it("doesn't touch other species' inventory entries", () => {
    const grid = makeGrid(2, 2);
    grid[0][0].plant = { speciesId: "rose", timePlanted: 1, fertilizer: null };
    const state = baseState({
      grid,
      inventory: [seed("rose", 1), seed("tulip", 5), bloom("daisy", 3)],
    });

    const rolled = rollbackPlantOne(state, 0, 0, "rose");

    const tulip = rolled.inventory.find((i) => i.speciesId === "tulip");
    const daisy = rolled.inventory.find((i) => i.speciesId === "daisy" && !i.isSeed);
    expect(tulip?.quantity).toBe(5);
    expect(daisy?.quantity).toBe(3);
  });

  it("pushes a new seed entry when the species was removed from inventory", () => {
    // E.g. user planted their last seed; optimistic filter removed the row.
    // Without this fallback the seed would be silently lost on rollback.
    const grid = makeGrid(2, 2);
    grid[0][0].plant = { speciesId: "rose", timePlanted: 1, fertilizer: null };
    const state = baseState({ grid, inventory: [] });

    const rolled = rollbackPlantOne(state, 0, 0, "rose");

    expect(rolled.inventory).toContainEqual(seed("rose", 1));
  });

  it("is idempotent on a plot that's already empty", () => {
    // Race: someone else cleared the plot between optimistic apply and rollback.
    // Rollback shouldn't crash and should still refund the seed.
    const grid = makeGrid(2, 2); // all plots empty
    const state = baseState({ grid, inventory: [seed("rose", 0)] });

    const rolled = rollbackPlantOne(state, 0, 0, "rose");

    expect(rolled.grid[0][0].plant).toBeNull();
    const roseSeed = rolled.inventory.find(
      (i) => i.speciesId === "rose" && i.isSeed,
    );
    expect(roseSeed?.quantity).toBe(1);
  });
});
