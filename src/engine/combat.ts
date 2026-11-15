import {
  BATTLE_FIELD,
  clampToGround,
  clampToZone,
  mapBaseCellToBattle,
} from "../data/battleField";
import { getBuilding } from "../data/buildings";
import { damageMultiplier } from "../data/combatMatrix";
import { GAME_LOOP } from "../data/gameLoop";
import { getTerritory } from "../data/map/territories";
import type { ArmorType, DamageType, ProjectileStyle } from "../data/types";
import { getUnit } from "../data/units";
import { facingFromDelta, stepFacing } from "../sprites/facing";
import type {
  BattleDefense,
  BattleProjectile,
  BattleState,
  BattleUnit,
  GameState,
  PendingCapture,
  StrikeForceSlot,
} from "./state";
import { checkEliminationsAndVictory } from "./victory";

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function uid(prefix: string, n: number): string {
  return `${prefix}_${n}`;
}

/**
 * Scale catalog ranges onto the battle field so infantry and mechs can
 * fire across no-man's-land instead of walking into contact.
 */
export function battleEngageRange(catalogRange: number): number {
  return Math.min(10.5, Math.max(catalogRange * 3.4, 5.8));
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
  const tdef = getTerritory(territoryId);
  const defenses: BattleDefense[] = [];
  let n = 0;
  const deploy = BATTLE_FIELD.attackerDeploy;
  const garrisonZ = BATTLE_FIELD.garrisonZone;

  // Defender buildings — map the territory base grid onto the defender zone.
  for (const b of ts.buildings) {
    if (b.buildRemaining > 0 || b.hp <= 0) continue;
    const def = getBuilding(b.buildingId);
    const pos = mapBaseCellToBattle(
      b.x,
      b.y,
      def.size.w,
      def.size.h,
      tdef.grid.cols,
      tdef.grid.rows,
    );
    defenses.push({
      id: uid("d", n++),
      buildingId: b.buildingId,
      instanceId: b.instanceId,
      x: pos.x,
      y: pos.y,
      hp: b.hp,
      maxHp: def.maxHp,
      cooldown: 0.1 * (n % 4),
      anim: "idle",
      animT: 0,
      alive: true,
      disabledT: 0,
      facing: Math.PI,
    });
  }

  // Attackers — flanking echelons inside the deployment zone (ground only).
  const units: BattleUnit[] = [];
  const forceSlots: { unitId: string; udef: ReturnType<typeof getUnit> }[] = [];
  for (const slot of force) {
    const udef = getUnit(slot.unitId);
    for (let i = 0; i < slot.count; i++) {
      forceSlots.push({ unitId: slot.unitId, udef });
    }
  }
  forceSlots.sort((a, b) => {
    const rank = (u: (typeof forceSlots)[0]) => {
      if (u.udef.role === "infantry") return 0;
      if (u.udef.role === "armor" || /hover|tank|rail/i.test(u.unitId)) return 1;
      if (/mech|walker|spider/i.test(u.unitId)) return 2;
      if (u.udef.role === "artillery") return 4;
      if (u.udef.role === "air" || u.udef.role === "orbital") return 3;
      return 2;
    };
    return rank(a) - rank(b);
  });
  const total = Math.max(1, forceSlots.length);
  const lanes = Math.min(5, Math.max(3, Math.ceil(Math.sqrt(total))));
  const deployH = deploy.y1 - deploy.y0;
  const deployW = deploy.x1 - deploy.x0;
  const maxDepth = Math.max(1, Math.ceil(total / lanes) - 1);
  const depthStep = Math.min(0.55, (deployW - 0.7) / Math.max(1, maxDepth));
  forceSlots.forEach((slot, i) => {
    const { unitId, udef } = slot;
    const lane = i % lanes;
    const depth = Math.floor(i / lanes);
    const y =
      deploy.y0 +
      0.25 +
      (lane / Math.max(1, lanes - 1)) * (deployH - 0.5);
    let x = deploy.x0 + 0.25 + depth * depthStep;
    if (udef.role === "artillery") x = deploy.x0 + 0.2 + depth * Math.min(0.4, depthStep);
    else if (udef.role === "air" || udef.role === "orbital")
      x = deploy.x0 + Math.min(deployW * 0.4, 0.9) + (lane % 2) * 0.25;
    else if (udef.role === "armor" || /hover|tank|rail/i.test(unitId))
      x = Math.min(x + 0.15, deploy.x1 - 0.35);
    // Keep every attacker strictly inside the deploy strip (never spill into NML/base).
    x = Math.min(x, deploy.x1 - 0.3);
    const pos = clampToZone(x, y, deploy);
    units.push({
      id: uid("u", n++),
      unitId,
      side: "attacker",
      x: pos.x,
      y: pos.y,
      hp: udef.maxHp,
      maxHp: udef.maxHp,
      cooldown: 0.15 + (n % 7) * 0.1,
      anim: "move",
      animT: 0,
      alive: true,
      disabledT: 0,
      facing: 0,
    });
  });

  // Defender garrison — spread across garrison strip in front of buildings.
  const garrisonSlots: { unitId: string }[] = [];
  for (const [unitId, count] of Object.entries(ts.garrison ?? {})) {
    for (let i = 0; i < count; i++) garrisonSlots.push({ unitId });
  }
  const gTotal = Math.max(1, garrisonSlots.length);
  const gLanes = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(gTotal))));
  const gH = garrisonZ.y1 - garrisonZ.y0;
  const gW = garrisonZ.x1 - garrisonZ.x0;
  garrisonSlots.forEach((slot, i) => {
    let udef;
    try {
      udef = getUnit(slot.unitId);
    } catch {
      return;
    }
    const lane = i % gLanes;
    const depth = Math.floor(i / gLanes);
    const y =
      garrisonZ.y0 +
      0.2 +
      (lane / Math.max(1, gLanes - 1)) * (gH - 0.4);
    const x =
      garrisonZ.x0 +
      depth * (gW * 0.35) +
      (lane === 0 || lane === gLanes - 1 ? 0.2 : 0);
    const pos = clampToZone(x, y, garrisonZ);
    units.push({
      id: uid("u", n++),
      unitId: slot.unitId,
      side: "defender",
      x: pos.x,
      y: pos.y,
      hp: udef.maxHp,
      maxHp: udef.maxHp,
      cooldown: 0.2 + (n % 5) * 0.08,
      anim: "idle",
      animT: 0,
      alive: true,
      disabledT: 0,
      facing: Math.PI,
    });
  });

  const atkCount = units.filter((u) => u.side === "attacker").length;
  const defUnitCount = units.filter((u) => u.side === "defender").length;
  const defCount = defenses.filter((d) => getBuilding(d.buildingId).damage)
    .length;

  return {
    territoryId,
    attacker: attacker as BattleState["attacker"],
    defender: ts.owner,
    units,
    defenses,
    projectiles: [],
    explosions: [],
    scorches: [],
    time: 0,
    elapsed: 0,
    status: "running",
    log: [
      `Assault on ${territoryId} initiated.`,
      `Strike force: ${atkCount} · Garrison: ${defUnitCount} · Turrets: ${defCount}.`,
    ],
  };
}

