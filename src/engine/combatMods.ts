/**
 * Terrain, entrenchment, and frontage (stacking) modifiers for battles / travel.
 */

import { BIOME_MODS, getBiome } from "../data/biomes";
import { getCombatMatrix } from "../data/combatMatrix";
import { GAME_LOOP } from "../data/gameLoop";
import type { ArmorType } from "../data/types";
import { getUnit } from "../data/units";
import type { GameState, StrikeForceSlot, TerritoryState } from "./state";
import { staffedDefenseBonus } from "./workerEffects";

export function frontageEfficiency(unitIndex: number): number {
  const cap = GAME_LOOP.combat.frontageCap;
  if (unitIndex < cap) return 1;
  const over = unitIndex - cap;
  return Math.max(
    0.25,
    GAME_LOOP.combat.frontageOverstackEfficiency ** (1 + over * 0.15),
  );
}

/** Average frontage efficiency for a force of N units. */
export function averageFrontageEfficiency(count: number): number {
  if (count <= 0) return 1;
  let sum = 0;
  for (let i = 0; i < count; i++) sum += frontageEfficiency(i);
  return sum / count;
}

export function forceHeadcount(force: StrikeForceSlot[]): number {
  return force.reduce((s, f) => s + f.count, 0);
}

export function fortificationBonus(ts: TerritoryState): number {
  let bonus = 0;
  if (!ts.movedThisTurn) bonus += GAME_LOOP.combat.fortifiedBonus;
  for (const b of ts.buildings) {
    if (b.buildRemaining > 0 || b.hp <= 0) continue;
    if (b.buildingId === "shield_wall" || b.buildingId === "plasma_bunker") {
      bonus += GAME_LOOP.combat.fortificationBuildingBonus;
    }
  }
  // Staffed defenses add a visible, scaling bonus.
  bonus += staffedDefenseBonus(ts.buildings);
  return bonus;
}

export function defenderIncomingMult(
  state: GameState,
  territoryId: string,
): number {
  const biome = getBiome(territoryId);
  const biomeIncoming = BIOME_MODS[biome].defenderIncoming;
  const ts = state.territories[territoryId];
  if (!ts) return biomeIncoming;
  const fort = fortificationBonus(ts);
  return biomeIncoming * Math.max(0.55, 1 - fort);
}

export function terrainDamageDealtMult(territoryId: string): number {
  return BIOME_MODS[getBiome(territoryId)].damageDealt;
}

export function travelBiomeMult(toId: string): number {
  return BIOME_MODS[getBiome(toId)].travelMult;
}

export interface StackingPreview {
  count: number;
  cap: number;
  efficiency: number;
  overstack: number;
}

export function stackingPreview(force: StrikeForceSlot[]): StackingPreview {
  const count = forceHeadcount(force);
  const cap = GAME_LOOP.combat.frontageCap;
  return {
    count,
    cap,
    efficiency: averageFrontageEfficiency(count),
    overstack: Math.max(0, count - cap),
  };
}

/** Strong/weak armor labels for a unit's damage type (UI counters strip). */
export function counterStrip(unitId: string): {
  strong: string[];
  weak: string[];
} {
  try {
    const u = getUnit(unitId);
    const row = getCombatMatrix()[u.damageType];
    const strong: string[] = [];
    const weak: string[] = [];
    for (const [armor, mult] of Object.entries(row) as [ArmorType, number][]) {
      const pierce = u.armorPierce?.[armor] ?? 1;
      const effective = mult * pierce;
      if (effective >= 1.2) strong.push(armor);
      if (effective <= 0.75) weak.push(armor);
    }
    return { strong, weak };
  } catch {
    return { strong: [], weak: [] };
  }
}
