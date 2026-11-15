import type { GameAction } from "../engine/actions";
import { reduce } from "../engine/reducer";
import type { GameState } from "../engine/state";
import type { Transport } from "./transport";

/** Same-process transport for solo + hot-seat. Instant, authoritative. */
export function createLocalTransport(initial: GameState): Transport {
  let state = initial;
  const listeners = new Set<(s: GameState) => void>();

  return {
    kind: "local",
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(action: GameAction) {
      state = reduce(state, action);
      for (const l of listeners) l(state);
    },
  };
}
