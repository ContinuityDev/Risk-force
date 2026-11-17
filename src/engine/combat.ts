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
import {
  averageFrontageEfficiency,
  defenderIncomingMult,
  forceHeadcount,
  terrainDamageDealtMult,
} from "./combatMods";
import { stackCommanderMult } from "./commanders";
import { doctrineCombatMult } from "./doctrine";
import { cullCommandersAfterWipe } from "./commanders";
import {
  damageScaleFromHp,
  ensureTerritoryHp,
  forceFromBattleUnits,
  mergeIntoGarrison,
  normalizeForce,
  syncHpArray,
} from "./garrisonHp";
import {
  aiCaptureDisposition,
  resolveCaptureDisposition,
} from "./occupation";
import { scrubOrdersForTerritory } from "./orderCleanup";
import { checkEliminationsAndVictory } from "./victory";
import { territoryDisplayName } from "../ui/displayNames";

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

export function effectiveDamage(
  raw: number,
  damageType: DamageType,
  armorType: ArmorType,
  pierce?: Partial<Record<ArmorType, number>>,
  scale = 1,
): number {
  const matrix = damageMultiplier(damageType, armorType);
  const unitPierce = pierce?.[armorType] ?? 1;
  return Math.max(1, Math.round(raw * matrix * unitPierce * scale));
}

