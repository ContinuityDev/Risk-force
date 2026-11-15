/**
 * Homeland cores vs occupied territories; raze / keep on capture; stabilize.
 */

import { GAME_LOOP } from "../data/gameLoop";
import type { GameState, PendingCapture, TerritoryState } from "./state";
import { mergeIntoGarrison, normalizeForce, syncHpArray } from "./garrisonHp";
import type { StrikeForceSlot } from "./state";

export function outputMultiplier(ts: TerritoryState): number {
  if (ts.control === "occupied") return GAME_LOOP.occupation.occupiedOutputMult;
  return 1;
}

export function trainMultiplier(ts: TerritoryState): number {
  if (ts.control === "occupied") return GAME_LOOP.occupation.occupiedTrainMult;
  return 1;
}

/** Advance occupied→stabilized when garrisoned for N turns, or via Stabilize. */
export function tickOccupation(
  territories: Record<string, TerritoryState>,
  playerId: string,
): Record<string, TerritoryState> {
  const next = { ...territories };
  const need = GAME_LOOP.occupation.stabilizeTurns;
  for (const [tid, ts] of Object.entries(territories)) {
    if (ts.owner !== playerId || ts.control !== "occupied") continue;
    const garrisoned =
      Object.values(ts.garrison).reduce((a, b) => a + b, 0) > 0;
    const occupiedTurns = garrisoned ? (ts.occupiedTurns ?? 0) + 1 : 0;
    if (occupiedTurns >= need) {
      next[tid] = {
        ...ts,
        control: "stabilized",
        occupiedTurns,
      };
    } else if (occupiedTurns !== ts.occupiedTurns) {
      next[tid] = { ...ts, occupiedTurns };
    }
  }
  return next;
}

export function stabilizeTerritory(
  state: GameState,
  territoryId: string,
  playerId: string,
): GameState {
  const ts = state.territories[territoryId];
  if (!ts || ts.owner !== playerId || ts.control !== "occupied") {
    return { ...state, message: "Nothing to stabilize here." };
  }
  const cost = { energy: 35, alloy: 10 };
  const player = state.players[playerId]!;
  if (
    player.resources.energy < cost.energy ||
    player.resources.alloy < cost.alloy
  ) {
    return { ...state, message: "Need 35 energy and 10 alloy to stabilize." };
  }
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        resources: {
          ...player.resources,
          energy: player.resources.energy - cost.energy,
          alloy: player.resources.alloy - cost.alloy,
        },
      },
    },
    territories: {
      ...state.territories,
      [territoryId]: {
        ...ts,
        control: "stabilized",
        occupiedTurns: GAME_LOOP.occupation.stabilizeTurns,
      },
    },
    message: `${territoryId} stabilized — full output restored.`,
  };
}

export type CaptureDisposition = "raze" | "keep";

/**
 * Apply raze (cash bump, wipe buildings, pop penalty) or keep (damaged buildings).
 * Then place occupyCount survivors.
 */
export function resolveCaptureDisposition(
  state: GameState,
  disposition: CaptureDisposition,
  occupyCount: number,
): GameState {
  const pending = state.pendingCapture;
  if (!pending) return state;
  const tid = pending.territoryId;
  const ts = state.territories[tid]!;
  const players = { ...state.players };
  let attacker = players[pending.attacker]!;
  let population = pending.population;
  let buildings = ts.buildings;
  let supplyStock = ts.supplyStock;

  const capturedBuildings = pending.buildings ?? ts.buildings;
  if (disposition === "raze") {
    buildings = [];
    population = Math.max(
      1,
      Math.floor(population * GAME_LOOP.occupation.razePopRetain),
    );
    supplyStock = Math.floor((pending.supplyStock ?? supplyStock) * 0.15);
    attacker = {
      ...attacker,
      resources: {
        ...attacker.resources,
        energy:
          attacker.resources.energy + GAME_LOOP.occupation.razeEnergyBonus,
      },
    };
  } else {
    // Keep: buildings survive at reduced HP (need repair).
    buildings = capturedBuildings
      .map((b) => ({
        ...b,
        hp: Math.max(
          1,
          Math.floor(b.hp * GAME_LOOP.occupation.keepBuildingHpMult),
        ),
      }))
      .filter((b) => b.buildingId !== "command_nexus");
    population = pending.population;
    supplyStock = pending.supplyStock ?? supplyStock;
  }

  players[pending.attacker] = attacker;

  const base: TerritoryState = {
    ...ts,
    owner: pending.attacker,
    buildings,
    supplyStock,
    population,
    workers: pending.workers,
    garrison: {},
    garrisonHp: {},
    trainingQueue: [],
    control: "occupied",
    occupiedTurns: 0,
    movedThisTurn: false,
  };

  // Reuse occupation placement
  const withPending: GameState = {
    ...state,
    players,
    territories: { ...state.territories, [tid]: base },
    pendingCapture: {
      ...pending,
      population,
      survivors: normalizeForce(pending.survivors),
    },
  };
  return placeOccupation(withPending, occupyCount, disposition);
}

function placeOccupation(
  state: GameState,
  occupyCount: number,
  disposition: CaptureDisposition,
): GameState {
  const pending = state.pendingCapture!;
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
      occupyForce.push({ unitId: slot.unitId, count: occ, hps: hps.slice(0, occ) });
    }
    const ret = slot.count - occ;
    if (ret > 0) {
      returnForce.push({ unitId: slot.unitId, count: ret, hps: hps.slice(occ) });
    }
  }

  const tid = pending.territoryId;
  let territories = {
    ...state.territories,
    [tid]: mergeIntoGarrison(
      { ...state.territories[tid]!, garrison: {}, garrisonHp: {} },
      occupyForce,
    ),
  };
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
    message: `${tid} ${disposition === "raze" ? "razed" : "secured"} · ${take} occupy.`,
  };
}

/** AI default: keep if many buildings, else raze. */
export function aiCaptureDisposition(
  _pending: PendingCapture,
  buildingCount: number,
): CaptureDisposition {
  return buildingCount >= 3 ? "keep" : "raze";
}
