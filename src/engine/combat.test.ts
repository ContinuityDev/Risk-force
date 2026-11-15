import { describe, expect, it } from "vitest";
import { isOnGround } from "../data/battleField";
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
    const attackers = battle.units.filter((u) => u.side === "attacker");
    expect(attackers.length).toBe(5);
    expect(battle.units.some((u) => u.side === "defender")).toBe(true);
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
    expect(state.territories[enemy]!.buildings.length).toBe(0);
    expect(state.battle).toBeNull();
  });

  it("all spawned units and buildings lie on the ground plane", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 42,
    });
    const enemy = Object.entries(state.territories).find(
      ([, t]) => t.owner !== "player" && t.buildings.length > 0,
    )![0];
    const battle = createBattle(state, enemy, "player", [
      { unitId: "trooper", count: 8 },
      { unitId: "hover_tank", count: 2 },
      { unitId: "siege_cannon", count: 2 },
      { unitId: "drone", count: 2 },
    ]);
    for (const u of battle.units) {
      expect(isOnGround(u.x, u.y), `unit ${u.id} at ${u.x},${u.y}`).toBe(true);
    }
    for (const d of battle.defenses) {
      expect(isOnGround(d.x, d.y), `def ${d.id} at ${d.x},${d.y}`).toBe(true);
    }
    // After movement ticks, attackers stay on ground
    let b = battle;
    for (let i = 0; i < 40; i++) b = tickBattle(b, 0.2);
    for (const u of b.units.filter((x) => x.alive)) {
      expect(isOnGround(u.x, u.y), `moved ${u.id}`).toBe(true);
    }
  });

  it("defender buildings preserve relative base-grid layout", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 5,
    });
    const enemy = Object.entries(state.territories).find(
      ([, t]) => t.owner !== "player" && t.buildings.length >= 2,
    )![0];
    const ts = state.territories[enemy]!;
    const battle = createBattle(state, enemy, "player", [
      { unitId: "trooper", count: 1 },
    ]);
    const a = ts.buildings[0]!;
    const b = ts.buildings[1]!;
    const da = battle.defenses.find((d) => d.instanceId === a.instanceId)!;
    const db = battle.defenses.find((d) => d.instanceId === b.instanceId)!;
    // Relative X order from base grid should match battle X order
    if (a.x !== b.x) {
      expect(Math.sign(db.x - da.x)).toBe(Math.sign(b.x - a.x));
    }
    if (a.y !== b.y) {
      expect(Math.sign(db.y - da.y)).toBe(Math.sign(b.y - a.y));
    }
  });

  it("START_INVASION through reducer enters battle phase", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 11,
    });
    const from = Object.entries(state.territories).find(
      ([, t]) => t.owner === "player",
    )![0];
    state = {
      ...state,
      players: {
        ...state.players,
        player: {
          ...state.players.player!,
          resources: { ...state.players.player!.resources, supply: 50 },
        },
      },
      territories: {
        ...state.territories,
        [from]: {
          ...state.territories[from]!,
          garrison: { trooper: 6 },
        },
      },
    };
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
    expect(
      state.battle?.units.filter((u) => u.side === "attacker").length,
    ).toBe(4);
  });
});
