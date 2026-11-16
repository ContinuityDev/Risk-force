/**
 * Local supply stock / depot radius, attrition, and combat supply penalty.
 * Depot output goes to local stock only (not double-counted into global supply income).
 */

import { getBuilding } from "../data/buildings";
import { GAME_LOOP } from "../data/gameLoop";
import { getTerritory } from "../data/map/territories";
import { getUnit } from "../data/units";
import { territoryDisplayName } from "../ui/displayNames";
import type { GameState, TerritoryState } from "./state";
import { ensureTerritoryHp, syncHpArray } from "./garrisonHp";

/** BFS neighbor distance from any completed depot owned by player. */
export function supplyDistanceMap(
  state: GameState,
  playerId: string,
): Record<string, number> {
  const dist: Record<string, number> = {};
  const queue: string[] = [];
  for (const [tid, ts] of Object.entries(state.territories)) {
    if (ts.owner !== playerId) continue;
    const hasDepot = ts.buildings.some(
      (b) =>
        b.buildRemaining <= 0 &&
        b.hp > 0 &&
        (b.buildingId === "supply_depot" || b.buildingId === "logistics_hub"),
    );
    if (hasDepot) {
      dist[tid] = 0;
      queue.push(tid);
    }
  }
  let head = 0;
  const radius = GAME_LOOP.logistics.depotRadius;
  while (head < queue.length) {
    const cur = queue[head++]!;
    const d = dist[cur]!;
    if (d >= radius) continue;
    let neighbors: string[] = [];
    try {
      neighbors = getTerritory(cur).neighbors;
    } catch {
      continue;
    }
    for (const n of neighbors) {
      const ts = state.territories[n];
      if (!ts || ts.owner !== playerId) continue;
      if (dist[n] !== undefined && dist[n]! <= d + 1) continue;
      dist[n] = d + 1;
      queue.push(n);
    }
  }
  return dist;
}

export function isSupplied(
  state: GameState,
  territoryId: string,
  playerId: string,
  distMap?: Record<string, number>,
): boolean {
  const map = distMap ?? supplyDistanceMap(state, playerId);
  const d = map[territoryId];
  return d !== undefined && d <= GAME_LOOP.logistics.depotRadius;
}

/** Spend local supplyStock to support garrison; return leftover demand on global. */
export function consumeLocalSupply(
  ts: TerritoryState,
  demand: number,
): { territory: TerritoryState; unpaid: number } {
  const use = Math.min(ts.supplyStock, Math.max(0, demand));
  return {
    territory: { ...ts, supplyStock: ts.supplyStock - use },
    unpaid: Math.max(0, demand - use),
  };
}

/** Attrition for unsupplied garrisons; returns updated territories + log lines. */
export function applySupplyAttrition(
  state: GameState,
  playerId: string,
): { territories: Record<string, TerritoryState>; lines: string[] } {
  const dist = supplyDistanceMap(state, playerId);
  const territories = { ...state.territories };
  const lines: string[] = [];
  const frac = GAME_LOOP.logistics.attritionFraction;
  for (const [tid, ts] of Object.entries(state.territories)) {
    if (ts.owner !== playerId) continue;
    if (isSupplied(state, tid, playerId, dist)) continue;
    const ensured = ensureTerritoryHp(ts);
    const garrison = { ...ensured.garrison };
    const garrisonHp = { ...(ensured.garrisonHp ?? {}) };
    let lost = 0;
    for (const [unitId, count] of Object.entries(garrison)) {
      if (count <= 0) continue;
      const lose = Math.max(0, Math.floor(count * frac));
      if (lose <= 0) continue;
      lost += lose;
      const keep = count - lose;
      const hps = [
        ...(garrisonHp[unitId] ?? syncHpArray(unitId, count)),
      ].sort((a, b) => a - b);
      // Attrition kills most damaged first
      hps.splice(0, lose);
      if (keep <= 0) {
        delete garrison[unitId];
        delete garrisonHp[unitId];
      } else {
        garrison[unitId] = keep;
        garrisonHp[unitId] = hps;
      }
    }
    if (lost > 0) {
      territories[tid] = { ...ensured, garrison, garrisonHp };
      lines.push(
        `${territoryDisplayName(tid)}: ${lost} unsupplied unit${lost === 1 ? "" : "s"} lost to attrition.`,
      );
    }
  }
  return { territories, lines };
}

/** Invasion supply: prefer local stock at origin, then global pool. */
export function payInvasionSupply(
  state: GameState,
  playerId: string,
  fromId: string,
  need: number,
): GameState | null {
  const player = state.players[playerId];
  const from = state.territories[fromId];
  if (!player || !from) return null;
  const local = Math.min(from.supplyStock, need);
  const rest = need - local;
  if (player.resources.supply < rest) return null;
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        resources: {
          ...player.resources,
          supply: player.resources.supply - rest,
        },
      },
    },
    territories: {
      ...state.territories,
      [fromId]: { ...from, supplyStock: from.supplyStock - local },
    },
  };
}

/** Whether a unit/building id is a logistics depot. */
export function isDepotBuilding(buildingId: string): boolean {
  return buildingId === "supply_depot" || buildingId === "logistics_hub";
}

/** Combat damage mult when fighting from/in unsupplied territory. */
export function supplyCombatMult(
  state: GameState,
  territoryId: string,
  playerId: string,
): number {
  return isSupplied(state, territoryId, playerId)
    ? 1
    : GAME_LOOP.logistics.unsuppliedDamageMult;
}

/** Estimate local supply demand for a garrison. */
export function garrisonSupplyDemand(ts: TerritoryState): number {
  let d = 0;
  for (const [unitId, count] of Object.entries(ts.garrison)) {
    try {
      d += (getUnit(unitId).supplyCost ?? 1) * 0.15 * count;
    } catch {
      d += 0.15 * count;
    }
  }
  for (const b of ts.buildings) {
    if (b.buildRemaining > 0 || b.hp <= 0) continue;
    d += getBuilding(b.buildingId).supplyUpkeep ?? 0;
  }
  return Math.ceil(d);
}
