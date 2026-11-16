import type { DoctrineId } from "../data/doctrines";
import type { FactionId } from "../data/types";
import type {
  AiAttackPlan,
  CommanderRole,
  Screen,
  StrikeForceSlot,
  StrikeKind,
} from "./state";

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
  | { type: "RETREAT_BATTLE" }
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
  | {
      type: "CONFIRM_CAPTURE";
      payload: {
        occupyCount: number;
        disposition?: "raze" | "keep";
      };
    }
  | {
      type: "STABILIZE_TERRITORY";
      payload: { territoryId: string };
    }
  | {
      type: "MARKET_TRADE";
      payload: {
        from: import("../data/types").ResourceId;
        to: import("../data/types").ResourceId;
        amount: number;
      };
    }
  | {
      type: "DISBAND_UNITS";
      payload: { territoryId: string; unitId: string; count: number };
    }
  | {
      type: "ORDER_ROUTE";
      payload: {
        fromId: string;
        toId: string;
        force: StrikeForceSlot[];
        path: string[];
      };
    }
  | {
      type: "CREATE_SQUAD";
      payload: {
        territoryId: string;
        force: StrikeForceSlot[];
        name?: string;
      };
    }
  | {
      type: "RENAME_SQUAD";
      payload: { squadId: string; name: string };
    }
  | { type: "DISBAND_SQUAD"; payload: { squadId: string } }
  | {
      type: "MERGE_SQUADS";
      payload: { intoId: string; fromId: string };
    }
  | {
      type: "ORDER_SQUAD_MOVE";
      payload: { squadId: string; toId: string; path?: string[] };
    }
  | {
      type: "DEPART_SQUAD";
      payload: {
        squadId: string;
        force: StrikeForceSlot[];
        mode: "garrison" | "new_squad";
        name?: string;
      };
    }
  | {
      type: "ADD_TO_SQUAD";
      payload: {
        squadId: string;
        fromId: string;
        force: StrikeForceSlot[];
      };
    }
  | { type: "SELECT_SQUAD"; payload: { squadId: string | null } }
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
  | { type: "DISMISS_NEWS_DIGEST" }
  | { type: "DISMISS_ECONOMY_SUMMARY" }
  | { type: "SET_PLANNED_ROUTE"; payload: { path: string[] | null } }
  | {
      type: "TRAIN_COMMANDER";
      payload: { territoryId: string; role: CommanderRole };
    }
  | {
      type: "ATTACH_COMMANDER";
      payload: { commanderId: string; territoryId: string | null };
    }
  | {
      type: "LAUNCH_STRIKE";
      payload: { kind: StrikeKind; targetId: string };
    }
  | {
      type: "SET_STRIKE_TARGETING";
      payload: { kind: StrikeKind | null };
    }
  | {
      type: "LAUNCH_RECON";
      payload: {
        targetId: string;
        mode: "drone" | "satellite";
      };
    }
  | {
      type: "SAVE_ARMY_TEMPLATE";
      payload: { name: string; force: StrikeForceSlot[] };
    }
  | {
      type: "DELETE_ARMY_TEMPLATE";
      payload: { templateId: string };
    }
  | { type: "DISMISS_HANDOFF" }
  | { type: "CLEAR_STRIKE_FX" };

export type DifficultyId = "easy" | "normal" | "hard";

export interface NewGamePayload {
  humanCount: number;
  aiCount: number;
  humanNames?: string[];
  multiplayerMode: "solo" | "hotseat" | "lan";
  seed?: number;
  /** Theater map — World War (Earth) or Civil War (USA). */
  mapId?: import("../data/maps/types").MapId;
  /** Optional explicit faction assignment for humans (defaults to player, faction_a...). */
  humanFactions?: FactionId[];
  /** AI budget / starting tech / aggression. Default normal. */
  difficulty?: DifficultyId;
  /**
   * Optional turn limit for VP race (0 = off). Default win remains total domination
   * (all territories including neutrals). With turnLimit > 0, highest VP also wins.
   */
  turnLimit?: number;
  /** When true (and turnLimit > 0), VP race is active alongside domination. */
  victoryPointsEnabled?: boolean;
  /** Doctrine for human player 0 (solo) or per-human list. */
  doctrineId?: DoctrineId;
  /** Per-human doctrines (hot-seat); falls back to doctrineId / vanguard. */
  humanDoctrines?: DoctrineId[];
}
