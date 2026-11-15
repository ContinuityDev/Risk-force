import { getBuilding } from "../data/buildings";
import { damageMultiplier } from "../data/combatMatrix";
import type { ArmorType, DamageType, ProjectileStyle } from "../data/types";
import { getUnit } from "../data/units";
import type {
  BattleDefense,
  BattleProjectile,
  BattleState,
  BattleUnit,
  GameState,
  StrikeForceSlot,
} from "./state";

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function uid(prefix: string, n: number): string {
  return `${prefix}_${n}`;
}

function effectiveDamage(
  raw: number,
  damageType: DamageType,
  armorType: ArmorType,
  pierce?: Partial<Record<ArmorType, number>>,
): number {
  const matrix = damageMultiplier(damageType, armorType);
  const unitPierce = pierce?.[armorType] ?? 1;
  return Math.max(1, Math.round(raw * matrix * unitPierce));
}

/** Spawn a battle from an invasion order. */
export function createBattle(
  state: GameState,
  territoryId: string,
  attacker: string,
  force: StrikeForceSlot[],
): BattleState {
  const ts = state.territories[territoryId]!;
  const defenses: BattleDefense[] = [];
  let n = 0;

  // Defender base on the RIGHT — structured lanes, not raw grid scatter.
  const armed: typeof ts.buildings = [];
  const walls: typeof ts.buildings = [];
  const econ: typeof ts.buildings = [];
  const command: typeof ts.buildings = [];
  for (const b of ts.buildings) {
    if (b.buildRemaining > 0 || b.hp <= 0) continue;
    const def = getBuilding(b.buildingId);
    if (def.category === "command") command.push(b);
    else if (def.damage) armed.push(b);
    else if (def.category === "defense") walls.push(b);
    else econ.push(b);
  }

  const placeDef = (
    b: (typeof ts.buildings)[number],
    x: number,
    y: number,
  ) => {
    const def = getBuilding(b.buildingId);
    defenses.push({
      id: uid("d", n++),
      buildingId: b.buildingId,
      instanceId: b.instanceId,
      x,
      y,
      hp: b.hp,
      maxHp: def.maxHp,
      cooldown: 0.1 * (n % 4),
      anim: "idle",
      animT: 0,
      alive: true,
      disabledT: 0,
    });
  };

  // Front line turrets — two columns, clear spacing
  armed.forEach((b, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    placeDef(b, 8.0 + col * 1.55, 1.35 + row * 1.45);
  });
  // Walls / pylons mid
  walls.forEach((b, i) => {
    placeDef(b, 10.0 + (i % 2) * 1.1, 1.7 + Math.floor(i / 2) * 1.5);
  });
  // Economy behind
  econ.forEach((b, i) => {
    placeDef(b, 11.5 + (i % 2) * 1.0, 1.5 + Math.floor(i / 2) * 1.4);
  });
  // HQ back-center
  command.forEach((b, i) => {
    placeDef(b, 12.6, 2.8 + i * 1.35);
  });

  // Attackers on the LEFT — spread formation by silhouette class.
  const units: BattleUnit[] = [];
  const lanes = {
    infantry: 0,
    mech: 0,
    armor: 0,
    air: 0,
    artillery: 0,
    other: 0,
  };
  for (const slot of force) {
    const udef = getUnit(slot.unitId);
    const isMech =
      /mech|walker|spider/i.test(slot.unitId) ||
      /mech|walker/i.test(udef.name);
    for (let i = 0; i < slot.count; i++) {
      let laneKey: keyof typeof lanes = "other";
      let baseY = 2.5;
      let baseX = 1.0;
      let colPitch = 1.35;
      let rowPitch = 1.2;
      if (udef.role === "air" || udef.role === "orbital") {
        laneKey = "air";
        baseY = 0.55;
        baseX = 1.6;
        colPitch = 1.5;
        rowPitch = 1.15;
      } else if (udef.role === "armor" || /hover|tank|rail/i.test(slot.unitId)) {
        laneKey = "armor";
        baseY = 3.5;
        baseX = 0.55;
        colPitch = 1.55;
        rowPitch = 1.25;
      } else if (isMech) {
        laneKey = "mech";
        baseY = 2.15;
        baseX = 0.85;
        colPitch = 1.5;
        rowPitch = 1.3;
      } else if (udef.role === "artillery") {
        laneKey = "artillery";
        baseY = 5.0;
        baseX = 0.4;
        colPitch = 1.4;
        rowPitch = 1.15;
      } else if (udef.role === "infantry") {
        laneKey = "infantry";
        baseY = 1.15;
        baseX = 1.35;
        colPitch = 1.2;
        rowPitch = 1.05;
      } else if (udef.role === "naval") {
        baseY = 5.7;
        baseX = 1.1;
      }
      const idx = lanes[laneKey]++;
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      units.push({
        id: uid("u", n++),
        unitId: slot.unitId,
        side: "attacker",
        x: baseX + col * colPitch,
        y: baseY + row * rowPitch,
        hp: udef.maxHp,
        maxHp: udef.maxHp,
        cooldown: 0.15 + (n % 7) * 0.1,
        anim: "move",
        animT: 0,
        alive: true,
        disabledT: 0,
      });
    }
  }

  const forceCount = units.length;
  const defCount = defenses.filter((d) => getBuilding(d.buildingId).damage).length;

  return {
    territoryId,
    attacker: attacker as BattleState["attacker"],
    defender: ts.owner,
    units,
    defenses,
    projectiles: [],
    explosions: [],
    time: 0,
    elapsed: 0,
    status: "running",
    log: [
      `Assault on ${territoryId} initiated.`,
      `Strike force: ${forceCount} units · Defenses online: ${defCount}.`,
    ],
  };
}

