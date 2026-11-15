import { getBuilding } from "../data/buildings";
import { GAME_LOOP } from "../data/gameLoop";
import type { ResourceId } from "../data/types";
import {
  applyContinentPopulation,
  continentIncome,
} from "./continents";
import type { GameState, PlayerState } from "./state";
import { emptyResources } from "./state";
import { healGarrison } from "./garrisonHp";
import { staffingMultiplier, workerCapForBuilding } from "./training";
import { applyEnergyUpkeep, computeEnergyUpkeep } from "./upkeep";
import { hasResearched } from "./research";

export { computeEnergyUpkeep };

/** Sum economy output for one player's completed buildings (worker-boosted). */
export function computeIncome(
  state: GameState,
  playerId: string,
): Record<ResourceId, number> {
  const income = emptyResources();
  const player = state.players[playerId];
  // Insolvent factions produce nothing until energy recovers.
  if (player?.insolvent) {
    return income;
  }
  for (const ts of Object.values(state.territories)) {
    if (ts.owner !== playerId) continue;
    for (const b of ts.buildings) {
      if (b.buildRemaining > 0 || b.hp <= 0) continue;
      const def = getBuilding(b.buildingId);
      if (!def.output) continue;
      const cap = workerCapForBuilding(b.buildingId);
      const mult = staffingMultiplier(b.workers ?? 0, cap);
      for (const [k, v] of Object.entries(def.output) as [ResourceId, number][]) {
        income[k] += v * mult;
      }
    }
  }
  const bonus = continentIncome(state, playerId);
  income.energy += bonus.energy;
  income.alloy += bonus.alloy;
  for (const k of Object.keys(income) as ResourceId[]) {
    income[k] = Math.floor(income[k]);
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
    for (const count of Object.values(ts.garrison)) {
      upkeep += Math.ceil(count * 0.15);
    }
  }
  const player = state.players[playerId];
  if (player) {
    for (const count of Object.values(player.reserves)) {
      upkeep += Math.ceil(count * 0.15);
    }
  }
  return upkeep;
}

/** Energy ledger for HUD tooltips: income vs upkeep vs campaign. */
export function computeEnergyLedger(
  state: GameState,
  playerId: string,
): {
  income: number;
  upkeep: number;
  campaign: number;
  net: number;
} {
  const income = computeIncome(state, playerId).energy;
  const upkeep = computeEnergyUpkeep(state, playerId);
  const campaign = state.players[playerId]?.campaignBudget ?? 0;
  return {
    income,
    upkeep,
    campaign,
    net: income - upkeep - campaign,
  };
}

