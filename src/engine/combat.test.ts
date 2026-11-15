import { describe, expect, it } from "vitest";
import { damageMultiplier } from "../data/combatMatrix";
import { getTerritory } from "../data/map/territories";
import { createInitialState } from "./init";
import { applyBattleResult, createBattle, tickBattle } from "./combat";
import { reduce } from "./reducer";

describe("combat matrix", () => {
  it("EMP strongly counters shielded armor", () => {
    expect(damageMultiplier("emp", "shielded")).toBeGreaterThan(
      damageMultiplier("kinetic", "shielded"),
    );
  });

  it("explosive is strong vs fortified", () => {
    expect(damageMultiplier("explosive", "fortified")).toBeGreaterThan(
      damageMultiplier("kinetic", "fortified"),
    );
  });
});

describe("battle simulation", () => {
  it("creates battle with attacker units and defender structures", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 7,
    });
    const enemy = Object.entries(state.territories).find(
      ([, t]) => t.owner !== "player",
    )![0];
    const battle = createBattle(state, enemy, "player", [
      { unitId: "trooper", count: 4 },
      { unitId: "hover_tank", count: 1 },
    ]);
    expect(battle.units.length).toBe(5);
    expect(battle.defenses.length).toBeGreaterThan(0);
    expect(battle.status).toBe("running");
  });

  it("tickBattle advances time and eventually resolves", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 99,
    });
    const enemy = Object.entries(state.territories).find(
      ([, t]) => t.owner !== "player",
    )![0];
    let battle = createBattle(state, enemy, "player", [
      { unitId: "trooper", count: 12 },
      { unitId: "siege_cannon", count: 3 },
      { unitId: "drone", count: 2 },
    ]);
    for (let i = 0; i < 400 && battle.status === "running"; i++) {
      battle = tickBattle(battle, 0.2);
    }
    expect(battle.status).not.toBe("running");
    expect(battle.elapsed).toBeGreaterThan(0);
  });

  it("applyBattleResult captures territory on attacker win", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 3,
    });
    const enemy = Object.entries(state.territories).find(
      ([, t]) => t.owner !== "player",
    )![0];
    const base = createBattle(state, enemy, "player", [
      { unitId: "trooper", count: 1 },
    ]);
    const battle = {
      ...base,
      status: "attacker_win" as const,
      defenses: base.defenses.map((d) => ({ ...d, hp: 0, alive: false })),
    };
    state = { ...state, battle, phase: "battle" };
    state = applyBattleResult(state);
    expect(state.territories[enemy]!.owner).toBe("player");
    expect(state.battle).toBeNull();
  });

  it("START_INVASION through reducer enters battle phase", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 11,
    });
    state = {
      ...state,
      players: {
        ...state.players,
        player: {
          ...state.players.player!,
          reserves: { trooper: 6 },
          resources: { ...state.players.player!.resources, supply: 50 },
        },
      },
    };
    const from = Object.entries(state.territories).find(
      ([, t]) => t.owner === "player",
    )![0];
    const to = getTerritory(from).neighbors.find(
      (n) => state.territories[n]?.owner !== "player",
    );
    expect(to).toBeTruthy();
    state = reduce(state, {
      type: "START_INVASION",
      payload: {
        fromId: from,
        toId: to!,
        force: [{ unitId: "trooper", count: 4 }],
      },
    });
    expect(state.phase).toBe("battle");
    expect(state.battle?.units.length).toBe(4);
  });
});
