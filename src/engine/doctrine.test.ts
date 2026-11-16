import { describe, expect, it } from "vitest";
import { createInitialState } from "./init";
import { unitTrainCost } from "./training";
import { getDoctrine } from "../data/doctrines";
import { reduce } from "./reducer";

describe("doctrines", () => {
  it("humans start with doctrine opening tech only (no flat handicap dump)", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 42,
      doctrineId: "vanguard",
    });
    const p = state.players.player!;
    expect(p.doctrineId).toBe("vanguard");
    expect(p.researched).toEqual(
      expect.arrayContaining(getDoctrine("vanguard").openingTech),
    );
    expect(p.researched).not.toContain("siege_protocols");
    expect(p.researched.length).toBeLessThanOrEqual(4);
  });

  it("vanguard infantry trains cheaper than ironclad", () => {
    const v = createInitialState({
      humanCount: 1,
      aiCount: 0,
      multiplayerMode: "solo",
      seed: 1,
      doctrineId: "vanguard",
    });
    const i = createInitialState({
      humanCount: 1,
      aiCount: 0,
      multiplayerMode: "solo",
      seed: 1,
      doctrineId: "ironclad",
    });
    const vc = unitTrainCost("trooper", 1, v.players.player!);
    const ic = unitTrainCost("trooper", 1, i.players.player!);
    expect(vc.energy).toBeLessThan(ic.energy);
  });

  it("AI factions get assigned doctrines", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 3,
      multiplayerMode: "solo",
      seed: 9,
    });
    expect(state.players.faction_a?.doctrineId).toBe("ironclad");
    expect(state.players.faction_b?.doctrineId).toBe("skyborne");
    expect(state.players.faction_c?.doctrineId).toBe("spectre");
  });

  it("NEW_GAME accepts humanDoctrines", () => {
    const state = reduce(createInitialState({
      humanCount: 1,
      aiCount: 0,
      multiplayerMode: "solo",
      seed: 2,
    }), {
      type: "NEW_GAME",
      payload: {
        humanCount: 2,
        aiCount: 0,
        multiplayerMode: "hotseat",
        seed: 3,
        humanDoctrines: ["spectre", "skyborne"],
      },
    });
    expect(state.players.player?.doctrineId).toBe("spectre");
    expect(state.players.faction_a?.doctrineId).toBe("skyborne");
  });
});
