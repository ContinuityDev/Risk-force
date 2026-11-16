import { describe, expect, it } from "vitest";
import { AI_PERSONALITIES } from "../data/gameLoop";
import { TERRITORIES } from "../data/map/territories";
import { planAiTurn, planAttacks } from "./ai";
import { describeAiAction } from "./aiLog";
import { createInitialState } from "./init";

describe("AI multi-front + border defense", () => {
  it("flanking personalities open multiple fronts from distinct borders", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 77,
    });
    const aiId = "faction_b"; // flanking 0.85
    expect(state.players[aiId]).toBeTruthy();

    // Seed two owned frontiers (one-start world needs artificial expansion)
    const home = Object.entries(state.territories).find(
      ([, ts]) => ts.owner === aiId,
    )![0];
    const n1 = TERRITORIES.find((t) => t.id === home)!.neighbors[0]!;
    const n2 =
      TERRITORIES.find((t) => t.id === home)!.neighbors.find((n) => n !== n1) ??
      TERRITORIES.find((t) => t.id === n1)!.neighbors.find(
        (n) => n !== home && state.territories[n]?.owner !== aiId,
      )!;
    state = {
      ...state,
      territories: {
        ...state.territories,
        [home]: {
          ...state.territories[home]!,
          garrison: { trooper: 10, assault_mech: 3, hover_tank: 2 },
        },
        [n1]: {
          ...state.territories[n1]!,
          owner: aiId,
          garrison: { trooper: 10, assault_mech: 3, hover_tank: 2 },
        },
        [n2]: {
          ...state.territories[n2]!,
          owner: aiId,
          garrison: { trooper: 10, assault_mech: 3, hover_tank: 2 },
        },
      },
      players: {
        ...state.players,
        [aiId]: {
          ...state.players[aiId]!,
          resources: {
            ...state.players[aiId]!.resources,
            energy: 5000,
            supply: 100,
          },
        },
      },
      activePlayerIndex: state.playerOrder.indexOf(aiId),
    };

    const plans = planAttacks(
      state,
      aiId,
      AI_PERSONALITIES.faction_b,
    );
    expect(plans.length).toBeGreaterThanOrEqual(2);
    expect(plans[0]!.fromId).not.toBe(plans[1]!.fromId);
    expect(plans[0]!.toId).not.toBe(plans[1]!.toId);
  });

  it("defensive AI reinforces threatened borders from safe interiors", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 12,
    });
    const aiId = "faction_a"; // defense 0.85
    // Pick a connected pair: frontier (adjacent to foreign land) + safe rear.
    const pair = TERRITORIES.find((t) => {
      const n0 = t.neighbors[0];
      return !!n0 && t.neighbors.length >= 2;
    })!;
    const frontierId = pair.id;
    const rearId = pair.neighbors[1]!;
    const foreign = pair.neighbors.find(
      (n) => n !== rearId,
    )!;

    state = {
      ...state,
      territories: {
        ...state.territories,
        [frontierId]: {
          ...state.territories[frontierId]!,
          owner: aiId,
          garrison: { trooper: 1 },
          buildings: state.territories[frontierId]!.buildings,
        },
        [rearId]: {
          ...state.territories[rearId]!,
          owner: aiId,
          garrison: { trooper: 12, assault_mech: 2 },
          // Interior if all neighbors are owned — also mark other neighbors as ours briefly
        },
        [foreign]: {
          ...state.territories[foreign]!,
          owner: "player",
          garrison: { trooper: 3 },
        },
      },
      activePlayerIndex: state.playerOrder.indexOf(aiId),
      players: {
        ...state.players,
        [aiId]: {
          ...state.players[aiId]!,
          resources: {
            ...state.players[aiId]!.resources,
            energy: 4000,
            alloy: 400,
            supply: 80,
          },
        },
      },
    };

    // Make rear fully interior: claim all its non-frontier neighbors
    const rearOwned: Record<string, typeof state.territories[string]> = {
      ...state.territories,
    };
    for (const n of TERRITORIES.find((t) => t.id === rearId)!.neighbors) {
      if (n === frontierId) continue;
      rearOwned[n] = {
        ...rearOwned[n]!,
        owner: aiId,
        garrison: { trooper: 2 },
      };
    }
    state = { ...state, territories: rearOwned };

    const actions = planAiTurn(state);
    const reinforce = actions.filter((a) => a.type === "MOVE_GARRISON");
    expect(reinforce.length).toBeGreaterThanOrEqual(1);
    const toFront = reinforce.find(
      (a) =>
        a.type === "MOVE_GARRISON" && a.payload.toId === frontierId,
    );
    expect(toFront).toBeTruthy();
  });

  it("describes AI actions with territory and force detail", () => {
    const line = describeAiAction("Faction A", {
      type: "SET_AI_ATTACK_PLANS",
      payload: {
        plans: [
          {
            fromId: "france",
            toId: "germany",
            force: [{ unitId: "trooper", count: 4 }],
          },
          {
            fromId: "spain",
            toId: "algeria",
            force: [{ unitId: "hover_tank", count: 1 }],
          },
        ],
      },
    });
    expect(line).toMatch(/2 front/);
    expect(line).toMatch(/France|france/i);
    expect(line).toMatch(/Germany|germany/i);

    const build = describeAiAction("Faction A", {
      type: "PLACE_BUILDING",
      payload: {
        territoryId: "egypt",
        buildingId: "reactor",
        x: 0,
        y: 0,
      },
    });
    expect(build).toMatch(/builds/i);
    expect(build).toMatch(/Egypt|egypt/i);
  });
});
