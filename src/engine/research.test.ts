import { describe, expect, it } from "vitest";
import { RESEARCH_LIST } from "../data/research";
import { createInitialState } from "./init";
import { reduce } from "./reducer";
import {
  applyResearch,
  canResearch,
  hasResearched,
  isUnlocked,
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
      resources: { ...state.players.player!.resources, research: 0 },
    };
    expect(canResearch(player, "mech_corps")).toBe(false);
    const rich = {
      ...player,
      resources: { ...player.resources, research: 200 },
    };
    expect(canResearch(rich, "mech_corps")).toBe(true);
    expect(canResearch(rich, "grav_armor")).toBe(false); // needs mech_corps
  });

  it("applyResearch spends points and unlocks units", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 0,
      multiplayerMode: "solo",
      seed: 2,
    });
    const rich = {
      ...state.players.player!,
      resources: { ...state.players.player!.resources, research: 200 },
    };
    expect(isUnlocked(rich, "assault_mech")).toBe(false);
    const next = applyResearch(rich, "mech_corps");
    expect(next).not.toBeNull();
    expect(hasResearched(next!, "mech_corps")).toBe(true);
    expect(isUnlocked(next!, "assault_mech")).toBe(true);
    expect(next!.resources.research).toBeLessThan(rich.resources.research);
  });

  it("RESEARCH action via reducer unlocks nested tech", () => {
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
          resources: { ...state.players.player!.resources, research: 500 },
        },
      },
    };
    state = reduce(state, { type: "RESEARCH", payload: { nodeId: "mech_corps" } });
    state = reduce(state, { type: "RESEARCH", payload: { nodeId: "grav_armor" } });
    expect(state.players.player!.researched).toContain("grav_armor");
    expect(isUnlocked(state.players.player!, "hover_tank")).toBe(true);
  });
});
