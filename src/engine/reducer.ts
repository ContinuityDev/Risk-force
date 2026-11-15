import { getBuilding } from "../data/buildings";
import { GAME_LOOP } from "../data/gameLoop";
import { getTerritory } from "../data/map/territories";
import { getResearch } from "../data/research";
import { getUnit } from "../data/units";
import type { GameAction } from "./actions";
import {
  applyBattleResult,
  retreatBattle,
  tickBattle,
} from "./combat";
import {
  applyEconomyTick,
  canAfford,
  computeEnergyLedger,
  computeIncome,
  forceSupplyCost,
  spend,
} from "./economy";
import { createInitialState, createMenuState } from "./init";
import { payInvasionSupply } from "./logistics";
import { applyMarketTrade } from "./market";
import { startArmyMove, tickArmiesForPlayer } from "./movement";
import {
  resolveCaptureDisposition,
  stabilizeTerritory,
} from "./occupation";
import { findRoute } from "./pathfinding";
import { canPlaceBuilding } from "./placement";
import {
  applyPopulationGrowth,
  spendCampaignBudget,
} from "./population";
import { applyResearch, tickResearchForPlayer } from "./research";
import { disbandUnits } from "./solvency";
import type { FactionId } from "../data/types";
import type { GameState, TurnEconomySummary } from "./state";
import {
  assignBuildingWorkers,
  enqueueUnit,
  enqueueWorker,
  tickTraining,
} from "./training";
import { checkEliminationsAndVictory } from "./victory";
import { checkTurnLimitVictory } from "./victoryPoints";

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
      const territories: typeof s.territories = {};
      for (const [id, ts] of Object.entries(s.territories ?? {})) {
        territories[id] = {
          ...ts,
          garrisonHp: ts.garrisonHp ?? {},
          control: ts.control ?? "core",
          occupiedTurns: ts.occupiedTurns ?? 0,
          movedThisTurn: ts.movedThisTurn ?? false,
        };
      }
      const players: typeof s.players = {};
      for (const [id, p] of Object.entries(s.players ?? {})) {
        players[id] = { ...p, researchJob: p.researchJob ?? null };
      }
      return {
        ...s,
        territories,
        players,
        newsFeed: s.newsFeed ?? [],
        newsUnread: s.newsUnread ?? 0,
        newsDigest: s.newsDigest ?? null,
        turnLog: s.turnLog ?? [],
        battle: s.battle
          ? {
              ...s.battle,
              fromId: s.battle.fromId ?? null,
              mods: s.battle.mods ?? {
                terrainDealt: 1,
                defenderIncoming: 1,
                attackerFrontage: 1,
                defenderFrontage: 1,
              },
            }
          : null,
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

    case "DISMISS_ECONOMY_SUMMARY":
      return { ...state, economySummary: null };

    case "SET_PLANNED_ROUTE":
      return { ...state, plannedRoute: action.payload.path };

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
      const turns = next.researchJob?.totalTurns ?? 1;
      return {
        ...state,
        players: { ...state.players, [pid]: next },
        message: `Research started (${turns} turn${turns === 1 ? "" : "s"}).`,
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
      const disposition = action.payload.disposition ?? "raze";
      const next = resolveCaptureDisposition(
        state,
        disposition,
        action.payload.occupyCount,
      );
      return checkEliminationsAndVictory(
        next,
        state.pendingCapture.territoryId
          ? state.territories[state.pendingCapture.territoryId]?.owner
          : null,
      );
    }

    case "STABILIZE_TERRITORY": {
      if (state.phase !== "play") return state;
      return stabilizeTerritory(
        state,
        action.payload.territoryId,
        activePlayerId(state),
      );
    }

    case "MARKET_TRADE": {
      if (state.phase !== "play") return state;
      return applyMarketTrade(
        state,
        activePlayerId(state),
        action.payload.from,
        action.payload.to,
        action.payload.amount,
      );
    }

    case "DISBAND_UNITS": {
      if (state.phase !== "play") return state;
      return disbandUnits(
        state,
        activePlayerId(state),
        action.payload.territoryId,
        action.payload.unitId,
        action.payload.count,
      );
    }

    case "ORDER_ROUTE": {
      if (state.phase !== "play") return state;
      const pid = activePlayerId(state);
      const { fromId, toId, force, path } = action.payload;
      const route =
        path.length >= 2
          ? findRoute(fromId, toId, force) && path[0] === fromId
            ? {
                path,
                totalTurns: 0,
              }
            : { path, totalTurns: 0 }
          : findRoute(fromId, toId, force, {
              avoidEnemy: true,
              owner: pid,
              territories: state.territories,
            });
      if (!route || route.path.length < 2) {
        return { ...state, message: "No route to destination." };
      }
      const firstTo = route.path[1]!;
      const marched = startArmyMove(state, pid, fromId, firstTo, force);
      const army = marched.armiesInTransit?.[marched.armiesInTransit.length - 1];
      if (!army) return { ...state, message: marched.message ?? "Cannot march." };
      const withPath = {
        ...marched,
        plannedRoute: route.path,
        armiesInTransit: marched.armiesInTransit!.map((a, i, arr) =>
          i === arr.length - 1
            ? { ...a, pathRemaining: route.path.slice(2) }
            : a,
        ),
        message: `Multi-hop march · ${route.path.length - 1} legs.`,
      };
      return withPath;
    }

    case "START_INVASION": {
      // March into the target — battle opens on arrival via tickArmiesForPlayer.
      if (state.phase !== "play") return state;
      const pid = activePlayerId(state);
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
      const withSupply = payInvasionSupply(state, pid, fromId, supplyNeed);
      if (!withSupply) {
        return {
          ...state,
          message: `Insufficient supply (need ${supplyNeed}).`,
        };
      }
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

    case "RETREAT_BATTLE":
      return retreatBattle(state);

    case "END_TURN": {
      if (state.phase !== "play") return state;
      const pid = activePlayerId(state);
      let cur = state;
      const ending = cur.players[pid];
      const finishedTraining: string[] = [];
      const finishedResearch: string[] = [];
      if (!ending || ending.eliminated) {
        // Skip — advance pointer only
      } else {
        const { player: afterSpend, spent } = spendCampaignBudget(ending);
        const territories = applyPopulationGrowth(
          { ...cur, players: { ...cur.players, [pid]: afterSpend } },
          pid,
          spent,
        );
        // Capture training completions
        for (const ts of Object.values(territories)) {
          if (ts.owner !== pid) continue;
          for (const job of ts.trainingQueue) {
            if (job.turnsRemaining === 1) {
              if (job.kind === "worker") {
                finishedTraining.push(`${job.count}× worker`);
              } else if (job.unitId) {
                try {
                  finishedTraining.push(
                    `${job.count}× ${getUnit(job.unitId).name}`,
                  );
                } catch {
                  finishedTraining.push(`${job.count}× ${job.unitId}`);
                }
              }
            }
          }
        }
        const trained = tickTraining(territories, pid);
        cur = {
          ...cur,
          players: { ...cur.players, [pid]: afterSpend },
          territories: trained,
        };
        const beforeJob = cur.players[pid]?.researchJob?.nodeId;
        cur = tickResearchForPlayer(cur, pid);
        if (beforeJob && !cur.players[pid]?.researchJob) {
          try {
            finishedResearch.push(getResearch(beforeJob).name);
          } catch {
            finishedResearch.push(beforeJob);
          }
        }
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
        economySummary: null,
      };
      const nextPid = next.playerOrder[idx]!;

      // Track buildings that will complete this economy tick
      const finishedBuildings: string[] = [];
      for (const ts of Object.values(next.territories)) {
        if (ts.owner !== nextPid) continue;
        for (const b of ts.buildings) {
          if (b.buildRemaining === 1) {
            try {
              finishedBuildings.push(getBuilding(b.buildingId).name);
            } catch {
              finishedBuildings.push(b.buildingId);
            }
          }
        }
      }

      next = applyEconomyTick(next, nextPid);
      next = checkTurnLimitVictory(next);
      if (next.phase === "ended") return next;
      next = tickArmiesForPlayer(next, nextPid);
      if (next.phase === "battle" || next.phase === "ended") return next;

      const p = next.players[nextPid]!;
      const owned = Object.entries(next.territories).find(
        ([, ts]) => ts.owner === nextPid,
      );

      let economySummary: TurnEconomySummary | null = null;
      if (p.kind === "human") {
        const income = computeIncome(next, nextPid);
        const ledger = computeEnergyLedger(next, nextPid);
        economySummary = {
          turn,
          playerId: nextPid as FactionId,
          income,
          upkeep: ledger.upkeep,
          net: ledger.net,
          finishedBuildings,
          // Training/research finished on the previous player's end; show for self only when looping
          finishedTraining: nextPid === pid ? finishedTraining : [],
          finishedResearch: nextPid === pid ? finishedResearch : [],
        };
      }

      return {
        ...next,
        selectedTerritoryId: owned?.[0] ?? null,
        economySummary,
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
