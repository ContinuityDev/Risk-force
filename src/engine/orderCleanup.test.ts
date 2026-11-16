import { describe, expect, it } from "vitest";
import { activateMap } from "../data/maps/activate";
import { TERRITORIES } from "../data/map/territories";
import { applyBattleResult, createBattle } from "./combat";
import { createInitialState } from "./init";
import { scrubOrdersForTerritory } from "./orderCleanup";
import { reduce } from "./reducer";
import type { GameState } from "./state";

function withMarchAndRoute(
  state: GameState,
  fromId: string,
  toId: string,
): GameState {
  return {
    ...state,
    plannedRoute: [fromId, toId],
    armiesInTransit: [
      {
        id: "army_test",
        owner: "player",
        fromId,
        toId,
        force: [{ unitId: "trooper", count: 4 }],
        turnsRemaining: 2,
        totalTurns: 2,
      },
    ],
    aiAttackPlans: [
      {
        fromId,
        toId,
        force: [{ unitId: "trooper", count: 3 }],
      },
    ],
  };
}

describe("orderCleanup", () => {
  it("clears plannedRoute, invade marches, and AI plans when target is captured", () => {
    activateMap("world_war");
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 21,
      mapId: "world_war",
    });
    const home = Object.entries(state.territories).find(
      ([, ts]) => ts.owner === "player",
    )![0];
    const homeDef = TERRITORIES.find((t) => t.id === home)!;
    const target = homeDef.neighbors.find(
      (n) => state.territories[n]?.owner === "neutral",
    )!;
    state = withMarchAndRoute(state, home, target);

    // Capture: flip owner to player
    state = {
      ...state,
      territories: {
        ...state.territories,
        [target]: {
          ...state.territories[target]!,
          owner: "player",
          control: "occupied",
          garrison: {},
        },
      },
    };
    state = scrubOrdersForTerritory(state, target);

    expect(state.plannedRoute).toBeNull();
    expect(state.aiAttackPlans).toEqual([]);
    // March into now-friendly land merges as reinforcements
    expect(state.armiesInTransit).toHaveLength(0);
    expect(
      (state.territories[target]!.garrison.trooper ?? 0) >= 4,
    ).toBe(true);
    expect(state.message ?? "").toMatch(/cancelled|friendly|Route cleared/i);
    expect(state.message ?? "").not.toMatch(/_[a-z]/); // no snake_case ids
  });

  it("START_INVASION and END_TURN clear plannedRoute", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 9,
      mapId: "world_war",
    });
    const home = Object.entries(state.territories).find(
      ([, ts]) => ts.owner === "player",
    )![0];
    const target = TERRITORIES.find((t) => t.id === home)!.neighbors.find(
      (n) => state.territories[n]?.owner === "neutral",
    )!;
    state = {
      ...state,
      plannedRoute: [home, target],
      territories: {
        ...state.territories,
        [home]: {
          ...state.territories[home]!,
          garrison: { trooper: 10 },
          supplyStock: 40,
        },
        [target]: {
          ...state.territories[target]!,
          garrison: { trooper: 1 },
          buildings: [],
        },
      },
      players: {
        ...state.players,
        player: {
          ...state.players.player!,
          resources: {
            ...state.players.player!.resources,
            supply: 100,
            energy: 5000,
          },
        },
      },
    };
    state = reduce(state, {
      type: "START_INVASION",
      payload: {
        fromId: home,
        toId: target,
        force: [{ unitId: "trooper", count: 5 }],
      },
    });
    expect(state.plannedRoute).toBeNull();
    expect(state.armiesInTransit.length).toBeGreaterThan(0);

    state = {
      ...state,
      plannedRoute: [home, target],
    };
    state = reduce(state, { type: "END_TURN" });
    expect(state.plannedRoute).toBeNull();
  });

  it("RESOLVE_BATTLE capture scrubs stale orders on the taken land", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 3,
      mapId: "civil_war",
    });
    const home = Object.entries(state.territories).find(
      ([, ts]) => ts.owner === "player",
    )![0];
    const target = TERRITORIES.find((t) => t.id === home)!.neighbors.find(
      (n) => state.territories[n]?.owner === "neutral",
    )!;
    state = {
      ...withMarchAndRoute(state, home, target),
      territories: {
        ...state.territories,
        [home]: {
          ...state.territories[home]!,
          garrison: { trooper: 14, assault_mech: 2 },
        },
        [target]: {
          ...state.territories[target]!,
          garrison: { trooper: 1 },
          buildings: [],
        },
      },
    };
    const battle = createBattle(
      state,
      target,
      "player",
      [{ unitId: "trooper", count: 10 }],
      home,
    );
    // Force an instant attacker win
    let forced = {
      ...battle,
      status: "attacker_win" as const,
      units: battle.units.map((u) =>
        u.side === "defender" ? { ...u, alive: false, hp: 0 } : u,
      ),
    };
    state = { ...state, battle: forced, phase: "battle", screen: "battle" };
    state = applyBattleResult(state);
    expect(state.territories[target]!.owner).toBe("player");
    expect(state.plannedRoute).toBeNull();
    expect(
      (state.armiesInTransit ?? []).every(
        (a) => a.toId !== target || a.owner !== "player",
      ),
    ).toBe(true);
  });
});
