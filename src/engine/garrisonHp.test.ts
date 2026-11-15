import { describe, expect, it } from "vitest";
import { createInitialState } from "./init";
import {
  applyBattleResult,
  createBattle,
  retreatBattle,
  tickBattle,
} from "./combat";
import {
  damageScaleFromHp,
  ensureTerritoryHp,
  healGarrison,
  takeFromGarrison,
} from "./garrisonHp";
import { applyEconomyTick } from "./economy";
import { reduce } from "./reducer";

describe("persistent unit HP", () => {
  it("scales damage with remaining HP", () => {
    expect(damageScaleFromHp(100, 100)).toBe(1);
    expect(damageScaleFromHp(50, 100)).toBe(0.5);
    expect(damageScaleFromHp(1, 100)).toBe(0.35);
  });

  it("spawns battles from garrison/transit HP and preserves defender survivors", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 44,
    });
    const enemy = Object.entries(state.territories).find(
      ([, t]) => t.owner !== "player" && (t.garrison.trooper ?? 0) >= 1,
    )![0];
    const ts = ensureTerritoryHp({
      ...state.territories[enemy]!,
      garrison: { trooper: 2 },
      garrisonHp: { trooper: [20, 40] },
      buildings: [],
    });
    state = {
      ...state,
      territories: { ...state.territories, [enemy]: ts },
    };
    const battle = createBattle(
      state,
      enemy,
      "player",
      [{ unitId: "trooper", count: 1, hps: [25] }],
      "france",
    );
    expect(battle.fromId).toBe("france");
    const atk = battle.units.find((u) => u.side === "attacker")!;
    expect(atk.hp).toBe(25);
    const defs = battle.units.filter((u) => u.side === "defender");
    expect(defs.map((d) => d.hp).sort((a, b) => a - b)).toEqual([20, 40]);
  });

  it("Repair Bay heals garrison HP each economy tick", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 0,
      multiplayerMode: "solo",
      seed: 2,
    });
    const tid = Object.entries(state.territories).find(
      ([, t]) => t.owner === "player" && t.buildings.length > 0,
    )![0];
    const ts = state.territories[tid]!;
    state = {
      ...state,
      territories: {
        ...state.territories,
        [tid]: {
          ...ts,
          garrison: { trooper: 1 },
          garrisonHp: { trooper: [10] },
          buildings: [
            ...ts.buildings,
            {
              instanceId: "rb1",
              buildingId: "repair_bay",
              x: 0,
              y: 3,
              hp: 200,
              buildRemaining: 0,
              workers: 0,
            },
          ],
        },
      },
    };
    state = applyEconomyTick(state, "player");
    const hp = state.territories[tid]!.garrisonHp.trooper![0]!;
    expect(hp).toBeGreaterThan(10);
  });

  it("healGarrison caps at maxHp", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 0,
      multiplayerMode: "solo",
      seed: 3,
    });
    const tid = Object.keys(state.territories)[0]!;
    const ts = {
      ...state.territories[tid]!,
      garrison: { trooper: 1 },
      garrisonHp: { trooper: [5] },
    };
    const healed = healGarrison(ts, 999);
    expect(healed.garrisonHp.trooper![0]).toBeGreaterThan(5);
  });

  it("takeFromGarrison prefers damaged units", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 0,
      multiplayerMode: "solo",
      seed: 4,
    });
    const tid = Object.keys(state.territories)[0]!;
    const ts = ensureTerritoryHp({
      ...state.territories[tid]!,
      garrison: { trooper: 3 },
      garrisonHp: { trooper: [40, 10, 30] },
    });
    const pulled = takeFromGarrison(ts, "trooper", 2)!;
    expect(pulled.hps).toEqual([10, 30]);
    expect(pulled.territory.garrison.trooper).toBe(1);
    expect(pulled.territory.garrisonHp.trooper).toEqual([40]);
  });
});

describe("retreat + capture origin", () => {
  it("retreat sends survivors toward battle.fromId", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 8,
    });
    const home = Object.entries(state.territories).find(
      ([, t]) => t.owner === "player",
    )![0];
    const enemy = Object.entries(state.territories).find(
      ([, t]) => t.owner !== "player",
    )![0];
    const battle = createBattle(
      state,
      enemy,
      "player",
      [{ unitId: "trooper", count: 3 }],
      home,
    );
    state = { ...state, battle, phase: "battle", screen: "battle" };
    state = retreatBattle(state);
    expect(state.battle).toBeNull();
    expect(state.phase).toBe("play");
    const retreat = state.armiesInTransit.find((a) => a.toId === home);
    expect(retreat).toBeTruthy();
    expect(retreat!.force.reduce((s, f) => s + f.count, 0)).toBe(3);
  });

  it("applyBattleResult sets pendingCapture.fromId from arriving army origin", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 9,
    });
    const home = Object.entries(state.territories).find(
      ([, t]) => t.owner === "player",
    )![0];
    const enemy = Object.entries(state.territories).find(
      ([, t]) => t.owner !== "player",
    )![0];
    const base = createBattle(
      state,
      enemy,
      "player",
      [{ unitId: "trooper", count: 2 }],
      home,
    );
    state = {
      ...state,
      battle: {
        ...base,
        status: "attacker_win",
        defenses: base.defenses.map((d) => ({ ...d, hp: 0, alive: false })),
        units: base.units.map((u) =>
          u.side === "defender"
            ? { ...u, hp: 0, alive: false }
            : u,
        ),
      },
      phase: "battle",
    };
    state = applyBattleResult(state);
    expect(state.pendingCapture?.fromId).toBe(home);
  });

  it("RETREAT_BATTLE action works through reducer", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 10,
    });
    const home = Object.entries(state.territories).find(
      ([, t]) => t.owner === "player",
    )![0];
    const enemy = Object.entries(state.territories).find(
      ([, t]) => t.owner !== "player",
    )![0];
    state = {
      ...state,
      battle: createBattle(
        state,
        enemy,
        "player",
        [{ unitId: "trooper", count: 1 }],
        home,
      ),
      phase: "battle",
    };
    state = reduce(state, { type: "RETREAT_BATTLE" });
    expect(state.phase).toBe("play");
    expect(state.battle).toBeNull();
  });
});
