import type { FactionId } from "../data/types";
import type { AiAttackPlan, Screen, StrikeForceSlot } from "./state";

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
  /** @deprecated Prefer TRAIN_UNIT into a territory garrison. */
  | { type: "RECRUIT"; payload: { unitId: string; count: number } }
  | {
      type: "START_INVASION";
      payload: { fromId: string; toId: string; force: StrikeForceSlot[] };
    }
  | { type: "BATTLE_TICK"; payload: { dt: number } }
  | { type: "RESOLVE_BATTLE" }
  | { type: "END_TURN" }
  | { type: "DISMISS_MESSAGE" }
  | { type: "DISMISS_TURN_LOG" }
  | { type: "LOAD_STATE"; payload: { state: import("./state").GameState } }
  | { type: "SET_CAMPAIGN_BUDGET"; payload: { energy: number } }
  | {
      type: "TRAIN_WORKER";
      payload: { territoryId: string; count: number };
    }
  | {
      type: "TRAIN_UNIT";
      payload: { territoryId: string; unitId: string; count: number };
    }
  | {
      type: "ASSIGN_WORKERS";
      payload: { territoryId: string; instanceId: string; workers: number };
    }
  | {
      type: "MOVE_GARRISON";
      payload: {
        fromId: string;
        toId: string;
        unitId: string;
        count: number;
      };
    }
  | {
      type: "ORDER_MOVE";
      payload: {
        fromId: string;
        toId: string;
        force: StrikeForceSlot[];
      };
    }
  | { type: "CONFIRM_CAPTURE"; payload: { occupyCount: number } }
  | { type: "SET_AI_ATTACK_PLANS"; payload: { plans: AiAttackPlan[] } }
  | { type: "APPEND_TURN_LOG"; payload: { lines: string[] } }
  | {
      type: "APPEND_NEWS";
      payload: {
        items: import("./state").NewsItem[];
        /** When true, opens the post-AI digest overlay. */
        showDigest?: boolean;
      };
    }
  | { type: "MARK_NEWS_READ" }
  | { type: "DISMISS_NEWS_DIGEST" };

export interface NewGamePayload {
  humanCount: number;
  aiCount: number;
  humanNames?: string[];
  multiplayerMode: "solo" | "hotseat" | "lan";
  seed?: number;
  /** Optional explicit faction assignment for humans (defaults to player, faction_a...). */
  humanFactions?: FactionId[];
}
