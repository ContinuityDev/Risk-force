import type { GameAction } from "../engine/actions";
import type { GameState } from "../engine/state";

/**
 * Transport interface — local hot-seat, LAN WebSocket, and future online
 * all implement the same contract. The UI only talks to a Transport.
 */
export interface Transport {
  readonly kind: "local" | "lan" | "online";
  /** Current authoritative state snapshot. */
  getState(): GameState;
  /** Subscribe to state updates. Returns unsubscribe. */
  subscribe(listener: (state: GameState) => void): () => void;
  /** Dispatch a player command (validated/reduced locally or by host). */
  dispatch(action: GameAction): void;
  /** Optional: connect to remote host. */
  connect?(address: string): Promise<void>;
  disconnect?(): void;
}
