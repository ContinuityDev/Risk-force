/**
 * Per-turn energy upkeep for units + workers.
 * Rule (documented): after income, subtract upkeep from energy.
 * If energy goes negative, the faction is insolvent:
 *   - production stops (income zeroed next tick until energy >= 0)
 *   - a fraction of garrison units desert each insolvent turn
 *   - workers idle (no staffing / build-speed bonus) while insolvent
 */

import { GAME_LOOP } from "../data/gameLoop";
import type { UnitRole } from "../data/types";
import { getUnit } from "../data/units";
import type { GameState, PlayerState, TerritoryState } from "./state";

const ROLE_UPKEEP: Record<UnitRole, number> = {
  infantry: GAME_LOOP.upkeep.byRole.infantry,
  armor: GAME_LOOP.upkeep.byRole.armor,
  air: GAME_LOOP.upkeep.byRole.air,
  artillery: GAME_LOOP.upkeep.byRole.artillery,
  naval: GAME_LOOP.upkeep.byRole.naval,
  orbital: GAME_LOOP.upkeep.byRole.orbital,
  cyber: GAME_LOOP.upkeep.byRole.cyber,
};

export function unitUpkeepEnergy(unitId: string): number {
  try {
    const u = getUnit(unitId);
    return ROLE_UPKEEP[u.role] ?? GAME_LOOP.upkeep.byRole.infantry;
  } catch {
    return GAME_LOOP.upkeep.byRole.infantry;
  }
}

/** Total energy upkeep for a player's garrisons, reserves, workers, and transit. */
export function computeEnergyUpkeep(
  state: GameState,
  playerId: string,
): number {
  let energy = 0;
  for (const ts of Object.values(state.territories)) {
    if (ts.owner !== playerId) continue;
    energy += (ts.workers ?? 0) * GAME_LOOP.upkeep.perWorker;
    for (const [unitId, count] of Object.entries(ts.garrison ?? {})) {
      energy += unitUpkeepEnergy(unitId) * count;
    }
  }
  const player = state.players[playerId];
  if (player) {
    for (const [unitId, count] of Object.entries(player.reserves ?? {})) {
      energy += unitUpkeepEnergy(unitId) * count;
    }
  }
  for (const army of state.armiesInTransit ?? []) {
    if (army.owner !== playerId) continue;
    for (const slot of army.force) {
      energy += unitUpkeepEnergy(slot.unitId) * slot.count;
    }
  }
  return Math.floor(energy);
}

function desertGarrison(
  garrison: Record<string, number>,
  fraction: number,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [id, count] of Object.entries(garrison)) {
    const lose = Math.max(0, Math.floor(count * fraction));
    const keep = count - lose;
    if (keep > 0) next[id] = keep;
  }
  return next;
}

export interface UpkeepResult {
  player: PlayerState;
  territories: Record<string, TerritoryState>;
  insolvent: boolean;
  upkeep: number;
  deserted: number;
}

/** Apply energy upkeep + insolvency penalties. Call after income. */
export function applyEnergyUpkeep(
  state: GameState,
  playerId: string,
): UpkeepResult {
  const player = state.players[playerId]!;
  const upkeep = computeEnergyUpkeep(state, playerId);
  let energy = player.resources.energy - upkeep;
  const insolvent = energy < GAME_LOOP.upkeep.insolvencyThreshold;
  let deserted = 0;
  const territories = { ...state.territories };

  if (insolvent) {
    const frac = GAME_LOOP.upkeep.desertFraction;
    for (const [tid, ts] of Object.entries(territories)) {
      if (ts.owner !== playerId) continue;
      const before = Object.values(ts.garrison).reduce((a, b) => a + b, 0);
      const garrison = desertGarrison(ts.garrison, frac);
      const after = Object.values(garrison).reduce((a, b) => a + b, 0);
      deserted += before - after;
      territories[tid] = { ...ts, garrison };
    }
  }

  return {
    player: {
      ...player,
      resources: { ...player.resources, energy },
      insolvent,
    },
    territories,
    insolvent,
    upkeep,
    deserted,
  };
}
