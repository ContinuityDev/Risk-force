import { describe, expect, it } from "vitest";
import { applyArmyTemplate, saveArmyTemplate } from "./armyTemplates";
import { createInitialState } from "./init";
import { reduce } from "./reducer";
import { approximateGarrison, isTerritoryRevealed } from "./recon";
import { applyStrike } from "./strikes";
import { rollTheaterEvent } from "./theaterEvents";
import type { StrikeForceSlot } from "./state";

function withAsset(
  seed = 11,
): ReturnType<typeof createInitialState> {
  let state = createInitialState({
    humanCount: 1,
    aiCount: 1,
    multiplayerMode: "solo",
    seed,
    doctrineId: "skyborne",
  });
  const home = Object.entries(state.territories).find(
    ([, t]) => t.owner === "player" && Object.keys(t.garrison).length,
  )![0];
  const enemy = Object.entries(state.territories).find(
    ([, t]) => t.owner !== "player",
  )![0];
  const ts = state.territories[home]!;
  state = {
    ...state,
    selectedTerritoryId: home,
    territories: {
      ...state.territories,
      [home]: {
        ...ts,
        garrison: {
          ...ts.garrison,
          cruise_launcher: 1,
          stealth_recon_drone: 1,
          orbital_strike_uplink: 1,
        },
        buildings: [
          ...ts.buildings,
          {
            instanceId: "b-uplink",
            buildingId: "uplink_array",
            x: 1,
            y: 1,
            hp: 200,
            buildRemaining: 0,
            workers: 0,
          },
        ],
      },
    },
  };
  return { ...state, selectedTerritoryId: enemy };
}

describe("strikes + recon", () => {
  it("cruise strike damages buildings, cuts supply, posts news + FX", () => {
    let state = withAsset();
    const enemy = state.selectedTerritoryId!;
    const beforeHp = state.territories[enemy]!.buildings.reduce(
      (s, b) => s + b.hp,
      0,
    );
    state = applyStrike(state, "player", "cruise", enemy);
    const afterHp = state.territories[enemy]!.buildings.reduce(
      (s, b) => s + b.hp,
      0,
    );
    expect(afterHp).toBeLessThanOrEqual(beforeHp);
    expect(state.territories[enemy]!.supplyCutTurns).toBeGreaterThan(0);
    expect(state.strikeFx?.length).toBeGreaterThan(0);
    expect(state.newsFeed.some((n) => /Cruise/i.test(n.headline))).toBe(true);
    expect(state.players.player!.strikeCooldowns?.cruise).toBeGreaterThan(0);
  });

  it("recon reveals exact garrison; otherwise approximate ranges", () => {
    let state = withAsset(22);
    const enemy = Object.entries(state.territories).find(
      ([, t]) => t.owner !== "player",
    )![0];
    expect(isTerritoryRevealed(state, "player", enemy)).toBe(false);
    const approx = approximateGarrison(state.territories[enemy]!.garrison);
    expect(approx.every((g) => g.hi >= g.lo)).toBe(true);

    state = reduce(state, {
      type: "LAUNCH_RECON",
      payload: { targetId: enemy, mode: "drone" },
    });
    expect(isTerritoryRevealed(state, "player", enemy)).toBe(true);
  });

  it("theater event can fire on roll", () => {
    const base = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 77,
    });
    // Force a few rolls across seeds by mutating turn
    let hit = false;
    for (let t = 1; t < 40; t++) {
      const next = rollTheaterEvent({ ...base, turn: t, seed: 77 + t });
      if ((next.theaterEvents?.length ?? 0) > 0) {
        hit = true;
        expect(next.newsFeed.some((n) => n.category === "general")).toBe(true);
        break;
      }
    }
    expect(hit).toBe(true);
  });

  it("army template applies clamped to garrison", () => {
    const force: StrikeForceSlot[] = [
      { unitId: "trooper", count: 99 },
      { unitId: "hover_tank", count: 1 },
    ];
    const player = createInitialState({
      humanCount: 1,
      aiCount: 0,
      multiplayerMode: "solo",
      seed: 1,
    }).players.player!;
    const withTpl = saveArmyTemplate(player, "Alpha", force);
    const tpl = withTpl.armyTemplates![0]!;
    const applied = applyArmyTemplate({ trooper: 3 }, tpl);
    expect(applied).toEqual([{ unitId: "trooper", count: 3 }]);
  });
});
