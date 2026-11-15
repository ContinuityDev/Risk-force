import { getBuilding } from "../data/buildings";
import type { ResourceId } from "../data/types";
import type { GameState, PlayerState } from "./state";
import { emptyResources } from "./state";

/** Sum economy output for one player's completed buildings. */
export function computeIncome(
  state: GameState,
  playerId: string,
): Record<ResourceId, number> {
  const income = emptyResources();
  for (const ts of Object.values(state.territories)) {
    if (ts.owner !== playerId) continue;
    for (const b of ts.buildings) {
      if (b.buildRemaining > 0 || b.hp <= 0) continue;
      const def = getBuilding(b.buildingId);
      if (!def.output) continue;
      for (const [k, v] of Object.entries(def.output) as [ResourceId, number][]) {
        income[k] += v;
      }
    }
  }
  return income;
}

export function computeSupplyUpkeep(state: GameState, playerId: string): number {
  let upkeep = 0;
  for (const ts of Object.values(state.territories)) {
    if (ts.owner !== playerId) continue;
    for (const b of ts.buildings) {
      if (b.buildRemaining > 0 || b.hp <= 0) continue;
      upkeep += getBuilding(b.buildingId).supplyUpkeep ?? 0;
    }
  }
  // Reserve units also draw supply.
  const player = state.players[playerId];
  if (player) {
    for (const count of Object.values(player.reserves)) {
      upkeep += Math.ceil(count * 0.25);
    }
  }
  return upkeep;
}

/** Apply income, upkeep, construction, and local supply stockpiles. */
export function applyEconomyTick(state: GameState, playerId: string): GameState {
  const player = state.players[playerId];
  if (!player) return state;

  const income = computeIncome(state, playerId);
  const upkeep = computeSupplyUpkeep(state, playerId);

  const resources: PlayerState["resources"] = {
    energy: player.resources.energy + income.energy,
    alloy: player.resources.alloy + income.alloy,
    research: player.resources.research + income.research,
    supply: Math.max(0, player.resources.supply + income.supply - upkeep),
  };

  // Low supply degrades readiness: soft cap message handled by UI; here we
  // still bank territorial supply stock from depots.
  const territories = { ...state.territories };
  for (const [tid, ts] of Object.entries(territories)) {
    if (ts.owner !== playerId) continue;
    let stockGain = 0;
    let changed = false;
    const buildings = ts.buildings.map((b) => {
      if (b.buildRemaining > 0) {
        changed = true;
        return { ...b, buildRemaining: b.buildRemaining - 1 };
      }
      const def = getBuilding(b.buildingId);
      if (def.output?.supply) stockGain += def.output.supply;
      return b;
    });
    const supplyStock = Math.min(200, ts.supplyStock + stockGain);
    if (changed || supplyStock !== ts.supplyStock) {
      territories[tid] = { ...ts, buildings, supplyStock };
    }
  }

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, resources },
    },
    territories,
  };
}

export function canAfford(
  player: PlayerState,
  cost: { energy: number; alloy?: number; research?: number; supply?: number },
): boolean {
  if (player.resources.energy < cost.energy) return false;
  if ((cost.alloy ?? 0) > player.resources.alloy) return false;
  if ((cost.research ?? 0) > player.resources.research) return false;
  if ((cost.supply ?? 0) > player.resources.supply) return false;
  return true;
}

export function spend(
  player: PlayerState,
  cost: { energy: number; alloy?: number; research?: number; supply?: number },
): PlayerState {
  return {
    ...player,
    resources: {
      energy: player.resources.energy - cost.energy,
      alloy: player.resources.alloy - (cost.alloy ?? 0),
      research: player.resources.research - (cost.research ?? 0),
      supply: player.resources.supply - (cost.supply ?? 0),
    },
  };
}

/** Invasion supply cost for a strike force. */
export function forceSupplyCost(
  force: { unitId: string; count: number }[],
  getSupply: (unitId: string) => number,
): number {
  return force.reduce((s, f) => s + getSupply(f.unitId) * f.count, 0);
}
