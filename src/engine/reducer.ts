import { getBuilding } from "../data/buildings";
import { GAME_LOOP } from "../data/gameLoop";
import { getTerritory } from "../data/map/territories";
import { getUnit } from "../data/units";
import type { GameAction } from "./actions";
import {
  applyBattleResult,
  confirmCaptureOccupation,
  createBattle,
  tickBattle,
} from "./combat";
import {
  applyEconomyTick,
  canAfford,
  forceSupplyCost,
  spend,
} from "./economy";
import { createInitialState, createMenuState } from "./init";
import { startArmyMove, tickArmiesForPlayer } from "./movement";
import { canPlaceBuilding } from "./placement";
import {
  applyPopulationGrowth,
  spendCampaignBudget,
} from "./population";
import { applyResearch } from "./research";
import type { GameState } from "./state";
import {
  assignBuildingWorkers,
  enqueueUnit,
  enqueueWorker,
  tickTraining,
} from "./training";
import { checkEliminationsAndVictory } from "./victory";

export { createMenuState };

export function activePlayerId(state: GameState): string {
  return state.playerOrder[state.activePlayerIndex]!;
}

export function reduce(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "NEW_GAME":
      return createInitialState(action.payload);

    case "LOAD_STATE": {
      const s = action.payload.state;
      return {
        ...s,
        newsFeed: s.newsFeed ?? [],
        newsUnread: s.newsUnread ?? 0,
        newsDigest: s.newsDigest ?? null,
        turnLog: s.turnLog ?? [],
      };
    }

    case "SELECT_TERRITORY":
      return { ...state, selectedTerritoryId: action.payload.territoryId };

    case "SET_SCREEN":
      return { ...state, screen: action.payload.screen };

    case "DISMISS_MESSAGE":
      return { ...state, message: null };

    case "DISMISS_TURN_LOG":
      return { ...state, turnLog: [] };

    case "APPEND_TURN_LOG":
      return {
        ...state,
        turnLog: [...(state.turnLog ?? []), ...action.payload.lines],
      };

    case "APPEND_NEWS": {
      const items = action.payload.items ?? [];
      if (!items.length) {
        return action.payload.showDigest
          ? { ...state, newsDigest: [] }
          : state;
      }
      return {
        ...state,
        newsFeed: [...(state.newsFeed ?? []), ...items].slice(-120),
        newsUnread: (state.newsUnread ?? 0) + items.length,
        newsDigest: action.payload.showDigest ? items : state.newsDigest,
      };
    }

    case "MARK_NEWS_READ":
      return { ...state, newsUnread: 0 };

    case "DISMISS_NEWS_DIGEST":
      return { ...state, newsDigest: null };

    case "SET_CAMPAIGN_BUDGET": {
      const pid = activePlayerId(state);
      const player = state.players[pid]!;
      const energy = Math.max(
        0,
        Math.min(
          GAME_LOOP.campaigning.maxBudget,
          Math.floor(action.payload.energy),
        ),
      );
      return {
        ...state,
        players: {
          ...state.players,
          [pid]: { ...player, campaignBudget: energy },
        },
      };
    }

    case "SET_AI_ATTACK_PLANS":
      return { ...state, aiAttackPlans: action.payload.plans };

    case "PLACE_BUILDING": {
      if (state.phase !== "play") return state;
      const pid = activePlayerId(state);
      const player = state.players[pid]!;
      const { territoryId, buildingId, x, y } = action.payload;
      const ts = state.territories[territoryId];
      if (!ts || ts.owner !== pid) {
        return { ...state, message: "You do not control this territory." };
      }
      const place = canPlaceBuilding(ts, territoryId, buildingId, x, y, player);
      if (!place.ok) return { ...state, message: place.reason };
      const def = getBuilding(buildingId);
      if (!canAfford(player, def.cost)) {
        return { ...state, message: "Insufficient resources." };
      }
      const instanceId = `b${state.nextInstanceId}`;
      return {
        ...state,
        nextInstanceId: state.nextInstanceId + 1,
        players: {
          ...state.players,
          [pid]: spend(player, def.cost),
        },
        territories: {
          ...state.territories,
          [territoryId]: {
            ...ts,
            buildings: [
              ...ts.buildings,
              {
                instanceId,
                buildingId,
                x,
                y,
                hp: def.maxHp,
                buildRemaining: def.buildTime,
                workers: 0,
              },
            ],
          },
        },
        message: `Constructing ${def.name}…`,
      };
    }

    case "DEMOLISH_BUILDING": {
      const pid = activePlayerId(state);
      const { territoryId, instanceId } = action.payload;
      const ts = state.territories[territoryId];
      if (!ts || ts.owner !== pid) return state;
      const target = ts.buildings.find((b) => b.instanceId === instanceId);
      if (!target || target.buildingId === "command_nexus") return state;
      return {
        ...state,
        territories: {
          ...state.territories,
          [territoryId]: {
            ...ts,
            buildings: ts.buildings.filter((b) => b.instanceId !== instanceId),
          },
        },
      };
    }

    case "RESEARCH": {
      const pid = activePlayerId(state);
      const player = state.players[pid]!;
      const next = applyResearch(player, action.payload.nodeId);
      if (!next) return { ...state, message: "Cannot research that yet." };
      return {
        ...state,
        players: { ...state.players, [pid]: next },
        message: "Research complete.",
      };
    }

    case "RECRUIT": {
      // Legacy: train into selected territory garrison instantly if possible
      const tid = state.selectedTerritoryId;
      if (!tid) return { ...state, message: "Select a territory to train in." };
      return reduce(state, {
        type: "TRAIN_UNIT",
        payload: {
          territoryId: tid,
          unitId: action.payload.unitId,
          count: action.payload.count,
        },
      });
    }

    case "TRAIN_WORKER": {
      const pid = activePlayerId(state);
      const player = state.players[pid]!;
      const ts = state.territories[action.payload.territoryId];
      if (!ts || ts.owner !== pid) {
        return { ...state, message: "You do not control this territory." };
      }
      const result = enqueueWorker(player, ts, action.payload.count);
      if (!result) return { ...state, message: "Cannot train workers here." };
      return {
        ...state,
        players: { ...state.players, [pid]: result.player },
        territories: {
          ...state.territories,
          [action.payload.territoryId]: result.territory,
        },
        message: `Training ${action.payload.count} worker(s)…`,
      };
    }

    case "TRAIN_UNIT": {
      const pid = activePlayerId(state);
      const player = state.players[pid]!;
      const { territoryId, unitId, count } = action.payload;
      const ts = state.territories[territoryId];
      if (!ts || ts.owner !== pid) {
        return { ...state, message: "You do not control this territory." };
      }
      const result = enqueueUnit(player, ts, unitId, count);
      if (!result) {
        return { ...state, message: "Cannot train that unit here." };
      }
      const name = getUnit(unitId).name;
      return {
        ...state,
        players: { ...state.players, [pid]: result.player },
        territories: {
          ...state.territories,
          [territoryId]: result.territory,
        },
        message: `Training ${count}× ${name}…`,
      };
    }

    case "ASSIGN_WORKERS": {
      const pid = activePlayerId(state);
      const ts = state.territories[action.payload.territoryId];
      if (!ts || ts.owner !== pid) return state;
      const next = assignBuildingWorkers(
        ts,
        action.payload.instanceId,
        action.payload.workers,
      );
      if (!next) return state;
      return {
        ...state,
        territories: {
          ...state.territories,
          [action.payload.territoryId]: next,
        },
      };
    }

    case "MOVE_GARRISON": {
      // Legacy single-unit move → multi-turn march
      const pid = activePlayerId(state);
      const { fromId, toId, unitId, count } = action.payload;
      return startArmyMove(state, pid, fromId, toId, [{ unitId, count }]);
    }

    case "ORDER_MOVE": {
      if (state.phase !== "play") return state;
      const pid = activePlayerId(state);
      return startArmyMove(
        state,
        pid,
        action.payload.fromId,
        action.payload.toId,
        action.payload.force,
      );
    }

    case "CONFIRM_CAPTURE": {
      if (state.phase !== "capture" || !state.pendingCapture) return state;
      const next = confirmCaptureOccupation(state, action.payload.occupyCount);
      return checkEliminationsAndVictory(
        next,
        state.pendingCapture.territoryId
          ? state.territories[state.pendingCapture.territoryId]?.owner
          : null,
      );
    }

    case "START_INVASION": {
      // March into the target — battle opens on arrival via tickArmiesForPlayer.
      if (state.phase !== "play") return state;
      const pid = activePlayerId(state);
      const player = state.players[pid]!;
      const { fromId, toId, force } = action.payload;
      const from = state.territories[fromId];
      const to = state.territories[toId];
      if (!from || from.owner !== pid) {
        return { ...state, message: "Launch from a territory you own." };
      }
      if (!to || to.owner === pid) {
        return { ...state, message: "Pick an enemy territory." };
      }
      const fromDef = getTerritory(fromId);
      if (!fromDef.neighbors.includes(toId)) {
        return { ...state, message: "Target must be adjacent." };
      }
      if (!force.length || force.every((f) => f.count <= 0)) {
        return { ...state, message: "Assemble a strike force." };
      }
      for (const slot of force) {
        if ((from.garrison[slot.unitId] ?? 0) < slot.count) {
          return { ...state, message: "Not enough units in local garrison." };
        }
      }
      const supplyNeed = forceSupplyCost(
        force,
        (id) => getUnit(id).supplyCost ?? 1,
      );
      if (player.resources.supply < supplyNeed) {
        return {
          ...state,
          message: `Insufficient supply (need ${supplyNeed}).`,
        };
      }
      const withSupply: GameState = {
        ...state,
        players: {
          ...state.players,
          [pid]: {
            ...player,
            resources: {
              ...player.resources,
              supply: player.resources.supply - supplyNeed,
            },
          },
        },
      };
      const marched = startArmyMove(withSupply, pid, fromId, toId, force);
      if (!(marched.armiesInTransit?.length ?? 0)) {
        return { ...state, message: marched.message ?? "Cannot invade." };
      }
      return {
        ...marched,
        message: `Invasion force marching on ${getTerritory(toId).name}.`,
      };
    }

    case "BATTLE_TICK": {
      if (!state.battle || state.battle.status !== "running") return state;
      return {
        ...state,
        battle: tickBattle(state.battle, action.payload.dt),
      };
    }

    case "RESOLVE_BATTLE":
      return applyBattleResult(state);

    case "END_TURN": {
      if (state.phase !== "play") return state;
      const pid = activePlayerId(state);
      let cur = state;
      const ending = cur.players[pid];
      if (!ending || ending.eliminated) {
        // Skip — advance pointer only
      } else {
        const { player: afterSpend, spent } = spendCampaignBudget(ending);
        const territories = applyPopulationGrowth(
          { ...cur, players: { ...cur.players, [pid]: afterSpend } },
          pid,
          spent,
        );
        const trained = tickTraining(territories, pid);
        cur = {
          ...cur,
          players: { ...cur.players, [pid]: afterSpend },
          territories: trained,
        };
      }

      // Advance to next non-eliminated player (humans first in playerOrder)
      let idx = cur.activePlayerIndex;
      let turn = cur.turn;
      let guard = 0;
      do {
        idx = (idx + 1) % cur.playerOrder.length;
        if (idx === 0) turn += 1;
        guard += 1;
      } while (
        guard < cur.playerOrder.length + 1 &&
        cur.players[cur.playerOrder[idx]!]?.eliminated
      );

      let next: GameState = {
        ...cur,
        activePlayerIndex: idx,
        turn,
        selectedTerritoryId: null,
        screen: "map",
        aiAttackPlans: [],
        turnLog:
          cur.players[pid]?.kind === "ai"
            ? cur.turnLog
            : [],
      };
      const nextPid = next.playerOrder[idx]!;
      next = applyEconomyTick(next, nextPid);
      if (next.phase === "ended") return next;
      next = tickArmiesForPlayer(next, nextPid);
      if (next.phase === "battle" || next.phase === "ended") return next;

      const p = next.players[nextPid]!;
      const owned = Object.entries(next.territories).find(
        ([, ts]) => ts.owner === nextPid,
      );
      return {
        ...next,
        selectedTerritoryId: owned?.[0] ?? null,
        message:
          p.kind === "human"
            ? `${p.displayName}'s turn (Turn ${turn}).`
            : `${p.displayName} is executing orders…`,
      };
    }

    default:
      return state;
  }
}
