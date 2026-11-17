/**
 * Named standing forces (squads) that replace the Invade flow.
 * Idle squads sit on a territory; marches use ArmyTransit with squadId /
 * joiningSquadId for attack, reinforce, and cross-territory join-with-follow.
 */

import { getTerritory } from "../data/map/territories";
import type { FactionId } from "../data/types";
import {
  mergeIntoGarrison,
  normalizeForce,
  takeFromGarrison,
} from "./garrisonHp";
import {
  canOrderMove,
  startArmyMove,
  travelTurns,
} from "./movement";
import { findRoute } from "./pathfinding";
import type {
  ArmyTransit,
  GameState,
  Squad,
  StrikeForceSlot,
  TerritoryState,
} from "./state";

export function forceHeadcount(force: StrikeForceSlot[]): number {
  return force.reduce((s, f) => s + Math.max(0, f.count), 0);
}

export function squadStrength(force: StrikeForceSlot[]): number {
  return forceHeadcount(force);
}

function nextSquadName(state: GameState, owner: string): string {
  const n =
    (state.squads ?? []).filter((s) => s.owner === owner).length + 1;
  return `Squad ${n}`;
}

export function getSquad(state: GameState, squadId: string): Squad | null {
  return (state.squads ?? []).find((s) => s.id === squadId) ?? null;
}

export function listPlayerSquads(state: GameState, owner: string): Squad[] {
  return (state.squads ?? []).filter((s) => s.owner === owner);
}

/** Pull force from a territory garrison into a new idle squad. */
export function createSquad(
  state: GameState,
  playerId: string,
  territoryId: string,
  force: StrikeForceSlot[],
  name?: string,
): GameState {
  const ts = state.territories[territoryId];
  if (!ts || ts.owner !== playerId) {
    return { ...state, message: "Create squads on your own land." };
  }
  const want = normalizeForce(force);
  if (!want.length) return { ...state, message: "Pick units for the squad." };

  let nextTs = ts;
  const taken: StrikeForceSlot[] = [];
  for (const slot of want) {
    const pulled = takeFromGarrison(nextTs, slot.unitId, slot.count);
    if (!pulled) {
      return { ...state, message: "Not enough units in garrison." };
    }
    nextTs = pulled.territory;
    taken.push({ unitId: slot.unitId, count: slot.count, hps: pulled.hps });
  }

  const squad: Squad = {
    id: `squad_${state.nextInstanceId}`,
    name: (name?.trim() || nextSquadName(state, playerId)).slice(0, 28),
    owner: playerId as FactionId,
    territoryId,
    force: normalizeForce(taken),
    status: "idle",
  };

  return {
    ...state,
    nextInstanceId: state.nextInstanceId + 1,
    territories: { ...state.territories, [territoryId]: nextTs },
    squads: [...(state.squads ?? []), squad],
    selectedSquadId: squad.id,
    message: `${squad.name} formed in ${getTerritory(territoryId).name}.`,
  };
}

export function renameSquad(
  state: GameState,
  playerId: string,
  squadId: string,
  name: string,
): GameState {
  const trimmed = name.trim().slice(0, 28);
  if (!trimmed) return { ...state, message: "Enter a squad name." };
  const squads = (state.squads ?? []).map((s) =>
    s.id === squadId && s.owner === playerId ? { ...s, name: trimmed } : s,
  );
  return { ...state, squads, message: `Renamed to ${trimmed}.` };
}

/** Merge squad force into local garrison and remove the squad. */
export function disbandSquad(
  state: GameState,
  playerId: string,
  squadId: string,
): GameState {
  const squad = getSquad(state, squadId);
  if (!squad || squad.owner !== playerId) {
    return { ...state, message: "Unknown squad." };
  }
  if (squad.status === "marching") {
    return { ...state, message: "Wait for the squad to arrive before disbanding." };
  }
  const ts = state.territories[squad.territoryId];
  if (!ts || ts.owner !== playerId) {
    return { ...state, message: "Can only disband on owned land." };
  }
  const merged = mergeIntoGarrison(ts, squad.force);
  return {
    ...state,
    territories: { ...state.territories, [squad.territoryId]: merged },
    squads: (state.squads ?? []).filter((s) => s.id !== squadId),
    selectedSquadId:
      state.selectedSquadId === squadId ? null : state.selectedSquadId,
    message: `${squad.name} disbanded into the local garrison.`,
  };
}

