import type { FactionId } from "../data/types";
import type { Screen, StrikeForceSlot } from "./state";

/**
 * All game mutations go through these commands.
 * Pure reducer + serializable payloads = save/load, hot-seat, LAN, and future online.
 */
export type GameAction =
  | { type: "NEW_GAME"; payload: NewGamePayload }
  | { type: "SELECT_TERRITORY"; payload: { territoryId: string | null } }
  | { type: "SET_SCREEN"; payload: { screen: Screen } }
  | {
      type: "PLACE_BUILDING";
      payload: { territoryId: string; buildingId: string; x: number; y: number };
    }
  | {
      type: "DEMOLISH_BUILDING";
      payload: { territoryId: string; instanceId: string };
    }
  | { type: "RESEARCH"; payload: { nodeId: string } }
  | { type: "RECRUIT"; payload: { unitId: string; count: number } }
  | {
      type: "START_INVASION";
      payload: { fromId: string; toId: string; force: StrikeForceSlot[] };
    }
  | { type: "BATTLE_TICK"; payload: { dt: number } }
  | { type: "RESOLVE_BATTLE" }
  | { type: "END_TURN" }
  | { type: "DISMISS_MESSAGE" }
  | { type: "LOAD_STATE"; payload: { state: import("./state").GameState } };

export interface NewGamePayload {
  humanCount: number;
  aiCount: number;
  humanNames?: string[];
  multiplayerMode: "solo" | "hotseat" | "lan";
  seed?: number;
  /** Optional explicit faction assignment for humans (defaults to player, faction_a...). */
  humanFactions?: FactionId[];
}
