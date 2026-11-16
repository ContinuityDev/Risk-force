import { getDoctrine, type DoctrineId } from "../data/doctrines";
import type { Cost, UnitRole } from "../data/types";
import { getUnit } from "../data/units";
import type { PlayerState } from "./state";

export function playerDoctrineId(player: PlayerState): DoctrineId {
  return player.doctrineId ?? "vanguard";
}

export function doctrineRoleMod(player: PlayerState, role: UnitRole) {
  return getDoctrine(playerDoctrineId(player)).roleMods[role] ?? {};
}

/** Apply doctrine cost multipliers to a unit train cost bundle. */
export function applyDoctrineUnitCost(
  player: PlayerState,
  unitId: string,
  base: {
    energy: number;
    alloy: number;
    supply: number;
    research: number;
  },
): {
  energy: number;
  alloy: number;
  supply: number;
  research: number;
} {
  let role: UnitRole = "infantry";
  try {
    role = getUnit(unitId).role;
  } catch {
    /* */
  }
  const m = doctrineRoleMod(player, role).cost ?? 1;
  return {
    energy: Math.max(1, Math.ceil(base.energy * m)),
    alloy: Math.max(0, Math.ceil(base.alloy * m)),
    supply: base.supply,
    research: base.research,
  };
}

export function applyDoctrineCost(
  player: PlayerState,
  unitId: string,
  cost: Cost,
): Cost {
  let role: UnitRole = "infantry";
  try {
    role = getUnit(unitId).role;
  } catch {
    /* */
  }
  const m = doctrineRoleMod(player, role).cost ?? 1;
  return {
    energy: Math.max(1, Math.ceil(cost.energy * m)),
    alloy:
      cost.alloy != null ? Math.max(0, Math.ceil(cost.alloy * m)) : undefined,
    research: cost.research,
    supply: cost.supply,
  };
}

/** Combat / preview stat multipliers from doctrine. */
export function doctrineCombatMult(
  player: PlayerState | undefined,
  unitId: string,
): { damage: number; maxHp: number; speed: number } {
  if (!player) return { damage: 1, maxHp: 1, speed: 1 };
  let role: UnitRole = "infantry";
  try {
    role = getUnit(unitId).role;
  } catch {
    /* */
  }
  const mod = doctrineRoleMod(player, role);
  return {
    damage: mod.damage ?? 1,
    maxHp: mod.maxHp ?? 1,
    speed: mod.speed ?? 1,
  };
}
