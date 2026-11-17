import { describe, expect, it } from "vitest";
import { getTerritory } from "../data/map/territories";
import { createInitialState } from "./init";
import { tickArmiesForPlayer } from "./movement";
import { reduce } from "./reducer";
import type { GameState } from "./state";

function withGarrison(
  state: GameState,
  tid: string,
  garrison: Record<string, number>,
): GameState {
  return {
    ...state,
    territories: {
      ...state.territories,
      [tid]: {
        ...state.territories[tid]!,
        owner: "player",
        garrison,
        garrisonHp: {},
      },
    },
  };
}

function ownPlot(state: GameState, tid: string): GameState {
  const cur = state.territories[tid]!;
  return {
    ...state,
    territories: {
      ...state.territories,
      [tid]: {
        ...cur,
        owner: "player",
        garrison: cur.garrison ?? {},
        garrisonHp: cur.garrisonHp ?? {},
        buildings: cur.buildings ?? [],
        population: cur.population ?? 5,
        workers: cur.workers ?? 0,
        supplyStock: cur.supplyStock ?? 0,
        trainingQueue: cur.trainingQueue ?? [],
        control: cur.control ?? "occupied",
        occupiedTurns: cur.occupiedTurns ?? 0,
      },
    },
  };
}

describe("squads", () => {
  it("creates a squad from garrison and parks it idle", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 11,
    });
    const home = Object.entries(state.territories).find(
      ([, t]) => t.owner === "player",
    )![0];
    state = withGarrison(state, home, { trooper: 5, assault_mech: 2 });
    state = reduce(state, {
      type: "CREATE_SQUAD",
      payload: {
        territoryId: home,
        force: [
          { unitId: "trooper", count: 3 },
          { unitId: "assault_mech", count: 1 },
        ],
        name: "Alpha",
      },
    });
    expect(state.squads).toHaveLength(1);
    expect(state.squads[0]!.name).toBe("Alpha");
    expect(state.squads[0]!.status).toBe("idle");
    expect(state.territories[home]!.garrison.trooper).toBe(2);
    expect(state.territories[home]!.garrison.assault_mech).toBe(1);
  });

  it("marches a squad onto owned land and parks idle there", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 12,
    });
    const home = Object.entries(state.territories).find(
      ([, t]) => t.owner === "player",
    )![0];
    const dest = getTerritory(home).neighbors[0]!;
    state = withGarrison(state, home, { trooper: 4 });
    state = ownPlot(state, dest);
    state = {
      ...state,
      territories: {
        ...state.territories,
        [dest]: { ...state.territories[dest]!, garrison: {}, garrisonHp: {} },
      },
    };
    state = reduce(state, {
      type: "CREATE_SQUAD",
      payload: {
        territoryId: home,
        force: [{ unitId: "trooper", count: 2 }],
        name: "Relay",
      },
    });
    const squadId = state.squads[0]!.id;
    state = reduce(state, {
      type: "ORDER_SQUAD_MOVE",
      payload: { squadId, toId: dest },
    });
    expect(state.squads[0]!.status).toBe("marching");
    expect(state.armiesInTransit.some((a) => a.squadId === squadId)).toBe(
      true,
    );
    for (let i = 0; i < 12; i++) {
      state = tickArmiesForPlayer(state, "player");
      if (state.squads[0]?.status === "idle") break;
    }
    expect(state.squads[0]!.status).toBe("idle");
    expect(state.squads[0]!.territoryId).toBe(dest);
  });

  it("adds distant units as joiners that merge on arrival", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 13,
    });
    const home = Object.entries(state.territories).find(
      ([, t]) => t.owner === "player",
    )![0];
    const n1 = getTerritory(home).neighbors[0]!;
    state = withGarrison(state, home, { trooper: 3 });
    state = ownPlot(state, n1);
    state = {
      ...state,
      territories: {
        ...state.territories,
        [n1]: {
          ...state.territories[n1]!,
          garrison: { trooper: 4 },
          garrisonHp: {},
        },
      },
    };
    state = reduce(state, {
      type: "CREATE_SQUAD",
      payload: {
        territoryId: home,
        force: [{ unitId: "trooper", count: 2 }],
        name: "Core",
      },
    });
    const squadId = state.squads[0]!.id;
    state = reduce(state, {
      type: "ADD_TO_SQUAD",
      payload: {
        squadId,
        fromId: n1,
        force: [{ unitId: "trooper", count: 2 }],
      },
    });
    expect(
      state.armiesInTransit.some((a) => a.joiningSquadId === squadId),
    ).toBe(true);
    for (let i = 0; i < 12; i++) {
      state = tickArmiesForPlayer(state, "player");
      if (!state.armiesInTransit.some((a) => a.joiningSquadId === squadId)) {
        break;
      }
    }
    const squad = state.squads.find((s) => s.id === squadId)!;
    expect(squad.force.find((f) => f.unitId === "trooper")!.count).toBe(4);
  });

  it("departs units into a new squad", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 14,
    });
    const home = Object.entries(state.territories).find(
      ([, t]) => t.owner === "player",
    )![0];
    state = withGarrison(state, home, { trooper: 6 });
    state = reduce(state, {
      type: "CREATE_SQUAD",
      payload: {
        territoryId: home,
        force: [{ unitId: "trooper", count: 5 }],
        name: "Main",
      },
    });
    const squadId = state.squads[0]!.id;
    state = reduce(state, {
      type: "DEPART_SQUAD",
      payload: {
        squadId,
        force: [{ unitId: "trooper", count: 2 }],
        mode: "new_squad",
        name: "Scout",
      },
    });
    expect(state.squads).toHaveLength(2);
    expect(state.squads.some((s) => s.name === "Scout")).toBe(true);
  });
});
