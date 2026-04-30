import { describe, expect, it } from "vitest";
import {
  defaultState,
  makeGrid,
  mergeServerResult,
  type GameState,
} from "../../src/store/gameStore";

// ── Test helpers ────────────────────────────────────────────────────────────

function baseState(overrides: Partial<GameState> = {}): GameState {
  return { ...defaultState(), ...overrides };
}

function plant(speciesId: string, timePlanted: number, mutation?: "wet" | "frozen" | "scorched") {
  return {
    speciesId,
    timePlanted,
    fertilizer: null as null,
    mutation: mutation as "wet" | "frozen" | "scorched" | undefined,
  };
}

// ── mergeServerResult ────────────────────────────────────────────────────────
//
// `mergeServerResult` is the success-path merge used by `perform()` to apply
// edge function responses into client state. The contract this test suite
// locks in:
//   1. Empty result {} preserves state (the v2.2.5 fix relies on this)
//   2. Partial-field results merge those fields, leave others alone
//   3. Grid replacement preserves client-rolled mutations on identity-matched
//      plants (so weather/sprinkler ticks aren't erased on every roundtrip)
//   4. Different plant identity in the same plot → server wins, no mutation
//      copied (correctness after harvest+replant)

describe("mergeServerResult — empty result preserves state (the auto-planter / Plant All contract)", () => {
  it("returns equivalent state when result is {}", () => {
    const grid = makeGrid(2, 2);
    grid[0][0].plant = plant("rose", 1);
    grid[1][1].plant = plant("daisy", 2);

    const cur = baseState({
      coins: 500,
      grid,
      inventory: [
        { speciesId: "rose",  quantity: 3, isSeed: true  },
        { speciesId: "daisy", quantity: 1, isSeed: false },
      ],
    });

    const merged = mergeServerResult(cur, {});

    expect(merged.coins).toBe(500);
    expect(merged.grid).toBe(cur.grid);            // same reference — no copy needed
    expect(merged.inventory).toBe(cur.inventory);  // same reference — no copy needed
    expect(merged.grid[0][0].plant?.speciesId).toBe("rose");
    expect(merged.grid[1][1].plant?.speciesId).toBe("daisy");
  });

  it("does not clobber sibling optimistic plants when one plant-seed call's response arrives (the bug scenario)", () => {
    // Pre-fix: plant-seed's serverFn returned the full result with grid/inventory.
    // perform's success-merge would replace cur.grid with the server's grid —
    // which only included the plant from THIS call's write moment. Any sibling
    // optimistic plants from a Plant-All loop or a concurrent auto-planter
    // would briefly disappear from the UI.
    //
    // Post-fix: callers return {} after the await, so mergeServerResult({}, ...)
    // is a no-op for grid/inventory. This test locks in the contract.
    const grid = makeGrid(3, 1);
    grid[0][0].plant = plant("rose", 1);  // optimistic from this Plant-All entry
    grid[1][0].plant = plant("rose", 2);  // optimistic from sibling, still in flight
    grid[2][0].plant = plant("rose", 3);  // optimistic from sibling, still in flight
    const cur = baseState({ grid });

    const merged = mergeServerResult(cur, {});

    expect(merged.grid[0][0].plant?.timePlanted).toBe(1);
    expect(merged.grid[1][0].plant?.timePlanted).toBe(2);
    expect(merged.grid[2][0].plant?.timePlanted).toBe(3);
  });
});

describe("mergeServerResult — partial-field results merge cleanly", () => {
  it("only overwrites fields present in the result", () => {
    const cur = baseState({ coins: 100, inventory: [{ speciesId: "rose", quantity: 5, isSeed: true }] });
    const merged = mergeServerResult(cur, { coins: 250 });

    expect(merged.coins).toBe(250);
    expect(merged.inventory).toBe(cur.inventory);    // unchanged reference
    expect(merged.grid).toBe(cur.grid);
  });

  it("propagates serverUpdatedAt without touching anything else", () => {
    const cur = baseState({ coins: 100, serverUpdatedAt: "old-stamp" });
    const merged = mergeServerResult(cur, { serverUpdatedAt: "new-stamp" });

    expect(merged.serverUpdatedAt).toBe("new-stamp");
    expect(merged.coins).toBe(100);
  });

  it("strips stray ok:true field (legacy server convention)", () => {
    const cur = baseState();
    // Cast: `ok` isn't on GameState, but production server responses include it
    // and perform()'s historical merge stripped it explicitly.
    const merged = mergeServerResult(cur, { coins: 50, ok: true } as Partial<GameState> & { ok: true });

    expect((merged as unknown as { ok?: unknown }).ok).toBeUndefined();
    expect(merged.coins).toBe(50);
  });
});

describe("mergeServerResult — grid replacement preserves client-rolled mutations", () => {
  it("preserves a mutation when the same plant (speciesId + timePlanted) exists in both grids", () => {
    // Client has a wet rose at (0,0) — wet was rolled locally via the weather
    // tick and not yet persisted to the DB. Server returns a grid with the
    // same rose but no mutation. The merge should keep the local mutation.
    const curGrid = makeGrid(1, 1);
    curGrid[0][0].plant = plant("rose", 1, "wet");

    const serverGrid = makeGrid(1, 1);
    serverGrid[0][0].plant = plant("rose", 1); // same plant, no mutation

    const cur = baseState({ grid: curGrid });
    const merged = mergeServerResult(cur, { grid: serverGrid });

    expect(merged.grid[0][0].plant?.speciesId).toBe("rose");
    expect(merged.grid[0][0].plant?.mutation).toBe("wet");
  });

  it("does NOT copy mutation when the plant identity differs (post-harvest + replant)", () => {
    // Player harvested a wet rose (timePlanted=1), then planted a fresh rose
    // (timePlanted=2). Server returns the new rose. The wet mutation should
    // NOT be copied onto the new rose — that would be a different plant.
    const curGrid = makeGrid(1, 1);
    curGrid[0][0].plant = plant("rose", 1, "wet"); // stale local state from before the harvest

    const serverGrid = makeGrid(1, 1);
    serverGrid[0][0].plant = plant("rose", 2); // freshly planted, no mutation

    const cur = baseState({ grid: curGrid });
    const merged = mergeServerResult(cur, { grid: serverGrid });

    expect(merged.grid[0][0].plant?.timePlanted).toBe(2);
    expect(merged.grid[0][0].plant?.mutation).toBeUndefined();
  });

  it("server's empty plot wins over a client plant (this is the bug WHY callers should return {})", () => {
    // This documents the bug: if a Plant-All sibling's response includes a
    // grid where the cell is null but the client has it optimistically planted,
    // the server wins and the plant disappears. Callers avoid this by NOT
    // returning grid (return {} instead).
    const curGrid = makeGrid(1, 2);
    curGrid[0][0].plant = plant("rose", 1);
    curGrid[0][1].plant = plant("daisy", 2);

    const serverGrid = makeGrid(1, 2);
    serverGrid[0][0].plant = plant("rose", 1); // server caught up with rose
    // serverGrid[0][1] is null — server hasn't seen the daisy yet

    const cur = baseState({ grid: curGrid });
    const merged = mergeServerResult(cur, { grid: serverGrid });

    expect(merged.grid[0][0].plant?.speciesId).toBe("rose");
    // Daisy was wiped because server's grid wins on absence
    expect(merged.grid[0][1].plant).toBeNull();
  });
});
