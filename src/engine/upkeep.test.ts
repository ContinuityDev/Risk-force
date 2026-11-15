import { describe, expect, it } from "vitest";
import { applyEconomyTick, computeEnergyUpkeep } from "./economy";
import { createInitialState } from "./init";

describe("energy upkeep", () => {
  it("charges energy for garrison units and workers", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 8,
    });
    const upkeep = computeEnergyUpkeep(state, "player");
    expect(upkeep).toBeGreaterThan(0);
  });

  it("marks insolvent and deserts when energy cannot cover upkeep", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 9,
    });
    const tid = Object.keys(state.territories).find(
      (id) => state.territories[id]!.owner === "player",
    )!;
    // Strip economy buildings so income cannot offset the huge payroll
    const territories = { ...state.territories };
    for (const [id, ts] of Object.entries(territories)) {
      if (ts.owner !== "player") continue;
      territories[id] = {
        ...ts,
        buildings: [],
        garrison: id === tid ? { trooper: 40 } : { trooper: 20 },
        workers: 8,
      };
    }
    state = {
      ...state,
      players: {
        ...state.players,
        player: {
          ...state.players.player!,
          resources: {
            ...state.players.player!.resources,
            energy: 2,
          },
        },
      },
      territories,
    };
    const before = Object.values(state.territories[tid]!.garrison).reduce(
      (a, b) => a + b,
      0,
    );
    state = applyEconomyTick(state, "player");
    expect(state.players.player!.insolvent).toBe(true);
    // Energy floors at 0 — no infinite debt spiral
    expect(state.players.player!.resources.energy).toBe(0);
    const after = Object.values(state.territories[tid]!.garrison).reduce(
      (a, b) => a + b,
      0,
    );
    expect(after).toBeLessThan(before);
  });
});
