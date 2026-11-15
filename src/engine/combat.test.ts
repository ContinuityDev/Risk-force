import { describe, expect, it } from "vitest";
import { BATTLE_FIELD, isOnGround } from "../data/battleField";
import { getBuilding } from "../data/buildings";
import { damageMultiplier } from "../data/combatMatrix";
import { getTerritory } from "../data/map/territories";
import { createInitialState } from "./init";
import {
  applyBattleResult,
  createBattle,
  tickBattle,
} from "./combat";
import { tickArmiesForPlayer } from "./movement";
import { resolveCaptureDisposition } from "./occupation";
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
    const deploy = BATTLE_FIELD.attackerDeploy;
    const base = BATTLE_FIELD.defenderZone;
    for (const u of attackers) {
      expect(u.x).toBeGreaterThanOrEqual(deploy.x0);
      expect(u.x).toBeLessThanOrEqual(deploy.x1);
      expect(u.x).toBeLessThan(base.x0);
      expect(isOnGround(u.x, u.y)).toBe(true);
    }
    for (const u of battle.units.filter((x) => x.side === "defender")) {
      expect(u.x).toBeGreaterThanOrEqual(BATTLE_FIELD.garrisonZone.x0);
      expect(u.x).toBeLessThanOrEqual(BATTLE_FIELD.garrisonZone.x1);
      expect(u.x).toBeGreaterThanOrEqual(base.x0);
      expect(isOnGround(u.x, u.y)).toBe(true);
    }
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
    // Human attacker gets capture occupation screen (raze/keep)
    expect(state.phase).toBe("capture");
    expect(state.pendingCapture).toBeTruthy();
    const total =
      state.pendingCapture!.survivors.reduce((s, x) => s + x.count, 0) || 0;
    state = resolveCaptureDisposition(state, "raze", total);
    expect(state.phase).toBe("play");
    expect(state.pendingCapture).toBeNull();
    expect(state.territories[enemy]!.buildings.length).toBe(0);
    expect(state.territories[enemy]!.control).toBe("occupied");
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

  it("bare territory with 1 trooper must fight — no auto-win when only civilian buildings fall", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 21,
    });
    const enemy = Object.entries(state.territories).find(
      ([, t]) => t.owner !== "player",
    )![0];
    // Strip armed/command structures; leave a lone trooper + optional civilian husk.
    const ts = state.territories[enemy]!;
    const civilianOnly = ts.buildings.filter((b) => {
      try {
        const def = getBuilding(b.buildingId);
        return def.category !== "command" && !def.damage;
      } catch {
        return false;
      }
    });
    const bareState = {
      ...state,
      territories: {
        ...state.territories,
        [enemy]: {
          ...ts,
          buildings: civilianOnly.slice(0, 1),
          garrison: { trooper: 1 },
        },
      },
    };
    let battle = createBattle(bareState, enemy, "player", [
      { unitId: "trooper", count: 1 },
    ]);
    expect(battle.units.filter((u) => u.side === "defender" && u.alive).length).toBe(
      1,
    );
    // Instantly wipe all buildings — previously this auto-won despite the trooper.
    battle = {
      ...battle,
      defenses: battle.defenses.map((d) => ({
        ...d,
        hp: 0,
        alive: false,
      })),
    };
    battle = tickBattle(battle, 0.05);
    expect(battle.status).toBe("running");
    expect(
      battle.units.some((u) => u.alive && u.side === "defender"),
    ).toBe(true);
  });

  it("START_INVASION marches and battles on arrival", () => {
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
    expect(state.phase).toBe("play");
    expect(state.armiesInTransit?.length).toBeGreaterThan(0);
    const army = state.armiesInTransit!.find((a) => a.toId === to);
    expect(army?.force[0]?.count).toBe(4);
    const cur = tickArmiesForPlayer(
      {
        ...state,
        armiesInTransit: state.armiesInTransit!.map((a) => ({
          ...a,
          turnsRemaining: 1,
        })),
      },
      "player",
    );
    expect(cur.phase).toBe("battle");
    expect(
      cur.battle?.units.filter((u) => u.side === "attacker").length,
    ).toBe(4);
  });
});