/** Spawn a battle from an invasion order. */
export function createBattle(
  state: GameState,
  territoryId: string,
  attacker: string,
  force: StrikeForceSlot[],
  fromId: string | null = null,
): BattleState {
  const ts = ensureTerritoryHp(state.territories[territoryId]!);
  const tdef = getTerritory(territoryId);
  const defenses: BattleDefense[] = [];
  let n = 0;
  const deploy = BATTLE_FIELD.attackerDeploy;
  const garrisonZ = BATTLE_FIELD.garrisonZone;
  const normalized = normalizeForce(force);

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
  const forceSlots: {
    unitId: string;
    udef: ReturnType<typeof getUnit>;
    hp: number;
  }[] = [];
  for (const slot of normalized) {
    const udef = getUnit(slot.unitId);
    const hps = slot.hps ?? syncHpArray(slot.unitId, slot.count);
    for (let i = 0; i < slot.count; i++) {
      forceSlots.push({ unitId: slot.unitId, udef, hp: hps[i]! });
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
  const atkPlayer = state.players[attacker];
  const defPlayer = state.players[ts.owner];
  forceSlots.forEach((slot, i) => {
    const { unitId, udef, hp } = slot;
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
    const doc = doctrineCombatMult(atkPlayer, unitId);
    const cmd = stackCommanderMult(
      atkPlayer?.commanders,
      fromId,
      unitId,
    );
    const maxHp = Math.max(
      1,
      Math.round(udef.maxHp * doc.maxHp * cmd.maxHp),
    );
    const scaledHp = Math.min(maxHp, Math.round(hp * doc.maxHp * cmd.maxHp));
    units.push({
      id: uid("u", n++),
      unitId,
      side: "attacker",
      x: pos.x,
      y: pos.y,
      hp: scaledHp,
      maxHp,
      cooldown: 0.15 + (n % 7) * 0.1,
      anim: "move",
      animT: 0,
      alive: true,
      disabledT: 0,
      facing: 0,
      dmgMult: doc.damage * cmd.damage,
    });
  });

  // Defender garrison — spread across garrison strip in front of buildings.
  const garrisonSlots: { unitId: string; hp: number }[] = [];
  for (const [unitId, count] of Object.entries(ts.garrison ?? {})) {
    const hps = ts.garrisonHp?.[unitId] ?? syncHpArray(unitId, count);
    for (let i = 0; i < count; i++) {
      garrisonSlots.push({ unitId, hp: hps[i] ?? getUnit(unitId).maxHp });
    }
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
    const doc = doctrineCombatMult(defPlayer, slot.unitId);
    const cmd = stackCommanderMult(
      defPlayer?.commanders,
      territoryId,
      slot.unitId,
    );
    const maxHp = Math.max(
      1,
      Math.round(udef.maxHp * doc.maxHp * cmd.maxHp),
    );
    const scaledHp = Math.min(
      maxHp,
      Math.round(slot.hp * doc.maxHp * cmd.maxHp),
    );
    units.push({
      id: uid("u", n++),
      unitId: slot.unitId,
      side: "defender",
      x: pos.x,
      y: pos.y,
      hp: scaledHp,
      maxHp,
      cooldown: 0.2 + (n % 5) * 0.08,
      anim: "idle",
      animT: 0,
      alive: true,
      disabledT: 0,
      facing: Math.PI,
      dmgMult: doc.damage * cmd.damage,
    });
  });

  const atkCount = units.filter((u) => u.side === "attacker").length;
  const defUnitCount = units.filter((u) => u.side === "defender").length;
  const defCount = defenses.filter((d) => getBuilding(d.buildingId).damage)
    .length;
  const mods = {
    terrainDealt: terrainDamageDealtMult(territoryId),
    defenderIncoming: defenderIncomingMult(
      { ...state, territories: { ...state.territories, [territoryId]: ts } },
      territoryId,
    ),
    attackerFrontage: averageFrontageEfficiency(forceHeadcount(normalized)),
    defenderFrontage: averageFrontageEfficiency(defUnitCount),
  };

  return {
    territoryId,
    attacker: attacker as BattleState["attacker"],
    defender: ts.owner,
    fromId,
    units,
    defenses,
    projectiles: [],
    explosions: [],
    scorches: [],
    time: 0,
    elapsed: 0,
    status: "running",
    mods,
    log: [
      `Assault on ${territoryDisplayName(territoryId)} initiated.`,
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
      const hpScale = damageScaleFromHp(next.hp, next.maxHp);
      const mods = battle.mods ?? {
        terrainDealt: 1,
        defenderIncoming: 1,
        attackerFrontage: 1,
        defenderFrontage: 1,
      };
      const sideFrontage =
        u.side === "attacker" ? mods.attackerFrontage : mods.defenderFrontage;
      let scale =
        hpScale * mods.terrainDealt * sideFrontage * (u.dmgMult ?? 1);
      if (target.kind === "defense" || target.kind === "unit") {
        if (u.side === "attacker") scale *= mods.defenderIncoming;
      }
      if (target.kind === "defense") {
        const bdef = getBuilding(target.ref.buildingId);
        const dmg = effectiveDamage(
          udef.damage,
          udef.damageType,
          bdef.armorType,
          udef.armorPierce,
          scale,
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
          scale,
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
  return forceFromBattleUnits(battle.units, side);
}

/**
 * Attacker retreats mid-battle: survivors march back toward origin;
 * defender keeps the plot with surviving garrison HP + buildings.
 */
export function retreatBattle(state: GameState): GameState {
  const battle = state.battle;
  if (!battle || battle.status !== "running") return state;
  const survivors = tallySurvivors(battle, "attacker");
  const defForce = tallySurvivors(battle, "defender");
  const tid = battle.territoryId;
  const ts = state.territories[tid]!;
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

  let territories = {
    ...state.territories,
    [tid]: mergeIntoGarrison(
      {
        ...ts,
        buildings,
        garrison: {},
        garrisonHp: {},
      },
      defForce,
    ),
  };

  const fromId =
    battle.fromId && territories[battle.fromId]?.owner === battle.attacker
      ? battle.fromId
      : Object.entries(territories).find(
          ([id, t]) => t.owner === battle.attacker && id !== tid,
        )?.[0] ?? null;

  if (survivors.length && fromId) {
    const turns = 1;
    const army = {
      id: `army_${state.nextInstanceId}`,
      owner: battle.attacker,
      fromId: tid,
      toId: fromId,
      force: survivors,
      turnsRemaining: turns,
      totalTurns: turns,
    };
    return {
      ...state,
      nextInstanceId: state.nextInstanceId + 1,
      territories,
      armiesInTransit: [...(state.armiesInTransit ?? []), army],
      battle: null,
      phase: "play",
      screen: "map",
      pendingCapture: null,
      message: `Assault aborted — survivors falling back to ${territoryDisplayName(fromId)}.`,
    };
  }

  // No home: dump into reserves
  const players = { ...state.players };
  if (survivors.length) {
    const attacker = players[battle.attacker]!;
    const reserves = { ...attacker.reserves };
    for (const slot of survivors) {
      reserves[slot.unitId] = (reserves[slot.unitId] ?? 0) + slot.count;
    }
    players[battle.attacker] = { ...attacker, reserves };
  }

  return {
    ...state,
    players,
    territories,
    battle: null,
    phase: "play",
    screen: "map",
    pendingCapture: null,
    message: "Assault aborted — survivors demobilized to reserves.",
  };
}

function clearEngagedSquads(state: GameState, owner: string): GameState {
  const squads = (state.squads ?? []).filter(
    (s) => !(s.owner === owner && s.status === "engaged"),
  );
  return {
    ...state,
    squads,
    selectedSquadId:
      state.selectedSquadId &&
      squads.some((s) => s.id === state.selectedSquadId)
        ? state.selectedSquadId
        : null,
  };
}

export function applyBattleResult(state: GameState): GameState {
  const battle = state.battle;
  if (!battle || battle.status === "running" || battle.status === "retreated") {
    return state;
  }
  // Engaged squads are consumed by the fight — survivors occupy via capture.
  state = clearEngagedSquads(state, battle.attacker);

  const tid = battle.territoryId;
  const ts = state.territories[tid]!;
  const defForce = tallySurvivors(battle, "defender");

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
  const originId = battle.fromId;

  if (battle.status === "attacker_win") {
    const pop = Math.max(
      1,
      Math.floor(ts.population * GAME_LOOP.population.captureRetain),
    );
    const workers = Math.floor(ts.workers * 0.35);
    const stock = Math.floor(ts.supplyStock * 0.2);
    // Hold ownership; disposition (raze/keep) decided on capture screen.
    territories = {
      ...territories,
      [tid]: {
        owner: battle.attacker,
        buildings,
        supplyStock: stock,
        population: pop,
        workers,
        garrison: {},
        garrisonHp: {},
        trainingQueue: [],
        control: "occupied",
        occupiedTurns: 0,
        movedThisTurn: false,
      },
    };
    const atkSurvivors = tallySurvivors(battle, "attacker");
    const total = atkSurvivors.reduce((s, x) => s + x.count, 0);
    const pending: PendingCapture = {
      territoryId: tid,
      attacker: battle.attacker,
      fromId: originId,
      survivors: atkSurvivors,
      population: pop,
      workers,
      buildings,
      supplyStock: stock,
    };
    // Defending stack wiped — lose attached officers.
    let players = state.players;
    const defP = players[previousOwner];
    if (defP) {
      players = {
        ...players,
        [previousOwner]: cullCommandersAfterWipe(defP, tid, []),
      };
    }
    const attacker = players[battle.attacker];
    // AI auto-occupies; humans get a capture screen
    if (attacker?.kind === "ai" || total === 0) {
      const disposition = aiCaptureDisposition(pending, buildings.length);
      const occupied = resolveCaptureDisposition(
        {
          ...state,
          players,
          territories,
          battle: null,
          pendingCapture: pending,
          plannedRoute: null,
        },
        disposition,
        total,
      );
      return checkEliminationsAndVictory(
        scrubOrdersForTerritory(occupied, tid, {
          notice: occupied.message,
        }),
        previousOwner,
      );
    }
    return scrubOrdersForTerritory(
      {
        ...state,
        players,
        territories,
        battle: null,
        pendingCapture: pending,
        plannedRoute: null,
        phase: "capture",
        screen: "capture",
        message: `${territoryDisplayName(tid)} captured — choose occupation strength.`,
      },
      tid,
    );
  }

  territories = {
    ...territories,
    [tid]: mergeIntoGarrison(
      {
        ...ts,
        buildings,
        garrison: {},
        garrisonHp: {},
      },
      defForce,
    ),
  };
  message = `Defense of ${tid} holds.`;

  let players = state.players;
  const atkSurvivors = tallySurvivors(battle, "attacker");
  if (originId && players[battle.attacker]) {
    players = {
      ...players,
      [battle.attacker]: cullCommandersAfterWipe(
        players[battle.attacker]!,
        originId,
        atkSurvivors,
      ),
    };
  }

  return checkEliminationsAndVictory(
    {
      ...state,
      players,
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
  const normalized = normalizeForce(pending.survivors);
  const total = normalized.reduce((s, x) => s + x.count, 0);
  const take = Math.max(0, Math.min(total, Math.floor(occupyCount)));

  const occupyForce: StrikeForceSlot[] = [];
  const returnForce: StrikeForceSlot[] = [];
  let left = take;
  for (const slot of normalized) {
    const occ = Math.min(slot.count, left);
    left -= occ;
    const hps = slot.hps ?? syncHpArray(slot.unitId, slot.count);
    if (occ > 0) {
      occupyForce.push({
        unitId: slot.unitId,
        count: occ,
        hps: hps.slice(0, occ),
      });
    }
    const ret = slot.count - occ;
    if (ret > 0) {
      returnForce.push({
        unitId: slot.unitId,
        count: ret,
        hps: hps.slice(occ),
      });
    }
  }

  const tid = pending.territoryId;
  const ts = state.territories[tid]!;
  let territories = {
    ...state.territories,
    [tid]: mergeIntoGarrison(
      { ...ts, garrison: {}, garrisonHp: {} },
      occupyForce,
    ),
  };

  // Return leftover to a friendly origin if possible, else reserves
  const players = { ...state.players };
  const attacker = players[pending.attacker]!;
  if (returnForce.length) {
    const homeId =
      pending.fromId &&
      territories[pending.fromId]?.owner === pending.attacker
        ? pending.fromId
        : Object.entries(territories).find(
            ([id, t]) => t.owner === pending.attacker && id !== tid,
          )?.[0];
    if (homeId) {
      territories = {
        ...territories,
        [homeId]: mergeIntoGarrison(territories[homeId]!, returnForce),
      };
    } else {
      const reserves = { ...attacker.reserves };
      for (const slot of returnForce) {
        reserves[slot.unitId] = (reserves[slot.unitId] ?? 0) + slot.count;
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
    message: `${territoryDisplayName(tid)} occupied with ${take} survivor${take === 1 ? "" : "s"}.`,
  };
}