function pickTargetForUnit(
  u: BattleUnit,
  battle: BattleState,
): BattleDefense | null {
  const udef = getUnit(u.unitId);
  const alive = battle.defenses.filter((d) => d.alive);
  if (!alive.length) return null;

  const scored = alive.map((d) => {
    const bdef = getBuilding(d.buildingId);
    let score = dist(u.x, u.y, d.x, d.y);
    // Role-aware preferences.
    if (bdef.damage) score -= 2.2;
    if (bdef.category === "command") score -= 1.2;
    if (udef.role === "artillery" && bdef.category === "defense") score -= 1.8;
    if (udef.role === "cyber" && bdef.armorType === "shielded") score -= 2.5;
    if (udef.damageType === "emp" && bdef.armorType === "shielded") score -= 2;
    if (udef.damageType === "explosive" && bdef.armorType === "fortified")
      score -= 1.5;
    // Flak/AA are dangerous to air — prioritize if air.
    if (
      (udef.role === "air" || udef.role === "orbital") &&
      bdef.targetPreference === "air"
    ) {
      score -= 3;
    }
    return { d, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0]!.d;
}

function pickTargetForDefense(
  d: BattleDefense,
  battle: BattleState,
): BattleUnit | null {
  const bdef = getBuilding(d.buildingId);
  if (!bdef.damage || d.disabledT > 0) return null;
  const pref = bdef.targetPreference ?? "any";
  const range = bdef.range ?? 3;
  const candidates = battle.units.filter((u) => {
    if (!u.alive || u.disabledT > 0) return false;
    const role = getUnit(u.unitId).role;
    const isAir = role === "air" || role === "orbital";
    const isNaval = role === "naval";
    if (pref === "air" && !isAir) return false;
    if (pref === "ground" && (isAir || isNaval)) return false;
    if (pref === "naval" && !isNaval) return false;
    return dist(d.x, d.y, u.x, u.y) <= range;
  });
  if (!candidates.length) return null;
  // Prefer targets we counter hard.
  candidates.sort((a, b) => {
    const da = getUnit(a.unitId);
    const db = getUnit(b.unitId);
    const ma = damageMultiplier(
      bdef.damageType ?? "energy",
      da.armorType,
    );
    const mb = damageMultiplier(
      bdef.damageType ?? "energy",
      db.armorType,
    );
    const distBias =
      dist(d.x, d.y, a.x, a.y) - dist(d.x, d.y, b.x, b.y);
    return mb - ma + distBias * 0.15;
  });
  return candidates[0]!;
}

function spawnProjectile(
  style: ProjectileStyle,
  x: number,
  y: number,
  tx: number,
  ty: number,
  damage: number,
  damageType: DamageType,
  targetKind: "unit" | "defense",
  targetId: string,
  idCounter: { n: number },
): BattleProjectile {
  const speed =
    style === "laser" || style === "rail"
      ? 5.2
      : style === "orbital"
        ? 3.2
        : style === "emp"
          ? 2.4
          : 2.9;
  return {
    id: uid("p", idCounter.n++),
    style,
    x,
    y,
    tx,
    ty,
    progress: 0,
    speed,
    damage,
    damageType,
    targetKind,
    targetId,
  };
}

export function tickBattle(battle: BattleState, dt: number): BattleState {
  if (battle.status !== "running") return battle;

  const idCounter = { n: battle.time * 1000 + 1 };
  let units = battle.units.map((u) => ({
    ...u,
    disabledT: Math.max(0, u.disabledT - dt),
  }));
  let defenses = battle.defenses.map((d) => ({
    ...d,
    disabledT: Math.max(0, d.disabledT - dt),
  }));
  let projectiles = [...battle.projectiles];
  let explosions = battle.explosions
    .map((e) => ({ ...e, t: e.t + dt }))
    .filter((e) => e.t < 0.6);
  const log = [...battle.log];

  const snapshot = (): BattleState => ({
    ...battle,
    units,
    defenses,
  });

  units = units.map((u) => {
    if (!u.alive) return { ...u, anim: "destroyed" as const, animT: u.animT + dt };
    if (u.disabledT > 0) {
      return { ...u, anim: "hit" as const, animT: u.animT + dt, cooldown: Math.max(0, u.cooldown - dt) };
    }
    const udef = getUnit(u.unitId);
    let next = {
      ...u,
      cooldown: Math.max(0, u.cooldown - dt),
      animT: u.animT + dt,
    };
    const target = pickTargetForUnit(next, snapshot());
    if (!target) return { ...next, anim: "idle" };

    const d = dist(next.x, next.y, target.x, target.y);
    const ideal = Math.max(0.55, udef.range * 0.82);
    if (d > ideal) {
      const step = udef.speed * dt;
      return {
        ...next,
        x: next.x + ((target.x - next.x) / d) * step,
        y: next.y + ((target.y - next.y) / d) * step,
        anim: "move",
      };
    }
    if (next.cooldown <= 0) {
      const bdef = getBuilding(target.buildingId);
      const dmg = effectiveDamage(
        udef.damage,
        udef.damageType,
        bdef.armorType,
        udef.armorPierce,
      );
      projectiles.push(
        spawnProjectile(
          udef.projectile ?? "bolt",
          next.x,
          next.y,
          target.x,
          target.y,
          dmg,
          udef.damageType,
          "defense",
          target.id,
          idCounter,
        ),
      );
      return { ...next, cooldown: 1 / udef.fireRate, anim: "attack", animT: 0 };
    }
    return {
      ...next,
      anim: next.anim === "attack" && next.animT < 0.22 ? "attack" : "idle",
    };
  });

  defenses = defenses.map((d) => {
    if (!d.alive) return { ...d, anim: "destroyed" as const, animT: d.animT + dt };
    const bdef = getBuilding(d.buildingId);
    let next = {
      ...d,
      cooldown: Math.max(0, d.cooldown - dt),
      animT: d.animT + dt,
    };
    if (!bdef.damage || next.disabledT > 0) {
      return { ...next, anim: next.disabledT > 0 ? "idle" : "working" };
    }
    const target = pickTargetForDefense(next, snapshot());
    if (!target) return { ...next, anim: "idle" };
    if (next.cooldown <= 0) {
      const udef = getUnit(target.unitId);
      const dmg = effectiveDamage(
        bdef.damage,
        bdef.damageType ?? "energy",
        udef.armorType,
      );
      projectiles.push(
        spawnProjectile(
          bdef.projectile ?? "laser",
          next.x,
          next.y,
          target.x,
          target.y,
          dmg,
          bdef.damageType ?? "energy",
          "unit",
          target.id,
          idCounter,
        ),
      );
      return {
        ...next,
        cooldown: 1 / (bdef.fireRate ?? 1),
        anim: "firing",
        animT: 0,
      };
    }
    return {
      ...next,
      anim: next.anim === "firing" && next.animT < 0.18 ? "firing" : "idle",
    };
  });

  const nextProjectiles: BattleProjectile[] = [];
  for (const p of projectiles) {
    const prog = p.progress + p.speed * dt;
    if (prog >= 1) {
      const isEmp = p.damageType === "emp";
      if (p.targetKind === "defense") {
        defenses = defenses.map((d) => {
          if (d.id !== p.targetId || !d.alive) return d;
          const hp = d.hp - p.damage;
          const disabledT = isEmp ? Math.max(d.disabledT, 2.2) : d.disabledT;
          if (hp <= 0) {
            explosions.push({
              id: uid("e", idCounter.n++),
              x: d.x,
              y: d.y,
              t: 0,
              style: isEmp ? "emp" : "structure",
            });
            log.push(`${getBuilding(d.buildingId).name} destroyed.`);
            return { ...d, hp: 0, alive: false, anim: "destroyed", animT: 0, disabledT: 0 };
          }
          if (isEmp) {
            explosions.push({
              id: uid("e", idCounter.n++),
              x: d.x,
              y: d.y,
              t: 0,
              style: "emp",
            });
            log.push(`EMP disrupt → ${getBuilding(d.buildingId).name}.`);
          } else {
            log.push(
              `${p.style} hit ${getBuilding(d.buildingId).name} (−${p.damage}).`,
            );
          }
          return { ...d, hp, disabledT };
        });
      } else {
        units = units.map((u) => {
          if (u.id !== p.targetId || !u.alive) return u;
          const hp = u.hp - p.damage;
          const disabledT = isEmp ? Math.max(u.disabledT, 1.8) : u.disabledT;
          if (hp <= 0) {
            explosions.push({
              id: uid("e", idCounter.n++),
              x: u.x,
              y: u.y,
              t: 0,
              style: isEmp ? "emp" : "unit",
            });
            log.push(`${getUnit(u.unitId).name} destroyed.`);
            return { ...u, hp: 0, alive: false, anim: "destroyed", animT: 0, disabledT: 0 };
          }
          log.push(`${getUnit(u.unitId).name} takes ${p.damage} dmg.`);
          return { ...u, hp, anim: "hit", animT: 0, disabledT };
        });
      }
    } else {
      nextProjectiles.push({
        ...p,
        progress: prog,
        x: p.x + (p.tx - p.x) * prog,
        y: p.y + (p.ty - p.y) * prog,
      });
    }
  }

  const attackersAlive = units.some((u) => u.alive);
  const criticalLeft = defenses.some((d) => {
    if (!d.alive) return false;
    const b = getBuilding(d.buildingId);
    return b.category === "command" || !!b.damage;
  });
  const anyBuildingLeft = defenses.some((d) => d.alive);

  let status: BattleState["status"] = "running";
  if (!attackersAlive) {
    status = "defender_win";
    log.push("Assault collapsed.");
  } else if (!criticalLeft || !anyBuildingLeft) {
    status = "attacker_win";
    log.push("Territory secured.");
  }

  const elapsed = battle.elapsed + dt;
  if (status === "running" && elapsed > 50) {
    const atkHp = units.filter((u) => u.alive).reduce((s, u) => s + u.hp, 0);
    const defHp = defenses.filter((d) => d.alive).reduce((s, d) => s + d.hp, 0);
    status = atkHp >= defHp * 0.4 ? "attacker_win" : "defender_win";
    log.push(
      status === "attacker_win"
        ? "Attackers overrun the perimeter."
        : "Defenders stabilize the line.",
    );
  }

  return {
    ...battle,
    units,
    defenses,
    projectiles: nextProjectiles,
    explosions,
    time: battle.time + 1,
    elapsed,
    status,
    log: log.slice(-14),
  };
}

export function applyBattleResult(state: GameState): GameState {
  const battle = state.battle;
  if (!battle || battle.status === "running") return state;

  const tid = battle.territoryId;
  const ts = state.territories[tid]!;

  // Map defense HP back by instanceId.
  const hpByInstance = new Map(
    battle.defenses.map((d) => [d.instanceId, d] as const),
  );
  let buildings = ts.buildings
    .map((b) => {
      const match = hpByInstance.get(b.instanceId);
      if (!match) return b;
      return { ...b, hp: Math.max(0, Math.round(match.hp)) };
    })
    .filter((b) => b.hp > 0 || b.buildingId === "command_nexus");

  let territories = { ...state.territories };
  let message = battle.log[battle.log.length - 1] ?? null;
  const players = state.players;

  if (battle.status === "attacker_win") {
    buildings = buildings.map((b) =>
      b.buildingId === "command_nexus"
        ? { ...b, hp: getBuilding("command_nexus").maxHp, buildRemaining: 0 }
        : b,
    );
    const hasNexus = buildings.some((b) => b.buildingId === "command_nexus");
    if (!hasNexus) {
      buildings = [
        {
          instanceId: `b${state.nextInstanceId}`,
          buildingId: "command_nexus",
          x: 2,
          y: 2,
          hp: getBuilding("command_nexus").maxHp,
          buildRemaining: 0,
        },
        ...buildings,
      ];
    }
    territories = {
      ...territories,
      [tid]: {
        owner: battle.attacker,
        buildings,
        supplyStock: Math.floor(ts.supplyStock * 0.35),
      },
    };
    message = `${tid} captured by ${players[battle.attacker]?.displayName ?? battle.attacker}.`;
  } else {
    territories = {
      ...territories,
      [tid]: { ...ts, buildings },
    };
    message = `Defense of ${tid} holds.`;
  }

  const owners = new Set(Object.values(territories).map((t) => t.owner));
  let winner = state.winner;
  let phase: GameState["phase"] = "play";
  let screen: GameState["screen"] = "map";
  if (owners.size === 1) {
    winner = [...owners][0]!;
    phase = "ended";
    screen = "victory";
    message = `${players[winner]?.displayName ?? winner} controls the theater.`;
  }

  return {
    ...state,
    territories,
    battle: null,
    phase,
    winner,
    screen,
    message,
    nextInstanceId: state.nextInstanceId + (battle.status === "attacker_win" ? 1 : 0),
  };
}
