import { useSyncExternalStore } from "react";
import type { GameAction } from "../engine/actions";
import { activePlayerId } from "../engine/reducer";
import type { GameState, PlayerState } from "../engine/state";
import type { Transport } from "../net/transport";

export interface UseGameResult {
  state: GameState;
  dispatch: (action: GameAction) => void;
  activeId: string;
  activePlayer: PlayerState | null;
  isHumanTurn: boolean;
}

/** Minimal placeholder before transport is ready (menu shell). */
const EMPTY_MENU: GameState = {
  version: 1,
  seed: 0,
  turn: 0,
  phase: "play",
  activePlayerIndex: 0,
  playerOrder: [],
  players: {},
  territories: {},
  battle: null,
  selectedTerritoryId: null,
  screen: "menu",
  multiplayerMode: "solo",
  winner: null,
  message: null,
  nextInstanceId: 1,
  aiAttackPlans: [],
};

/**
 * Subscribe to a Transport and expose state + dispatch + active player helpers.
 */
export function useGame(transport: Transport | null): UseGameResult {
  const state = useSyncExternalStore(
    (onStoreChange) => {
      if (!transport) return () => undefined;
      return transport.subscribe(onStoreChange);
    },
    () => transport?.getState() ?? EMPTY_MENU,
    () => transport?.getState() ?? EMPTY_MENU,
  );

  const activeId =
    state.playerOrder.length > 0 ? activePlayerId(state) : "";
  const activePlayer = activeId ? (state.players[activeId] ?? null) : null;

  return {
    state,
    dispatch: (action) => {
      transport?.dispatch(action);
    },
    activeId,
    activePlayer,
    isHumanTurn: activePlayer?.kind === "human",
  };
}
