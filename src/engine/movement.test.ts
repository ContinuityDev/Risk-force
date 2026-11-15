import { describe, expect, it } from "vitest";
import { TERRITORIES, getTerritory } from "../data/map/territories";
import { createInitialState } from "./init";
import {
  startArmyMove,
  tickArmiesForPlayer,
  travelTurns,
} from "./movement";
import { reduce } from "./reducer";

describe("strategic movement", () => {
  it("computes multi-turn travel from distance and slowest unit", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 21,
    });
    const from = Object.keys(state.territories).find(
      (id) => state.territories[id]!.owner === "player",
    )!;
    const any = getTerritory(from).neighbors[0]!;
    const turns = travelTurns(from, any, [
      { unitId: "trooper", count: 2 },
      { unitId: "siege_cannon", count: 1 },
    ]);
    expect(turns).toBeGreaterThanOrEqual(1);
    expect(turns).toBeLessThanOrEqual(8);
  });

  it("places armies in transit and arrives after enough ticks", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 33,
    });
    const fromId = Object.keys(state.territories).find(
      (id) => state.territories[id]!.owner === "player",
    )!;
    const toId = TERRITORIES.find((t) => t.id === fromId)!.neighbors[0]!;
    state = {
      ...state,
      territories: {
        ...state.territories,
        [toId]: {
          ...state.territories[toId]!,
          owner: "player",
        },
        [fromId]: {
          ...state.territories[fromId]!,
          garrison: { trooper: 5 },
        },
      },
    };

    state = startArmyMove(state, "player", fromId, toId, [
      { unitId: "trooper", count: 3 },
    ]);
    expect(state.armiesInTransit.length).toBe(1);
    expect(state.territories[fromId]!.garrison.trooper).toBe(2);

    const eta = state.armiesInTransit[0]!.turnsRemaining;
    for (let i = 0; i < eta; i++) {
      state = tickArmiesForPlayer(state, "player");
    }
    expect(state.armiesInTransit.length).toBe(0);
    expect(
      state.territories[toId]!.garrison.trooper ?? 0,
    ).toBeGreaterThanOrEqual(3);
  });

  it("ORDER_MOVE through reducer enqueues transit", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 44,
    });
    const fromId = Object.keys(state.territories).find(
      (id) => state.territories[id]!.owner === "player",
    )!;
    const toId = TERRITORIES.find((t) => t.id === fromId)!.neighbors[0]!;
    state = {
      ...state,
      territories: {
        ...state.territories,
        [fromId]: {
          ...state.territories[fromId]!,
          garrison: { trooper: 4 },
        },
        [toId]: {
          ...state.territories[toId]!,
          owner: "player",
        },
      },
    };
    state = reduce(state, {
      type: "ORDER_MOVE",
      payload: {
        fromId,
        toId,
        force: [{ unitId: "trooper", count: 2 }],
      },
    });
    expect(state.armiesInTransit.length).toBe(1);
  });
});