type FightTarget =
  | { kind: "defense"; ref: BattleDefense }
  | { kind: "unit"; ref: BattleUnit };

function pickTargetForUnit(
  u: BattleUnit,
  battle: BattleState,
): FightTarget | null {
  const udef = getUnit(u.unitId);
  const scored: { t: FightTarget; score: number }[] = [];

  if (u.side === "attacker") {
    for (const d of battle.defenses) {
      if (!d.alive) continue;
      const bdef = getBuilding(d.buildingId);
      let score = dist(u.x, u.y, d.x, d.y);
      if (bdef.damage) score -= 2.2;
      if (bdef.category === "command") score -= 1.2;
      if (udef.role === "artillery" && bdef.category === "defense") score -= 1.8;
      if (udef.role === "cyber" && bdef.armorType === "shielded") score -= 2.5;
      if (udef.damageType === "emp" && bdef.armorType === "shielded") score -= 2;
      if (udef.damageType === "explosive" && bdef.armorType === "fortified")
        score -= 1.5;
      if (
        (udef.role === "air" || udef.role === "orbital") &&
        bdef.targetPreference === "air"
      ) {
        score -= 3;
      }
      scored.push({ t: { kind: "defense", ref: d }, score });
    }
    for (const foe of battle.units) {
      if (!foe.alive || foe.side !== "defender" || foe.disabledT > 0) continue;
      let score = dist(u.x, u.y, foe.x, foe.y) - 1.4;
      scored.push({ t: { kind: "unit", ref: foe }, score });
    }
  } else {
    for (const foe of battle.units) {
      if (!foe.alive || foe.side !== "attacker" || foe.disabledT > 0) continue;
      let score = dist(u.x, u.y, foe.x, foe.y);
      scored.push({ t: { kind: "unit", ref: foe }, score });
    }
  }

  if (!scored.length) return null;
  scored.sort((a, b) => a.score - b.score);
  return scored[0]!.t;
}