/** Apply income, upkeep, construction (worker-sped), and local supply stockpiles. */
export function applyEconomyTick(state: GameState, playerId: string): GameState {
  const player = state.players[playerId];
  if (!player || player.eliminated) return state;

  const income = computeIncome(state, playerId);
  const supplyUpkeep = computeSupplyUpkeep(state, playerId);
  const cont = continentIncome(state, playerId);

  let cur: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        resources: {
          energy: player.resources.energy + income.energy,
          alloy: player.resources.alloy + income.alloy,
          research: player.resources.research + income.research,
          supply: Math.max(
            0,
            player.resources.supply + income.supply - supplyUpkeep,
          ),
        },
        // Clear insolvency before paying this turn's upkeep (re-evaluated below)
        insolvent: false,
      },
    },
  };

  cur = applyContinentPopulation(cur, playerId, cont.population, cont.held);

  const territories = { ...cur.territories };
  const insolventPrev = player.insolvent;
  for (const [tid, ts] of Object.entries(territories)) {
    if (ts.owner !== playerId) continue;
    let stockGain = 0;
    let changed = false;
    const assigned = ts.buildings.reduce((s, b) => s + (b.workers ?? 0), 0);
    const freeWorkers = Math.max(0, (ts.workers ?? 0) - assigned);
    const buildBonus = insolventPrev
      ? 0
      : Math.min(
          GAME_LOOP.workers.maxBuildSpeedBonus,
          freeWorkers * GAME_LOOP.workers.buildSpeedPerWorker,
        );
    const drain = 1 + (buildBonus >= 0.5 ? 1 : 0);

    const buildings = ts.buildings.map((b) => {
      if (b.buildRemaining > 0) {
        changed = true;
        return {
          ...b,
          workers: b.workers ?? 0,
          buildRemaining: Math.max(0, b.buildRemaining - drain),
        };
      }
      const def = getBuilding(b.buildingId);
      if (def.output?.supply && !insolventPrev) {
        const cap = workerCapForBuilding(b.buildingId);
        stockGain +=
          def.output.supply * staffingMultiplier(b.workers ?? 0, cap);
      }
      return b;
    });
    const supplyStock = Math.min(200, ts.supplyStock + Math.floor(stockGain));
    let nextTs = {
      ...ts,
      buildings,
      supplyStock,
      movedThisTurn: false,
    };
    // Repair Bay + field_repair heal garrison HP each turn.
    let healAmt = 0;
    if (!insolventPrev) {
      const hasBay = buildings.some(
        (b) =>
          b.buildRemaining <= 0 &&
          b.hp > 0 &&
          b.buildingId === "repair_bay",
      );
      if (hasBay) healAmt += GAME_LOOP.repair.repairBayHeal;
      if (hasResearched(player, "field_repair")) {
        healAmt += GAME_LOOP.repair.fieldRepairHeal;
      }
    }
    if (healAmt > 0) nextTs = healGarrison(nextTs, healAmt);
    if (
      changed ||
      supplyStock !== ts.supplyStock ||
      healAmt > 0 ||
      ts.movedThisTurn
    ) {
      territories[tid] = nextTs;
    }
  }

  cur = { ...cur, territories };
  const paid = applyEnergyUpkeep(cur, playerId);
  const log = [...(cur.turnLog ?? [])];
  if (paid.insolvent) {
    log.push(
      `${paid.player.displayName} insolvent (−${paid.upkeep} energy upkeep)` +
        (paid.deserted ? ` · ${paid.deserted} deserted` : ""),
    );
  }
  if (cont.held.length) {
    log.push(
      `${paid.player.displayName} holds ${cont.held.join(", ")} (+E${cont.energy} A${cont.alloy}).`,
    );
  }

  return {
    ...cur,
    players: {
      ...cur.players,
      [playerId]: paid.player,
    },
    territories: paid.territories,
    turnLog: log,
  };
}

export function canAfford(
  player: PlayerState,
  cost: { energy: number; alloy?: number; research?: number; supply?: number },
): boolean {
  return costShortfalls(player, cost).length === 0;
}

export type ResourceShortfall = {
  resource: import("../data/types").ResourceId;
  need: number;
  have: number;
  missing: number;
};

/** Which resources are short for a cost, and by how much. */
export function costShortfalls(
  player: PlayerState,
  cost: { energy: number; alloy?: number; research?: number; supply?: number },
): ResourceShortfall[] {
  const checks: {
    resource: import("../data/types").ResourceId;
    need: number;
    have: number;
  }[] = [
    { resource: "energy", need: cost.energy, have: player.resources.energy },
    {
      resource: "alloy",
      need: cost.alloy ?? 0,
      have: player.resources.alloy,
    },
    {
      resource: "research",
      need: cost.research ?? 0,
      have: player.resources.research,
    },
    {
      resource: "supply",
      need: cost.supply ?? 0,
      have: player.resources.supply,
    },
  ];
  return checks
    .filter((c) => c.need > 0 && c.have < c.need)
    .map((c) => ({
      ...c,
      missing: Math.ceil(c.need - c.have),
    }));
}

const RESOURCE_LABEL: Record<import("../data/types").ResourceId, string> = {
  energy: "Energy",
  alloy: "Alloy",
  research: "Research",
  supply: "Supply",
};

/** e.g. "Need 40 more Alloy" / "Need 20 Energy and 10 Alloy". */
export function formatShortfallMessage(shortfalls: ResourceShortfall[]): string {
  if (!shortfalls.length) return "";
  if (shortfalls.length === 1) {
    const s = shortfalls[0]!;
    return `Need ${s.missing} more ${RESOURCE_LABEL[s.resource]}`;
  }
  return `Need ${shortfalls
    .map((s) => `${s.missing} ${RESOURCE_LABEL[s.resource]}`)
    .join(" and ")}`;
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