/** Merge `fromId` into `intoId` when both idle on the same owned plot. */
export function mergeSquads(
  state: GameState,
  playerId: string,
  intoId: string,
  fromId: string,
): GameState {
  if (intoId === fromId) return state;
  const into = getSquad(state, intoId);
  const from = getSquad(state, fromId);
  if (!into || !from || into.owner !== playerId || from.owner !== playerId) {
    return { ...state, message: "Pick two of your squads." };
  }
  if (into.status !== "idle" || from.status !== "idle") {
    return { ...state, message: "Both squads must be idle to merge." };
  }
  if (into.territoryId !== from.territoryId) {
    return { ...state, message: "Squads must share a territory to merge." };
  }
  const force = normalizeForce([...into.force, ...from.force]);
  // Collapse duplicate unit ids
  const byId = new Map<string, StrikeForceSlot>();
  for (const slot of force) {
    const prev = byId.get(slot.unitId);
    if (!prev) {
      byId.set(slot.unitId, { ...slot });
    } else {
      byId.set(slot.unitId, {
        unitId: slot.unitId,
        count: prev.count + slot.count,
        hps: [...(prev.hps ?? []), ...(slot.hps ?? [])],
      });
    }
  }
  const mergedForce = normalizeForce([...byId.values()]);
  return {
    ...state,
    squads: (state.squads ?? [])
      .filter((s) => s.id !== fromId)
      .map((s) =>
        s.id === intoId ? { ...s, force: mergedForce } : s,
      ),
    selectedSquadId: intoId,
    message: `${from.name} merged into ${into.name}.`,
  };
}

/**
 * Split units out of a squad. `mode: "garrison"` merges into local garrison
 * (owned land only). `mode: "new_squad"` creates a sibling idle squad here.
 */
export function departSquad(
  state: GameState,
  playerId: string,
  squadId: string,
  force: StrikeForceSlot[],
  mode: "garrison" | "new_squad",
  name?: string,
): GameState {
  const squad = getSquad(state, squadId);
  if (!squad || squad.owner !== playerId) {
    return { ...state, message: "Unknown squad." };
  }
  if (squad.status !== "idle") {
    return { ...state, message: "Squad must be idle to depart units." };
  }
  const want = normalizeForce(force);
  if (!want.length) return { ...state, message: "Select units to depart." };

  // Validate availability inside the squad
  const remainingMap = new Map(
    squad.force.map((s) => [s.unitId, { ...s }] as const),
  );
  const taken: StrikeForceSlot[] = [];
  for (const slot of want) {
    const cur = remainingMap.get(slot.unitId);
    if (!cur || cur.count < slot.count) {
      return { ...state, message: "Not enough units in the squad." };
    }
    const hps = (cur.hps ?? []).slice(0, slot.count);
    const leftHps = (cur.hps ?? []).slice(slot.count);
    taken.push({ unitId: slot.unitId, count: slot.count, hps });
    const left = cur.count - slot.count;
    if (left <= 0) remainingMap.delete(slot.unitId);
    else remainingMap.set(slot.unitId, { unitId: slot.unitId, count: left, hps: leftHps });
  }
  const remaining = normalizeForce([...remainingMap.values()]);
  const departed = normalizeForce(taken);

  let territories = state.territories;
  let squads = (state.squads ?? []).map((s) =>
    s.id === squadId ? { ...s, force: remaining } : s,
  );
  let message = "";
  let selectedSquadId = state.selectedSquadId;
  let nextInstanceId = state.nextInstanceId;

  if (mode === "garrison") {
    const ts = territories[squad.territoryId];
    if (!ts || ts.owner !== playerId) {
      return { ...state, message: "Depart into garrison only on owned land." };
    }
    territories = {
      ...territories,
      [squad.territoryId]: mergeIntoGarrison(ts, departed),
    };
    message = `Departed units joined the ${getTerritory(squad.territoryId).name} garrison.`;
  } else {
    const neu: Squad = {
      id: `squad_${nextInstanceId}`,
      name: (name?.trim() || nextSquadName(state, playerId)).slice(0, 28),
      owner: playerId as FactionId,
      territoryId: squad.territoryId,
      force: departed,
      status: "idle",
    };
    nextInstanceId += 1;
    squads = [...squads, neu];
    selectedSquadId = neu.id;
    message = `${neu.name} departed from ${squad.name}.`;
  }

  // Drop empty parent squad
  if (forceHeadcount(remaining) <= 0) {
    squads = squads.filter((s) => s.id !== squadId);
    if (selectedSquadId === squadId) selectedSquadId = null;
  }

  return {
    ...state,
    nextInstanceId,
    territories,
    squads,
    selectedSquadId,
    message,
  };
}