function pickTargetForDefense(
  d: BattleDefense,
  battle: BattleState,
): BattleUnit | null {
  const bdef = getBuilding(d.buildingId);
  if (!bdef.damage || d.disabledT > 0) return null;
  const pref = bdef.targetPreference ?? "any";
  const range = battleEngageRange(bdef.range ?? 3);
  const candidates = battle.units.filter((u) => {
    if (!u.alive || u.disabledT > 0 || u.side !== "attacker") return false;
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
      ? 6.4
      : style === "orbital"
        ? 4.0
        : style === "emp"
          ? 3.2
          : 4.2;
  return {
    id: uid("p", idCounter.n++),
    style,
    x,
    y,
    sx: x,
    sy: y,
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
    .filter((e) => e.t < 0.55);
  let scorches = battle.scorches
    .map((s) => ({ ...s, t: s.t + dt }))
    .filter((s) => s.t < 14);
  const log = [...battle.log];

  const spawnBlast = (
    x: number,
    y: number,
    style: string,
    withScorch: boolean,
  ) => {
    explosions.push({
      id: uid("e", idCounter.n++),
      x,
      y,
      t: 0,
      style,
    });
    if (withScorch) {
      scorches.push({
        id: uid("sc", idCounter.n++),
        x,
        y,
        t: 0,
        scale: 0.85 + Math.random() * 0.45,
      });
    }
  };

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
    const tx = target.ref.x;
    const ty = target.ref.y;

    const aim = facingFromDelta(tx - next.x, ty - next.y);
    const d = dist(next.x, next.y, tx, ty);
    // Battle-scaled range so infantry/mechs fire across the gap instead of melee-clumping.
    const weaponRange = battleEngageRange(udef.range);
    const ideal = Math.min(weaponRange * 0.88, weaponRange - 0.35);
    // Hold the near side of no-man's-land — never pile into the defender pad.
    const holdX = BATTLE_FIELD.noMansLand.x1 - 0.55;
    // Defenders hold position; attackers close only until weapon range / hold line
    if (u.side === "attacker" && d > ideal && next.x < holdX) {
      const step = udef.speed * dt * 0.75;
      const dx = ((tx - next.x) / d) * step;
      const dy = ((ty - next.y) / d) * step * 0.35;
      const moveFacing = facingFromDelta(dx, dy);
      const pos = clampToGround(
        Math.min(holdX, next.x + dx),
        next.y + dy,
      );
      return {
        ...next,
        x: pos.x,
        y: pos.y,
        facing: stepFacing(next.facing, moveFacing, dt),
        anim: "move",
      };
    }
    next = { ...next, facing: stepFacing(next.facing, aim, dt) };
    if (next.cooldown <= 0 && d <= weaponRange * 1.02) {
      if (target.kind === "defense") {
        const bdef = getBuilding(target.ref.buildingId);
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
            tx,
            ty,
            dmg,
            udef.damageType,
            "defense",
            target.ref.id,
            idCounter,
          ),
        );
      } else {
        const foeDef = getUnit(target.ref.unitId);
        const dmg = effectiveDamage(
          udef.damage,
          udef.damageType,
          foeDef.armorType,
          udef.armorPierce,
        );
        projectiles.push(
          spawnProjectile(
            udef.projectile ?? "bolt",
            next.x,
            next.y,
            tx,
            ty,
            dmg,
            udef.damageType,
            "unit",
            target.ref.id,
            idCounter,
          ),
        );
      }
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
    const aim = facingFromDelta(target.x - next.x, target.y - next.y);
    next = { ...next, facing: stepFacing(next.facing, aim, dt, 6.5) };
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
            spawnBlast(d.x, d.y, isEmp ? "emp" : "structure", !isEmp);
            log.push(`${getBuilding(d.buildingId).name} destroyed.`);
            return { ...d, hp: 0, alive: false, anim: "destroyed", animT: 0, disabledT: 0 };
          }
          if (isEmp) {
            spawnBlast(d.x, d.y, "emp", false);
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
            spawnBlast(u.x, u.y, isEmp ? "emp" : "unit", !isEmp);
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
        x: p.sx + (p.tx - p.sx) * prog,
        y: p.sy + (p.ty - p.sy) * prog,
      });
    }
  }

  const attackersAlive = units.some((u) => u.alive && u.side === "attacker");
  const defendersAlive = units.some((u) => u.alive && u.side === "defender");
  // Attacker wins only when defending units AND armed/command structures are gone.
  // Bare civilian buildings alone do not force a fight, but garrison troopers do.
  const criticalLeft = defenses.some((d) => {
    if (!d.alive) return false;
    const b = getBuilding(d.buildingId);
    return b.category === "command" || !!b.damage;
  });

  let status: BattleState["status"] = "running";
  if (!attackersAlive) {
    status = "defender_win";
    log.push("Assault collapsed.");
  } else if (!criticalLeft && !defendersAlive) {
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
    scorches,
    time: battle.time + 1,
    elapsed,
    status,
    log: log.slice(-14),
  };
}

