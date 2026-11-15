import type { GameAction } from "../engine/actions";
import type { GameState } from "../engine/state";
import type { Transport } from "./transport";

type ServerMsg =
  | { type: "STATE"; state: GameState }
  | { type: "ERROR"; message: string };

type ClientMsg =
  | { type: "JOIN"; name: string }
  | { type: "ACTION"; action: GameAction }
  | { type: "HELLO" };

/**
 * Browser-side LAN client. Host runs `npm run lan-host`.
 * Clients connect via ws://<host-lan-ip>:3847
 */
export function createLanTransport(initial: GameState): Transport & {
  connect(address: string): Promise<void>;
  disconnect(): void;
} {
  let state = initial;
  let socket: WebSocket | null = null;
  const listeners = new Set<(s: GameState) => void>();

  function emit() {
    for (const l of listeners) l(state);
  }

  return {
    kind: "lan",
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(action: GameAction) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.warn("LAN: not connected; action dropped", action.type);
        return;
      }
      const msg: ClientMsg = { type: "ACTION", action };
      socket.send(JSON.stringify(msg));
    },
    async connect(address: string) {
      const url = address.startsWith("ws") ? address : `ws://${address}`;
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(url);
        socket = ws;
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "HELLO" } satisfies ClientMsg));
          resolve();
        };
        ws.onerror = () => reject(new Error("Failed to connect to LAN host"));
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as ServerMsg;
            if (msg.type === "STATE") {
              state = msg.state;
              emit();
            }
          } catch {
            /* ignore malformed */
          }
        };
        ws.onclose = () => {
          socket = null;
        };
      });
    },
    disconnect() {
      socket?.close();
      socket = null;
    },
  };
}
