import { describe, expect, it } from "vitest";
import { TERRITORIES } from "../data/map/territories";
import { createInitialState } from "./init";
import { resolveCaptureDisposition } from "./occupation";
import type { PendingCapture } from "./state";

describe("occupation copy", () => {
  it("uses display names and grammar for capture toasts", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 3,
      mapId: "world_war",
    });
    const home = Object.entries(state.territories).find(
      ([, ts]) => ts.owner === "player",
    )![0];
    const target = TERRITORIES.find((t) => t.id === home)!.neighbors.find(
      (n) => state.territories[n]?.owner === "neutral",
    )!;
    const pending: PendingCapture = {
      territoryId: target,
      attacker: "player",
      fromId: home,
      survivors: [{ unitId: "trooper", count: 6 }],
      population: 8,
      workers: 2,
      buildings: [],
      supplyStock: 0,
    };
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
      pendingCapture: pending,
      phase: "capture",
      screen: "capture",
    };
    const next = resolveCaptureDisposition(state, "keep", 4);
    const name = TERRITORIES.find((t) => t.id === target)!.name;
    expect(next.message).toBe(`${name} secured. 4 units occupying.`);
    expect(next.message).not.toContain(target);
    expect(next.message).not.toMatch(/occupy\./i);
  });
});
