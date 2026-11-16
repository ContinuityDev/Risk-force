import { factionName } from "../data/factions";
import { activeMap } from "../data/maps/activate";
import type { FactionId } from "../data/types";
import type { GameState } from "./state";

/** Mark factions with zero territories as eliminated; crown a winner if one remains. */
export function checkEliminationsAndVictory(
  state: GameState,
  maybeVictim?: FactionId | string | null,
): GameState {
  const owned = new Set(Object.values(state.territories).map((t) => t.owner));
  const players = { ...state.players };
  const log = [...(state.turnLog ?? [])];
  let message = state.message;

  for (const [pid, p] of Object.entries(players)) {
    if (p.eliminated) continue;
    if (!owned.has(pid as FactionId)) {
      players[pid] = { ...p, eliminated: true };
      const notice = `${p.displayName} has been eliminated.`;
      log.push(notice);
      if (maybeVictim === pid || !message) message = notice;
    }
  }

  const living = state.playerOrder.filter(
    (id) => owned.has(id) && !players[id]?.eliminated,
  );

  // Domination requires every territory — including Neutral land.
  const neutralsRemain = owned.has("neutral");

  if (living.length === 1 && !neutralsRemain) {
    const winner = living[0]!;
    const theater = activeMap().meta.name;
    return {
      ...state,
      players,
      turnLog: log,
      winner,
      phase: "ended",
      screen: "victory",
      message: `${factionName(winner)} controls the entire ${theater} theater.`,
      battle: null,
      pendingCapture: null,
    };
  }

  return {
    ...state,
    players,
    turnLog: log,
    message,
  };
}