function tallySurvivors(
  battle: BattleState,
  side: "attacker" | "defender",
): StrikeForceSlot[] {
  const map: Record<string, number> = {};
  for (const u of battle.units) {
    if (!u.alive || u.side !== side) continue;
    map[u.unitId] = (map[u.unitId] ?? 0) + 1;
  }
  return Object.entries(map).map(([unitId, count]) => ({ unitId, count }));
}

export function applyBattleResult(state: GameState): GameState {
  const battle = state.battle;
  if (!battle || battle.status === "running") return state;

  const tid = battle.territoryId;
  const ts = state.territories[tid]!;
  const defSurvivors: Record<string, number> = {};
  for (const slot of tallySurvivors(battle, "defender")) {
    defSurvivors[slot.unitId] = slot.count;
  }

  const hpByInstance = new Map(
    battle.defenses.map((d) => [d.instanceId, d] as const),
  );
  const buildings = ts.buildings
    .map((b) => {
      const match = hpByInstance.get(b.instanceId);
      if (!match) return b;
      return { ...b, hp: Math.max(0, Math.round(match.hp)) };
    })
    .filter((b) => b.hp > 0);

  let territories = { ...state.territories };
  let message = battle.log[battle.log.length - 1] ?? null;
  const previousOwner = ts.owner;

  if (battle.status === "attacker_win") {
    const pop = Math.max(
      1,
      Math.floor(ts.population * GAME_LOOP.population.captureRetain),
    );
    const workers = Math.floor(ts.workers * 0.35);
    territories = {
      ...territories,
      [tid]: {
        owner: battle.attacker,
        buildings: [],
        supplyStock: Math.floor(ts.supplyStock * 0.2),
        population: pop,
        workers,
        garrison: {},
        trainingQueue: [],
      },
    };
    const atkSurvivors = tallySurvivors(battle, "attacker");
    const total = atkSurvivors.reduce((s, x) => s + x.count, 0);
    const pending: PendingCapture = {
      territoryId: tid,
      attacker: battle.attacker,
      fromId: null,
      survivors: atkSurvivors,
      population: pop,
      workers,
    };
    const attacker = state.players[battle.attacker];
    // AI auto-occupies; humans get a capture screen
    if (attacker?.kind === "ai" || total === 0) {
      const occupied = confirmCaptureOccupation(
        {
          ...state,
          territories,
          battle: null,
          pendingCapture: pending,
        },
        total,
      );
      return checkEliminationsAndVictory(occupied, previousOwner);
    }
    return {
      ...state,
      territories,
      battle: null,
      pendingCapture: pending,
      phase: "capture",
      screen: "capture",
      message: `${tid} captured — choose occupation strength.`,
    };
  }

  territories = {
    ...territories,
    [tid]: {
      ...ts,
      buildings,
      garrison: defSurvivors,
    },
  };
  message = `Defense of ${tid} holds.`;

  return checkEliminationsAndVictory(
    {
      ...state,
      territories,
      battle: null,
      phase: "play",
      screen: "map",
      message,
      pendingCapture: null,
    },
    previousOwner,
  );
}

