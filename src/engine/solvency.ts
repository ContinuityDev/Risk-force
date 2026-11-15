/**
 * Disband / mothball and insolvency helpers.
 */

import { GAME_LOOP } from "../data/gameLoop";
import { getUnit } from "../data/units";
import type { GameState } from "./state";
import { ensureTerritoryHp, takeFromGarrison } from "./garrisonHp";
import { computeEnergyLedger } from "./economy";

export function disbandUnits(
  state: GameState,
  playerId: string,
  territoryId: string,
  unitId: string,
  count: number,
): GameState {
  const ts = state.territories[territoryId];
  const player = state.players[playerId];
  if (!ts || !player || ts.owner !== playerId || count < 1) {
    return { ...state, message: "Cannot disband here." };
  }
  const pulled = takeFromGarrison(ensureTerritoryHp(ts), unitId, count);
  if (!pulled) return { ...state, message: "Not enough units to disband." };
  let refund = 0;
  try {
    const def = getUnit(unitId);
    refund = Math.floor(
      def.cost.energy * GAME_LOOP.solvency.disbandRefund * count,
    );
  } catch {
    refund = Math.floor(10 * count * GAME_LOOP.solvency.disbandRefund);
  }
  return {
    ...state,
    territories: {
      ...state.territories,
      [territoryId]: pulled.territory,
    },
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        resources: {
          ...player.resources,
          energy: player.resources.energy + refund,
        },
      },
    },
    message: `Disbanded ${count}× ${unitId} (+${refund} energy).`,
  };
}

/** Warn if an action's energy cost would push projected net strongly negative. */
export function wouldStressEconomy(
  state: GameState,
  playerId: string,
  extraEnergySpend: number,
): boolean {
  const ledger = computeEnergyLedger(state, playerId);
  const player = state.players[playerId];
  if (!player) return false;
  const projected =
    player.resources.energy - extraEnergySpend + ledger.net;
  return projected < GAME_LOOP.solvency.warnNetThreshold;
}

/** Retuned role upkeep already lives in GAME_LOOP; expose mothball mult. */
export function mothballUpkeepMult(): number {
  return GAME_LOOP.solvency.mothballUpkeepMult;
}
