import { GAME_LOOP } from "../data/gameLoop";
import type { FactionId } from "../data/types";
import { controlledContinents } from "./continents";
import type { GameState } from "./state";

export function computeVictoryPoints(
  state: GameState,
  playerId: string,
): number {
  const cfg = GAME_LOOP.victory;
  let pts = 0;
  for (const ts of Object.values(state.territories)) {
    if (ts.owner !== playerId) continue;
    pts += cfg.pointsPerTerritory;
    if (ts.control === "core") pts += cfg.pointsPerCore;
  }
  pts += controlledContinents(state, playerId).length * cfg.pointsPerContinent;
  return pts;
}

export function leadingByVp(state: GameState): {
  leader: FactionId | null;
  scores: Record<string, number>;
} {
  const scores: Record<string, number> = {};
  let leader: FactionId | null = null;
  let best = -1;
  for (const id of state.playerOrder) {
    if (state.players[id]?.eliminated) continue;
    const s = computeVictoryPoints(state, id);
    scores[id] = s;
    if (s > best) {
      best = s;
      leader = id as FactionId;
    }
  }
  return { leader, scores };
}

/** If turn limit hit with VP mode, crown VP leader (else leave domination-only). */
export function checkTurnLimitVictory(state: GameState): GameState {
  if (!state.victoryPointsEnabled || !state.turnLimit) return state;
  if (state.turn < state.turnLimit) return state;
  if (state.phase === "ended") return state;
  const { leader, scores } = leadingByVp(state);
  if (!leader) return state;
  return {
    ...state,
    winner: leader,
    phase: "ended",
    screen: "victory",
    message: `Turn limit — ${state.players[leader]?.displayName ?? leader} leads with ${scores[leader]} VP.`,
    battle: null,
    pendingCapture: null,
  };
}