/** Place `occupyCount` survivors into the captured territory; rest return/home. */
export function confirmCaptureOccupation(
  state: GameState,
  occupyCount: number,
): GameState {
  const pending = state.pendingCapture;
  if (!pending) return state;
  const total = pending.survivors.reduce((s, x) => s + x.count, 0);
  const take = Math.max(0, Math.min(total, Math.floor(occupyCount)));
  const garrison: Record<string, number> = {};
  const returning: Record<string, number> = {};
  let left = take;
  for (const slot of pending.survivors) {
    const occ = Math.min(slot.count, left);
    left -= occ;
    if (occ > 0) garrison[slot.unitId] = (garrison[slot.unitId] ?? 0) + occ;
    const ret = slot.count - occ;
    if (ret > 0) returning[slot.unitId] = (returning[slot.unitId] ?? 0) + ret;
  }

  const tid = pending.territoryId;
  const ts = state.territories[tid]!;
  let territories = {
    ...state.territories,
    [tid]: { ...ts, garrison },
  };

  // Return leftover to a friendly origin if possible, else reserves
  const players = { ...state.players };
  const attacker = players[pending.attacker]!;
  if (Object.keys(returning).length) {
    const homeId =
      pending.fromId &&
      territories[pending.fromId]?.owner === pending.attacker
        ? pending.fromId
        : Object.entries(territories).find(
            ([id, t]) => t.owner === pending.attacker && id !== tid,
          )?.[0];
    if (homeId) {
      const home = territories[homeId]!;
      const g = { ...home.garrison };
      for (const [id, n] of Object.entries(returning)) {
        g[id] = (g[id] ?? 0) + n;
      }
      territories = { ...territories, [homeId]: { ...home, garrison: g } };
    } else {
      const reserves = { ...attacker.reserves };
      for (const [id, n] of Object.entries(returning)) {
        reserves[id] = (reserves[id] ?? 0) + n;
      }
      players[pending.attacker] = { ...attacker, reserves };
    }
  }

  return {
    ...state,
    players,
    territories,
    pendingCapture: null,
    battle: null,
    phase: "play",
    screen: "map",
    message: `${tid} occupied with ${take} survivors.`,
  };
}