/** March a squad toward a destination (attack enemy/neutral, relocate to owned). */
export function orderSquadMove(
  state: GameState,
  playerId: string,
  squadId: string,
  toId: string,
  path?: string[],
): GameState {
  const squad = getSquad(state, squadId);
  if (!squad || squad.owner !== playerId) {
    return { ...state, message: "Unknown squad." };
  }
  if (squad.status !== "idle") {
    return { ...state, message: "Squad is already on the move." };
  }
  if (squad.territoryId === toId) {
    return { ...state, message: "Squad is already there." };
  }
  const force = normalizeForce(squad.force);
  if (!force.length) return { ...state, message: "Squad has no units." };

  const fromId = squad.territoryId;
  const dest = state.territories[toId];
  if (!dest) return { ...state, message: "Unknown destination." };

  // Resolve path: preferred path, else BFS (allow final enemy hop).
  let routePath = path && path.length >= 2 ? path : null;
  if (!routePath) {
    const route = findRoute(fromId, toId, force, {
      avoidEnemy: dest.owner === playerId,
      owner: playerId,
      territories: state.territories,
    });
    routePath = route?.path ?? null;
  }
  if (!routePath || routePath.length < 2) {
    // Single-hop adjacency fallback
    const check = canOrderMove(
      {
        ...state,
        // Temporarily park force in garrison for canOrderMove checks
        territories: {
          ...state.territories,
          [fromId]: mergeIntoGarrison(
            state.territories[fromId]!,
            force,
          ),
        },
      },
      playerId,
      fromId,
      toId,
      force,
    );
    if (!check.ok) return { ...state, message: check.reason };
    routePath = [fromId, toId];
  }

  const firstTo = routePath[1]!;
  const pathRemaining = routePath.slice(2);

  // Staging: put force into origin garrison briefly so startArmyMove can pull it
  const staged = mergeIntoGarrison(state.territories[fromId]!, force);
  const stagedState: GameState = {
    ...state,
    territories: { ...state.territories, [fromId]: staged },
    squads: (state.squads ?? []).map((s) =>
      s.id === squadId
        ? { ...s, force: [], status: "marching" as const, transitId: undefined }
        : s,
    ),
  };

  const marched = startArmyMove(stagedState, playerId, fromId, firstTo, force, {
    pathRemaining,
    squadId,
  });
  const transit = (marched.armiesInTransit ?? []).find(
    (a) => a.squadId === squadId,
  );
  if (!transit) {
    return { ...state, message: marched.message ?? "Cannot move squad." };
  }

  const enemy = dest.owner !== playerId;
  return {
    ...marched,
    squads: (marched.squads ?? []).map((s) =>
      s.id === squadId
        ? {
            ...s,
            force: [],
            status: "marching",
            transitId: transit.id,
            territoryId: fromId,
          }
        : s,
    ),
    selectedSquadId: squadId,
    plannedRoute: routePath,
    message: enemy
      ? `${squad.name} marching on ${getTerritory(toId).name}.`
      : `${squad.name} relocating to ${getTerritory(toId).name}.`,
  };
}

