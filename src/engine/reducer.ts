import { getBuilding } from "../data/buildings";
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
import { createInitialState } from "./init";
import { canPlaceBuilding } from "./placement";
import { applyResearch, isUnlocked } from "./research";
import type { GameState } from "./state";

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
      const pid = activePlayerId(state);
      const player = state.players[pid]!;
      const { unitId, count } = action.payload;
      if (count < 1) return state;
      if (!isUnlocked(player, unitId)) {
        return { ...state, message: "Unit locked — research required." };
      }
      const def = getUnit(unitId);
      const totalCost = {
        energy: def.cost.energy * count,
        alloy: (def.cost.alloy ?? 0) * count,
        supply: (def.cost.supply ?? 0) * count,
      };
      if (!canAfford(player, totalCost)) {
        return { ...state, message: "Insufficient resources." };
      }
      const spent = spend(player, totalCost);
      return {
        ...state,
        players: {
          ...state.players,
          [pid]: {
            ...spent,
            reserves: {
              ...spent.reserves,
              [unitId]: (spent.reserves[unitId] ?? 0) + count,
            },
          },
        },
        message: `Recruited ${count}× ${def.name}.`,
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
      const reserves = { ...player.reserves };
      for (const slot of force) {
        if ((reserves[slot.unitId] ?? 0) < slot.count) {
          return { ...state, message: "Not enough units in reserve." };
        }
        reserves[slot.unitId] = (reserves[slot.unitId] ?? 0) - slot.count;
      }
      const battle = createBattle(state, toId, pid, force);
      return {
        ...state,
        players: {
          ...state.players,
          [pid]: {
            ...player,
            reserves,
            resources: {
              ...player.resources,
              supply: player.resources.supply - supplyNeed,
            },
          },
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
      let idx = (state.activePlayerIndex + 1) % state.playerOrder.length;
      let turn = state.turn;
      if (idx === 0) turn += 1;
      let next: GameState = {
        ...state,
        activePlayerIndex: idx,
        turn,
        selectedTerritoryId: null,
        screen: "map",
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

export function createMenuState(): GameState {
  return {
    ...createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 1,
    }),
    screen: "menu",
    message: null,
  };
}
