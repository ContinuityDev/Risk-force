import { describe, expect, it } from "vitest";
import { createInitialState } from "./init";
import {
  applyEconomyTick,
  canAfford,
  computeIncome,
  computeSupplyUpkeep,
  spend,
} from "./economy";

function fresh() {
  return createInitialState({
    humanCount: 1,
    aiCount: 2,
    multiplayerMode: "solo",
    seed: 42,
  });
}

describe("economy", () => {
  it("starter territories produce energy and research income", () => {
    const state = fresh();
    const income = computeIncome(state, "player");
    expect(income.energy).toBeGreaterThan(0);
    expect(income.research).toBeGreaterThan(0);
  });

  it("applyEconomyTick increases resources and advances construction", () => {
    let state = fresh();
    const before = state.players.player!.resources.energy;
    // Place a building under construction
    const tid = Object.entries(state.territories).find(
      ([, t]) => t.owner === "player",
    )![0];
    state = {
      ...state,
      territories: {
        ...state.territories,
        [tid]: {
          ...state.territories[tid]!,
          buildings: [
            ...state.territories[tid]!.buildings,
            {
              instanceId: "btest",
              buildingId: "refinery",
              x: 5,
              y: 4,
              hp: 220,
              buildRemaining: 2,
            },
          ],
        },
      },
    };
    state = applyEconomyTick(state, "player");
    expect(state.players.player!.resources.energy).toBeGreaterThan(before);
    const b = state.territories[tid]!.buildings.find((x) => x.instanceId === "btest");
    expect(b?.buildRemaining).toBe(1);
  });

  it("canAfford and spend respect all resource channels", () => {
    const state = fresh();
    const p = state.players.player!;
    expect(canAfford(p, { energy: 10, alloy: 5, supply: 1 })).toBe(true);
    expect(canAfford(p, { energy: 99999 })).toBe(false);
    const spent = spend(p, { energy: 10, alloy: 5, supply: 1 });
    expect(spent.resources.energy).toBe(p.resources.energy - 10);
    expect(spent.resources.alloy).toBe(p.resources.alloy - 5);
    expect(spent.resources.supply).toBe(p.resources.supply - 1);
  });

  it("supply upkeep scales with reserves", () => {
    const state = fresh();
    const base = computeSupplyUpkeep(state, "player");
    const fat = {
      ...state,
      players: {
        ...state.players,
        player: {
          ...state.players.player!,
          reserves: { trooper: 40 },
        },
      },
    };
    expect(computeSupplyUpkeep(fat, "player")).toBeGreaterThan(base);
  });
});
