import { getBuilding } from "../data/buildings";
import { GAME_LOOP } from "../data/gameLoop";
import { getTerritory } from "../data/map/territories";
import { getUnit } from "../data/units";
import type { GameAction } from "./actions";
import { applyBattleResult, createBattle, tickBattle } from "./combat";
import {
  applyEconomyTick,
  canAfford,
  forceSupplyCost,
  spend,
} from "./economy";
import { createInitialState, createMenuState } from "./init";
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

export { createMenuState };

export function activePlayerId(state: GameState): string {
  return state.playerOrder[state.activePlayerIndex]!;
}

export function reduce(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "NEW_GAME":
      return createInitialState(action.payload);

    case "LOAD_STATE":
      return { ...action.payload.state };

    case "SELECT_TERRITORY":
      return { ...state, selectedTerritoryId: action.payload.territoryId };

    case "SET_SCREEN":
      return { ...state, screen: action.payload.screen };

    case "DISMISS_MESSAGE":
      return { ...state, message: null };

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
      const pid = activePlayerId(state);
      const { fromId, toId, unitId, count } = action.payload;
      const from = state.territories[fromId];
      const to = state.territories[toId];
      if (!from || !to || from.owner !== pid || to.owner !== pid) {
        return { ...state, message: "Move between your own territories." };
      }
      const fromDef = getTerritory(fromId);
      if (!fromDef.neighbors.includes(toId)) {
        return { ...state, message: "Territories must be adjacent." };
      }
      if ((from.garrison[unitId] ?? 0) < count || count < 1) {
        return { ...state, message: "Not enough units in garrison." };
      }
      return {
        ...state,
        territories: {
          ...state.territories,
          [fromId]: {
            ...from,
            garrison: {
              ...from.garrison,
              [unitId]: (from.garrison[unitId] ?? 0) - count,
            },
          },
          [toId]: {
            ...to,
            garrison: {
              ...to.garrison,
              [unitId]: (to.garrison[unitId] ?? 0) + count,
            },
          },
        },
      };
    }

    case "START_INVASION": {
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
      // Draw from local garrison (not global reserves)
      const garrison = { ...from.garrison };
      for (const slot of force) {
        if ((garrison[slot.unitId] ?? 0) < slot.count) {
          return { ...state, message: "Not enough units in local garrison." };
        }
        garrison[slot.unitId] = (garrison[slot.unitId] ?? 0) - slot.count;
      }
      const battle = createBattle(
        {
          ...state,
          territories: {
            ...state.territories,
            [fromId]: { ...from, garrison },
          },
        },
        toId,
        pid,
        force,
      );
      return {
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
        territories: {
          ...state.territories,
          [fromId]: { ...from, garrison },
        },
        battle,
        phase: "battle",
        screen: "battle",
        message: `Strike force inbound to ${getTerritory(toId).name}.`,
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

      // Campaigning spend + population growth for the player ending their turn
      {
        const player = cur.players[pid]!;
        const { player: afterSpend, spent } = spendCampaignBudget(player);
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

      let idx = (cur.activePlayerIndex + 1) % cur.playerOrder.length;
      let turn = cur.turn;
      if (idx === 0) turn += 1;
      let next: GameState = {
        ...cur,
        activePlayerIndex: idx,
        turn,
        selectedTerritoryId: null,
        screen: "map",
        aiAttackPlans: idx === 0 ? [] : cur.aiAttackPlans,
      };
      const nextPid = next.playerOrder[idx]!;
      next = applyEconomyTick(next, nextPid);
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
