import { describe, expect, it } from "vitest";
import { createInitialState } from "./init";
import { activePlayerId, reduce } from "./reducer";

describe("reducer / turns", () => {
  it("NEW_GAME creates serializable state with humans and AI", () => {
    const state = reduce(
      createInitialState({
        humanCount: 1,
        aiCount: 1,
        multiplayerMode: "solo",
        seed: 1,
      }),
      {
        type: "NEW_GAME",
        payload: {
          humanCount: 2,
          aiCount: 1,
          multiplayerMode: "hotseat",
          humanNames: ["Alpha", "Beta"],
          seed: 123,
        },
      },
    );
    expect(state.version).toBe(1);
    expect(state.multiplayerMode).toBe("hotseat");
    expect(state.playerOrder.length).toBe(3);
    expect(JSON.parse(JSON.stringify(state)).seed).toBe(123);
  });

  it("END_TURN rotates players and applies economy", () => {
    let state = createInitialState({
      humanCount: 2,
      aiCount: 0,
      multiplayerMode: "hotseat",
      seed: 8,
      humanNames: ["A", "B"],
    });
    const first = activePlayerId(state);
    const secondEnergyBefore =
      state.players[state.playerOrder[1]!]!.resources.energy;
    state = reduce(state, { type: "END_TURN" });
    expect(activePlayerId(state)).not.toBe(first);
    expect(
      state.players[activePlayerId(state)]!.resources.energy,
    ).toBeGreaterThanOrEqual(secondEnergyBefore);
  });

  it("PLACE_BUILDING spends resources on owned territory", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 0,
      multiplayerMode: "solo",
      seed: 4,
    });
    const tid = Object.entries(state.territories).find(
      ([, t]) => t.owner === "player",
    )![0];
    const before = state.players.player!.resources.energy;
    const beforeCount = state.territories[tid]!.buildings.length;
    state = reduce(state, {
      type: "PLACE_BUILDING",
      payload: { territoryId: tid, buildingId: "reactor", x: 5, y: 0 },
    });
    expect(state.territories[tid]!.buildings.length).toBe(beforeCount + 1);
    expect(state.players.player!.resources.energy).toBeLessThan(before);
  });
});