/**
 * Pull garrison units from `fromId` and march them to join `squadId`.
 * They re-route each turn if the squad moves, merging only on co-location.
 */
export function addUnitsToSquad(
  state: GameState,
  playerId: string,
  squadId: string,
  fromId: string,
  force: StrikeForceSlot[],
): GameState {
  const squad = getSquad(state, squadId);
  if (!squad || squad.owner !== playerId) {
    return { ...state, message: "Unknown squad." };
  }
  const want = normalizeForce(force);
  if (!want.length) return { ...state, message: "Select units to add." };

  const from = state.territories[fromId];
  if (!from || from.owner !== playerId) {
    return { ...state, message: "Draw reinforcements from owned land." };
  }

  // Same territory + idle → instant merge
  if (fromId === squad.territoryId && squad.status === "idle") {
    let nextTs = from;
    const taken: StrikeForceSlot[] = [];
    for (const slot of want) {
      const pulled = takeFromGarrison(nextTs, slot.unitId, slot.count);
      if (!pulled) {
        return { ...state, message: "Not enough units in garrison." };
      }
      nextTs = pulled.territory;
      taken.push({ unitId: slot.unitId, count: slot.count, hps: pulled.hps });
    }
    const merged = normalizeForce([...squad.force, ...taken]);
    const byId = new Map<string, StrikeForceSlot>();
    for (const slot of merged) {
      const prev = byId.get(slot.unitId);
      if (!prev) byId.set(slot.unitId, { ...slot });
      else {
        byId.set(slot.unitId, {
          unitId: slot.unitId,
          count: prev.count + slot.count,
          hps: [...(prev.hps ?? []), ...(slot.hps ?? [])],
        });
      }
    }
    return {
      ...state,
      territories: { ...state.territories, [fromId]: nextTs },
      squads: (state.squads ?? []).map((s) =>
        s.id === squadId
          ? { ...s, force: normalizeForce([...byId.values()]) }
          : s,
      ),
      message: `Units joined ${squad.name}.`,
    };
  }

  const targetId =
    squad.status === "marching"
      ? currentSquadDestination(state, squad) ?? squad.territoryId
      : squad.territoryId;

  const route = findRoute(fromId, targetId, want, {
    avoidEnemy: true,
    owner: playerId,
    territories: state.territories,
  });
  if (!route || route.path.length < 2) {
    return { ...state, message: "No friendly route to the squad." };
  }
  const firstTo = route.path[1]!;
  const marched = startArmyMove(state, playerId, fromId, firstTo, want, {
    pathRemaining: route.path.slice(2),
    joiningSquadId: squadId,
  });
  if (!(marched.armiesInTransit ?? []).some((a) => a.joiningSquadId === squadId)) {
    return { ...state, message: marched.message ?? "Cannot dispatch joiners." };
  }
  return {
    ...marched,
    message: `Reinforcements marching to join ${squad.name}.`,
  };
}

export function currentSquadDestination(
  state: GameState,
  squad: Squad,
): string | null {
  if (squad.status !== "marching" || !squad.transitId) return null;
  const transit = (state.armiesInTransit ?? []).find(
    (a) => a.id === squad.transitId,
  );
  if (!transit) return null;
  const rest = transit.pathRemaining ?? [];
  return rest.length ? rest[rest.length - 1]! : transit.toId;
}

export function currentSquadLocation(
  state: GameState,
  squad: Squad,
): string {
  if (squad.status === "marching" && squad.transitId) {
    const transit = (state.armiesInTransit ?? []).find(
      (a) => a.id === squad.transitId,
    );
    if (transit) return transit.toId;
  }
  return squad.territoryId;
}

