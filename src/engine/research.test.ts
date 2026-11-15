import { describe, expect, it } from "vitest";
import { RESEARCH_LIST } from "../data/research";
import { createInitialState } from "./init";
import { reduce } from "./reducer";
import {
  applyResearch,
  canResearch,
  hasResearched,
  isUnlocked,
  researchTurns,
  tickResearch,
} from "./research";

describe("research", () => {
  it("catalog has a deep tree across branches", () => {
    expect(RESEARCH_LIST.length).toBeGreaterThanOrEqual(40);
    const branches = new Set(RESEARCH_LIST.map((n) => n.branch));
    expect(branches.size).toBeGreaterThanOrEqual(8);
  });

  it("blocks nodes until prerequisites and cost are met", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 0,
      multiplayerMode: "solo",
      seed: 1,
    });
    const player = {
      ...state.players.player!,
      researched: [] as string[],
      researchJob: null,
      resources: { ...state.players.player!.resources, research: 0 },
    };
    expect(canResearch(player, "mech_corps")).toBe(false);
    const rich = {
      ...player,
      resources: { ...player.resources, research: 200 },
    };
    expect(canResearch(rich, "mech_corps")).toBe(true);
    expect(canResearch(rich, "grav_armor")).toBe(false);
  });

  it("applyResearch starts a multi-turn job; tick completes unlock", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 0,
      multiplayerMode: "solo",
      seed: 2,
    });
    const rich = {
      ...state.players.player!,
      researched: [] as string[],
      researchJob: null,
      resources: { ...state.players.player!.resources, research: 200 },
    };
    expect(isUnlocked(rich, "assault_mech")).toBe(false);
    const started = applyResearch(rich, "mech_corps");
    expect(started).not.toBeNull();
    expect(started!.researchJob?.nodeId).toBe("mech_corps");
    expect(hasResearched(started!, "mech_corps")).toBe(false);
    expect(started!.resources.research).toBeLessThan(rich.resources.research);

    let cur = started!;
    let completed: string | null = null;
    const turns = researchTurns("mech_corps");
    for (let i = 0; i < turns + 1; i++) {
      const tick = tickResearch(cur);
      cur = tick.player;
      if (tick.completed) completed = tick.completed;
    }
    expect(completed).toBe("mech_corps");
    expect(hasResearched(cur, "mech_corps")).toBe(true);
    expect(isUnlocked(cur, "assault_mech")).toBe(true);
    expect(cur.researchJob).toBeNull();
  });

  it("RESEARCH action via reducer starts job; END_TURN completes it", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 0,
      multiplayerMode: "solo",
      seed: 5,
    });
    state = {
      ...state,
      players: {
        ...state.players,
        player: {
          ...state.players.player!,
          researched: [],
          researchJob: null,
          resources: { ...state.players.player!.resources, research: 500 },
        },
      },
    };
    state = reduce(state, {
      type: "RESEARCH",
      payload: { nodeId: "mech_corps" },
    });
    expect(state.message).toMatch(/Research started/i);
    expect(state.players.player!.researchJob?.nodeId).toBe("mech_corps");
    const turns = state.players.player!.researchJob!.totalTurns;
    for (let i = 0; i < turns; i++) {
      state = reduce(state, { type: "END_TURN" });
    }
    expect(state.players.player!.researched).toContain("mech_corps");
    expect(state.players.player!.researchJob).toBeNull();
  });
});
