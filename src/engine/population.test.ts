import { describe, expect, it } from "vitest";
import { computeRecruitment } from "./population";
import { assignTerritoriesBalanced, createInitialState } from "./init";
import { planAttacks } from "./ai";
import { reduce } from "./reducer";
import { TERRITORIES } from "../data/map/territories";

describe("population / campaigning", () => {
  it("campaign spend beats land-only recruitment", () => {
    const landOnly = computeRecruitment(0.4, 0);
    const richSmall = computeRecruitment(0.08, 120);
    expect(richSmall).toBeGreaterThan(landOnly);
  });

  it("sqrt diminishing returns on campaign spend", () => {
    const a = computeRecruitment(0.2, 25);
    const b = computeRecruitment(0.2, 100);
    // 4× spend should not yield 4× recruits
    expect(b - a).toBeLessThan(a * 3);
  });
});

describe("starting assignment", () => {
  it("assigns one start each (seeded, distinct)", () => {
    const a = assignTerritoriesBalanced(["player", "faction_a", "faction_b"], 42);
    const b = assignTerritoriesBalanced(["player", "faction_a", "faction_b"], 42);
    expect(a).toEqual(b);
    const counts = Object.values(a).map((bag) => bag.length);
    expect(counts.every((n) => n === 1)).toBe(true);
    const all = Object.values(a).flat();
    expect(new Set(all).size).toBe(3);
  });

  it("createInitialState uses seed for reproducible owners", () => {
    const s1 = createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 12345,
    });
    const s2 = createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 12345,
    });
    expect(
      Object.fromEntries(
        Object.entries(s1.territories).map(([id, t]) => [id, t.owner]),
      ),
    ).toEqual(
      Object.fromEntries(
        Object.entries(s2.territories).map(([id, t]) => [id, t.owner]),
      ),
    );
  });
});

describe("AI strategy", () => {
  it("distributes attack plans across fronts when flanking", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 77,
    });
    // Give AI fat garrisons on multiple frontier territories
    const aiId = state.playerOrder.find((id) => id !== "player")!;
    const owned = TERRITORIES.filter(
      (t) => state.territories[t.id]?.owner === aiId,
    );
    const frontiers = owned.filter((t) =>
      t.neighbors.some((n) => state.territories[n]?.owner !== aiId),
    );
    for (const t of frontiers.slice(0, 4)) {
      state = {
        ...state,
        territories: {
          ...state.territories,
          [t.id]: {
            ...state.territories[t.id]!,
            garrison: { trooper: 8, assault_mech: 2 },
          },
        },
        players: {
          ...state.players,
          [aiId]: {
            ...state.players[aiId]!,
            resources: {
              ...state.players[aiId]!.resources,
              supply: 80,
            },
          },
        },
      };
    }
    state = {
      ...state,
      activePlayerIndex: state.playerOrder.indexOf(aiId),
    };
    const plans = planAttacks(state, aiId);
    expect(plans.length).toBeGreaterThanOrEqual(1);
    if (plans.length > 1) {
      expect(plans[0]!.fromId).not.toBe(plans[1]!.fromId);
    }
    // Weak target preference: defense score of target should be finite
    for (const p of plans) {
      expect(state.territories[p.toId]!.owner).not.toBe(aiId);
      expect(p.force.reduce((s, f) => s + f.count, 0)).toBeGreaterThan(0);
    }
  });

  it("SET_CAMPAIGN_BUDGET stores tunable spend", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 1,
    });
    state = reduce(state, {
      type: "SET_CAMPAIGN_BUDGET",
      payload: { energy: 75 },
    });
    expect(state.players.player!.campaignBudget).toBe(75);
  });
});