/** Merge a joiner force into a squad (must be idle at `atId`). */
export function absorbJoiners(
  state: GameState,
  squadId: string,
  atId: string,
  force: StrikeForceSlot[],
): GameState {
  const squad = getSquad(state, squadId);
  if (!squad) return state;
  if (squad.status !== "idle" || squad.territoryId !== atId) return state;
  const byId = new Map<string, StrikeForceSlot>();
  for (const slot of normalizeForce([...squad.force, ...force])) {
    const prev = byId.get(slot.unitId);
    if (!prev) byId.set(slot.unitId, { ...slot });
    else {
      byId.set(slot.unitId, {
        unitId: slot.unitId,
        count: prev.count + slot.count,
        hps: [...(prev.hps ?? []), ...(slot.hps ?? [])],
      });
    }
  }
  return {
    ...state,
    squads: (state.squads ?? []).map((s) =>
      s.id === squadId
        ? { ...s, force: normalizeForce([...byId.values()]) }
        : s,
    ),
  };
}

/**
 * After each army tick hop, re-aim joiners toward their squad and
 * finalize merges / squad arrivals.
 */
/** @deprecated join re-route lives inside tickArmiesForPlayer now. */
export function syncSquadTransit(
  state: GameState,
  _playerId: string,
): GameState {
  return state;
}

export function applySquadArrival(
  _state: GameState,
  army: ArmyTransit,
  territories: Record<string, TerritoryState>,
  squads: Squad[],
  log: string[],
): {
  territories: Record<string, TerritoryState>;
  squads: Squad[];
  log: string[];
  consumed: boolean;
} {
  // Joiner arrival
  if (army.joiningSquadId) {
    const squad = squads.find((s) => s.id === army.joiningSquadId);
    if (
      squad &&
      squad.status === "idle" &&
      squad.territoryId === army.toId
    ) {
      const byId = new Map<string, StrikeForceSlot>();
      for (const slot of normalizeForce([...squad.force, ...army.force])) {
        const prev = byId.get(slot.unitId);
        if (!prev) byId.set(slot.unitId, { ...slot });
        else {
          byId.set(slot.unitId, {
            unitId: slot.unitId,
            count: prev.count + slot.count,
            hps: [...(prev.hps ?? []), ...(slot.hps ?? [])],
          });
        }
      }
      return {
        territories,
        squads: squads.map((s) =>
          s.id === squad.id
            ? { ...s, force: normalizeForce([...byId.values()]) }
            : s,
        ),
        log: [
          ...log,
          `Reinforcements joined ${squad.name} in ${getTerritory(army.toId).name}.`,
        ],
        consumed: true,
      };
    }
    // Squad not here — keep following (caller should re-queue)
    return { territories, squads, log, consumed: false };
  }

  // Named squad arrival on owned land → park as idle squad
  if (army.squadId) {
    const dest = territories[army.toId];
    if (dest && dest.owner === army.owner) {
      return {
        territories,
        squads: squads.map((s) =>
          s.id === army.squadId
            ? {
                ...s,
                force: normalizeForce(army.force),
                territoryId: army.toId,
                status: "idle",
                transitId: undefined,
              }
            : s,
        ),
        log: [
          ...log,
          `${squads.find((s) => s.id === army.squadId)?.name ?? "Squad"} arrived in ${getTerritory(army.toId).name}.`,
        ],
        consumed: true,
      };
    }
  }

  return { territories, squads, log, consumed: false };
}

export function travelEtaLabel(
  fromId: string,
  toId: string,
  force: StrikeForceSlot[],
  territories?: Record<string, TerritoryState>,
): number {
  const route = findRoute(fromId, toId, force, {
    avoidEnemy: true,
    territories: territories as never,
  });
  if (route) return Math.max(1, route.totalTurns);
  return travelTurns(fromId, toId, force, territories);
}
