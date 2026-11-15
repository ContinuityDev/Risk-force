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
    const owned = TERRITORIES.filter(
      (t) => state.territories[t.id]?.owner === aiId,
    );
    const frontiers = owned.filter((t) =>
      t.neighbors.some((n) => state.territories[n]?.owner !== aiId),
    );
    expect(frontiers.length).toBeGreaterThanOrEqual(2);

    for (const t of frontiers.slice(0, 5)) {
      state = {
        ...state,
        territories: {
          ...state.territories,
          [t.id]: {
            ...state.territories[t.id]!,
            garrison: {
              trooper: 10,
              assault_mech: 3,
              hover_tank: 2,
            },
          },
        },
      };
    }
    state = {
      ...state,
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
    const owned = TERRITORIES.filter(
      (t) => state.territories[t.id]?.owner === aiId,
    );
    const frontiers = owned.filter((t) =>
      t.neighbors.some((n) => state.territories[n]?.owner !== aiId),
    );
    const safe = owned.filter((t) => !frontiers.some((f) => f.id === t.id));
    expect(frontiers.length).toBeGreaterThan(0);
    expect(safe.length).toBeGreaterThan(0);

    const weakFront = frontiers[0]!;
    const fatRear = safe[0]!;
    state = {
      ...state,
      territories: {
        ...state.territories,
        [weakFront.id]: {
          ...state.territories[weakFront.id]!,
          garrison: { trooper: 1 },
        },
        [fatRear.id]: {
          ...state.territories[fatRear.id]!,
          garrison: { trooper: 12, assault_mech: 2 },
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

    const actions = planAiTurn(state);
    const reinforce = actions.filter((a) => a.type === "MOVE_GARRISON");
    expect(reinforce.length).toBeGreaterThanOrEqual(1);
    const toFront = reinforce.find(
      (a) =>
        a.type === "MOVE_GARRISON" && a.payload.toId === weakFront.id,
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
