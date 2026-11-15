/**
 * Lightweight battle forecast for invade preview (win odds + expected losses).
 */

import { getBuilding } from "../data/buildings";
import { damageMultiplier } from "../data/combatMatrix";
import { getUnit } from "../data/units";
import {
  averageFrontageEfficiency,
  defenderIncomingMult,
  forceHeadcount,
  terrainDamageDealtMult,
} from "./combatMods";
import type { GameState, StrikeForceSlot } from "./state";

export interface BattleForecast {
  winChance: number;
  expectedAttackerLosses: number;
  expectedDefenderLosses: number;
  attackerPower: number;
  defenderPower: number;
}

function forcePower(force: StrikeForceSlot[], efficiency: number): number {
  let power = 0;
  for (const slot of force) {
    try {
      const u = getUnit(slot.unitId);
      const avgHp =
        slot.hps && slot.hps.length
          ? slot.hps.reduce((a, b) => a + b, 0) / slot.hps.length
          : u.maxHp;
      const hpRatio = avgHp / u.maxHp;
      power +=
        slot.count *
        u.damage *
        u.fireRate *
        (0.55 + 0.45 * hpRatio) *
        efficiency;
    } catch {
      power += slot.count * 8 * efficiency;
    }
  }
  return power;
}

function garrisonAsForce(
  garrison: Record<string, number>,
  garrisonHp?: Record<string, number[]>,
): StrikeForceSlot[] {
  return Object.entries(garrison)
    .filter(([, c]) => c > 0)
    .map(([unitId, count]) => ({
      unitId,
      count,
      hps: garrisonHp?.[unitId],
    }));
}

function defensePower(ts: {
  buildings: { buildingId: string; hp: number; buildRemaining: number }[];
}): number {
  let p = 0;
  for (const b of ts.buildings) {
    if (b.buildRemaining > 0 || b.hp <= 0) continue;
    try {
      const def = getBuilding(b.buildingId);
      if (def.damage) {
        p += def.damage * (def.fireRate ?? 1) * 1.2;
      } else if (def.category === "command") {
        p += 12;
      }
    } catch {
      /* */
    }
  }
  return p;
}

export function forecastBattle(
  state: GameState,
  territoryId: string,
  force: StrikeForceSlot[],
): BattleForecast {
  const ts = state.territories[territoryId];
  if (!ts) {
    return {
      winChance: 0.5,
      expectedAttackerLosses: 0,
      expectedDefenderLosses: 0,
      attackerPower: 0,
      defenderPower: 0,
    };
  }
  const atkN = forceHeadcount(force);
  const defForce = garrisonAsForce(ts.garrison, ts.garrisonHp);
  const defN = forceHeadcount(defForce);
  const atkEff = averageFrontageEfficiency(atkN);
  const defEff = averageFrontageEfficiency(defN);
  const terrain = terrainDamageDealtMult(territoryId);
  const incoming = defenderIncomingMult(state, territoryId);

  let attackerPower = forcePower(force, atkEff) * terrain;
  let defenderPower =
    forcePower(defForce, defEff) * terrain + defensePower(ts);
  // Entrenchment makes defender harder — raise their effective power.
  defenderPower *= 1 / Math.max(0.55, incoming);

  // Soft counter bias: average matrix of attacker vs defender armor
  let counterBias = 1;
  if (atkN > 0 && defN > 0) {
    let sum = 0;
    let n = 0;
    for (const a of force) {
      const ua = getUnit(a.unitId);
      for (const d of defForce) {
        const ud = getUnit(d.unitId);
        sum += damageMultiplier(ua.damageType, ud.armorType) * a.count * d.count;
        n += a.count * d.count;
      }
    }
    if (n > 0) counterBias = sum / n;
  }
  attackerPower *= 0.85 + 0.15 * counterBias;

  const total = attackerPower + defenderPower;
  const winChance =
    total <= 0 ? 0.5 : Math.max(0.05, Math.min(0.95, attackerPower / total));

  const expectedAttackerLosses = Math.round(
    atkN * (1 - winChance) * (0.45 + 0.4 * (defenderPower / Math.max(1, total))),
  );
  const expectedDefenderLosses = Math.round(
    (defN + Math.min(6, ts.buildings.filter((b) => b.hp > 0).length)) *
      winChance *
      (0.5 + 0.35 * (attackerPower / Math.max(1, total))),
  );

  return {
    winChance,
    expectedAttackerLosses: Math.min(atkN, expectedAttackerLosses),
    expectedDefenderLosses,
    attackerPower,
    defenderPower,
  };
}
