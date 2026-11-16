/**
 * War College officers — one per role, attach to a territory stack for buffs.
 * Lost when the attached stack is wiped in battle.
 */

import type { UnitRole } from "../data/types";
import { getUnit } from "../data/units";
import type { Commander, CommanderRole, PlayerState, StrikeForceSlot } from "./state";

export const COMMANDER_ROLES: CommanderRole[] = [
  "infantry",
  "armor",
  "air",
  "cyber",
];

export const COMMANDER_TRAIN_COST = {
  energy: 80,
  alloy: 25,
  research: 8,
} as const;

export const COMMANDER_NAMES: Record<CommanderRole, string[]> = {
  infantry: ["Col. Hale", "Maj. Rourke", "Capt. Voss"],
  armor: ["Col. Iron", "Maj. Drake", "Capt. Forge"],
  air: ["Col. Skye", "Maj. Wren", "Capt. Quill"],
  cyber: ["Col. Shade", "Maj. Null", "Capt. Echo"],
};

export function commanderBuff(
  role: CommanderRole,
): { damage: number; maxHp: number; speed: number } {
  switch (role) {
    case "infantry":
      return { damage: 1.12, maxHp: 1.08, speed: 1.05 };
    case "armor":
      return { damage: 1.1, maxHp: 1.15, speed: 0.98 };
    case "air":
      return { damage: 1.1, maxHp: 1.05, speed: 1.12 };
    case "cyber":
      return { damage: 1.18, maxHp: 1.0, speed: 1.04 };
  }
}

export function roleMatchesCommander(
  unitRole: UnitRole,
  cmd: CommanderRole,
): boolean {
  if (cmd === "infantry") return unitRole === "infantry" || unitRole === "artillery";
  if (cmd === "armor") return unitRole === "armor";
  if (cmd === "air") return unitRole === "air" || unitRole === "orbital";
  if (cmd === "cyber") return unitRole === "cyber";
  return false;
}

/** Aggregate combat mult for a unit in a stack with attached commanders. */
export function stackCommanderMult(
  commanders: Commander[] | undefined,
  territoryId: string | null,
  unitId: string,
): { damage: number; maxHp: number; speed: number } {
  const out = { damage: 1, maxHp: 1, speed: 1 };
  if (!commanders?.length || !territoryId) return out;
  let role: UnitRole = "infantry";
  try {
    role = getUnit(unitId).role;
  } catch {
    /* */
  }
  for (const c of commanders) {
    if (c.attachedTerritoryId !== territoryId) continue;
    if (!roleMatchesCommander(role, c.role)) continue;
    const b = commanderBuff(c.role);
    out.damage *= b.damage;
    out.maxHp *= b.maxHp;
    out.speed *= b.speed;
  }
  return out;
}

export function commandersOnTerritory(
  player: PlayerState,
  territoryId: string,
): Commander[] {
  return (player.commanders ?? []).filter(
    (c) => c.attachedTerritoryId === territoryId,
  );
}

export function hasCommanderRole(
  player: PlayerState,
  role: CommanderRole,
): boolean {
  return (player.commanders ?? []).some((c) => c.role === role);
}

export function pickCommanderName(
  role: CommanderRole,
  existing: Commander[],
): string {
  const used = new Set(existing.map((c) => c.name));
  for (const n of COMMANDER_NAMES[role]) {
    if (!used.has(n)) return n;
  }
  return `${COMMANDER_NAMES[role][0]} ${existing.length + 1}`;
}

/** Detach / destroy commanders whose stack was wiped. */
export function cullCommandersAfterWipe(
  player: PlayerState,
  territoryId: string,
  survivors: StrikeForceSlot[],
): PlayerState {
  const alive = survivors.reduce((s, x) => s + x.count, 0);
  if (alive > 0) return player;
  const commanders = (player.commanders ?? []).filter(
    (c) => c.attachedTerritoryId !== territoryId,
  );
  if (commanders.length === (player.commanders ?? []).length) return player;
  return { ...player, commanders };
}

export function detachCommander(
  player: PlayerState,
  commanderId: string,
): PlayerState {
  return {
    ...player,
    commanders: (player.commanders ?? []).map((c) =>
      c.id === commanderId ? { ...c, attachedTerritoryId: null } : c,
    ),
  };
}

export function attachCommander(
  player: PlayerState,
  commanderId: string,
  territoryId: string,
): PlayerState {
  return {
    ...player,
    commanders: (player.commanders ?? []).map((c) =>
      c.id === commanderId
        ? { ...c, attachedTerritoryId: territoryId }
        : // One officer per stack attachment is fine; roles stay unique globally.
          c,
    ),
  };
}
