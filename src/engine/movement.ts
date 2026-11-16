/**
 * Strategic troop movement between territories.
 * Travel turns = ceil(distance / (slowestUnitSpeed * pxPerSpeedPerTurn)),
 * with sea-link multiplier. Group moves at the slowest unit's pace.
 */

import { GAME_LOOP } from "../data/gameLoop";
import { SEA_ROUTES } from "../data/map/earthPaths";
import { getTerritory } from "../data/map/territories";
import { getUnit } from "../data/units";
import { createBattle } from "./combat";
import { travelBiomeMult } from "./combatMods";
import {
  mergeIntoGarrison,
  normalizeForce,
  takeFromGarrison,
} from "./garrisonHp";
import { findRoute } from "./pathfinding";
import { applySquadArrival } from "./squads";
import type {
  ArmyTransit,
  GameState,
  Squad,
  StrikeForceSlot,
  TerritoryState,
} from "./state";

function labelDist(a: string, b: string): number {
  const ta = getTerritory(a);
  const tb = getTerritory(b);
  return Math.hypot(ta.label.x - tb.label.x, ta.label.y - tb.label.y);
}

/** Sea route between two territories (symmetric). */
export function isSeaLink(fromId: string, toId: string): boolean {
  const a = getTerritory(fromId);
  const b = getTerritory(toId);
  if (!a.neighbors.includes(toId)) return false;
  if (a.coastal && b.coastal) {
    const d = labelDist(fromId, toId);
    if (d >= GAME_LOOP.movement.seaLinkMinPx) return true;
  }
  for (const route of SEA_ROUTES) {
    const m = /M\s*([\d.]+),([\d.]+).*?([\d.]+),([\d.]+)\s*$/.exec(route.d);
    if (!m) continue;
    const x1 = Number(m[1]);
    const y1 = Number(m[2]);
    const x2 = Number(m[3]);
    const y2 = Number(m[4]);
    const d1 =
      Math.hypot(a.label.x - x1, a.label.y - y1) +
      Math.hypot(b.label.x - x2, b.label.y - y2);
    const d2 =
      Math.hypot(a.label.x - x2, a.label.y - y2) +
      Math.hypot(b.label.x - x1, b.label.y - y1);
    if (Math.min(d1, d2) < 8) return true;
  }
  return false;
}

/** Units that airlift mixed forces — raise march pace toward transport speed. */
const AIRLIFT_IDS = new Set([
  "dropship",
  "assault_dropship",
  "airlift_dropship",
]);

export function slowestSpeed(force: StrikeForceSlot[]): number {
  let slow = Infinity;
  let airlift = 0;
  for (const slot of force) {
    if (slot.count <= 0) continue;
    try {
      const u = getUnit(slot.unitId);
      slow = Math.min(slow, u.speed);
      if (AIRLIFT_IDS.has(u.id)) {
        airlift = Math.max(airlift, u.speed);
      }
    } catch {
      slow = Math.min(slow, 1);
    }
  }
  if (!Number.isFinite(slow)) return 1;
  // Escorting transports pull the column toward their cruise speed.
  if (airlift > 0) return Math.max(slow, airlift * 0.88);
  return slow;
}

/** Classify a force for movement layer rules. */
export function forceMoveLayer(
  force: StrikeForceSlot[],
): "naval" | "air" | "ground" {
  let naval = 0;
  let air = 0;
  let other = 0;
  for (const slot of force) {
    if (slot.count <= 0) continue;
    try {
      const role = getUnit(slot.unitId).role;
      if (role === "naval") naval += slot.count;
      else if (role === "air" || AIRLIFT_IDS.has(slot.unitId)) air += slot.count;
      else other += slot.count;
    } catch {
      other += slot.count;
    }
  }
  const total = naval + air + other;
  if (total <= 0) return "ground";
  if (naval === total) return "naval";
  if (air === total) return "air";
  return "ground";
}

/** Air / dropship jump range in SVG px (speed-scaled). */
export function airJumpRangePx(force: StrikeForceSlot[]): number {
  const speed = Math.max(0.8, slowestSpeed(force));
  return speed * GAME_LOOP.movement.pxPerSpeedPerTurn * 2.4;
}

export function canAirJump(fromId: string, toId: string, force: StrikeForceSlot[]): boolean {
  return labelDist(fromId, toId) <= airJumpRangePx(force) + 0.01;
}

/** Turns required to march from → to with this force. */
export function travelTurns(
  fromId: string,
  toId: string,
  force: StrikeForceSlot[],
  territories?: Record<string, TerritoryState>,
): number {
  const layer = forceMoveLayer(force);
  const dist = labelDist(fromId, toId);
  const speed = Math.max(0.35, slowestSpeed(force));
  let turns = Math.ceil(
    dist / (speed * GAME_LOOP.movement.pxPerSpeedPerTurn),
  );
  if (layer === "air") {
    // Air jumps resolve faster — typically 1 turn within range.
    turns = Math.min(turns, 2);
    turns = Math.max(1, Math.ceil(turns * 0.65));
  } else if (isSeaLink(fromId, toId)) {
    turns = Math.ceil(turns * GAME_LOOP.movement.seaMultiplier);
    const debris =
      (territories?.[fromId]?.debrisTurns ?? 0) > 0 ||
      (territories?.[toId]?.debrisTurns ?? 0) > 0;
    if (debris) turns += 1;
  }
  turns = Math.ceil(turns * travelBiomeMult(toId));
  return Math.max(1, Math.min(GAME_LOOP.movement.maxTurns, turns));
}

export function canOrderMove(
  state: GameState,
  playerId: string,
  fromId: string,
  toId: string,
  force: StrikeForceSlot[],
): { ok: true } | { ok: false; reason: string } {
  const from = state.territories[fromId];
  if (!from || from.owner !== playerId) {
    return { ok: false, reason: "Origin must be yours." };
  }
  const to = state.territories[toId];
  if (!to) return { ok: false, reason: "Unknown destination." };
  if (!force.length || force.every((f) => f.count <= 0)) {
    return { ok: false, reason: "Select units to move." };
  }
  for (const slot of force) {
    if ((from.garrison[slot.unitId] ?? 0) < slot.count) {
      return { ok: false, reason: "Not enough units in garrison." };
    }
  }
  const layer = forceMoveLayer(force);
  const def = getTerritory(fromId);
  if (layer === "naval") {
    if (!isSeaLink(fromId, toId)) {
      return { ok: false, reason: "Naval units need a sea lane / coast." };
    }
  } else if (layer === "air") {
    if (!canAirJump(fromId, toId, force) && !def.neighbors.includes(toId)) {
      return { ok: false, reason: "Air destination out of jump range." };
    }
  } else if (!def.neighbors.includes(toId)) {
    return { ok: false, reason: "Destination must be adjacent." };
  }
  return { ok: true };
}

export interface StartArmyMoveOpts {
  pathRemaining?: string[];
  squadId?: string;
  joiningSquadId?: string;
}

/** Deduct garrison and enqueue a transit army. */
export function startArmyMove(
  state: GameState,
  playerId: string,
  fromId: string,
  toId: string,
  force: StrikeForceSlot[],
  opts: StartArmyMoveOpts = {},
): GameState {
  const check = canOrderMove(state, playerId, fromId, toId, force);
  if (!check.ok) return { ...state, message: check.reason };

  let from = state.territories[fromId]!;
  const taken: StrikeForceSlot[] = [];
  for (const slot of force.filter((f) => f.count > 0)) {
    const pulled = takeFromGarrison(from, slot.unitId, slot.count);
    if (!pulled) {
      return { ...state, message: "Not enough units in garrison." };
    }
    from = pulled.territory;
    taken.push({ unitId: slot.unitId, count: slot.count, hps: pulled.hps });
  }
  const marchForce = normalizeForce(taken);
  const turns = travelTurns(fromId, toId, marchForce, state.territories);
  const army: ArmyTransit = {
    id: `army_${state.nextInstanceId}`,
    owner: playerId as ArmyTransit["owner"],
    fromId,
    toId,
    force: marchForce,
    turnsRemaining: turns,
    totalTurns: turns,
    pathRemaining: opts.pathRemaining?.length
      ? [...opts.pathRemaining]
      : undefined,
    squadId: opts.squadId,
    joiningSquadId: opts.joiningSquadId,
  };

  return {
    ...state,
    nextInstanceId: state.nextInstanceId + 1,
    territories: {
      ...state.territories,
      [fromId]: { ...from, movedThisTurn: true },
    },
    armiesInTransit: [...(state.armiesInTransit ?? []), army],
    message: `Army en route to ${getTerritory(toId).name} · ETA ${turns} turn${turns === 1 ? "" : "s"}.`,
  };
}

/**
 * Tick armies for the player whose turn is starting.
 * Friendly arrivals merge into garrison (or squad); enemy arrivals open a battle.
 * Join columns re-route toward their squad each hop.
 */
export function tickArmiesForPlayer(
  state: GameState,
  playerId: string,
): GameState {
  const armies = [...(state.armiesInTransit ?? [])];
  const remaining: ArmyTransit[] = [];
  let territories: Record<string, TerritoryState> = {
    ...state.territories,
  };
  let squads: Squad[] = [...(state.squads ?? [])];
  const log = [...(state.turnLog ?? [])];
  let battle: ReturnType<typeof createBattle> | null = null;
  let battleMessage: string | null = null;
  let engagedSquadId: string | null = null;

  for (const army of armies) {
    if (army.owner !== playerId) {
      remaining.push(army);
      continue;
    }
    if (battle) {
      remaining.push(army);
      continue;
    }
    const left = army.turnsRemaining - 1;
    if (left > 0) {
      remaining.push({ ...army, turnsRemaining: left });
      continue;
    }
    const dest = territories[army.toId];
    if (!dest) continue;

    // Multi-hop continue
    if (dest.owner === playerId) {
      let rest = [...(army.pathRemaining ?? [])];

      // Join columns: re-aim at live squad destination before next hop
      if (army.joiningSquadId) {
        const squad = squads.find((s) => s.id === army.joiningSquadId);
        if (!squad) {
          territories = {
            ...territories,
            [army.toId]: mergeIntoGarrison(dest, army.force),
          };
          log.push(
            `Joiners settled in ${getTerritory(army.toId).name} (squad gone).`,
          );
          continue;
        }
        const liveTarget =
          squad.status === "marching" && squad.transitId
            ? (() => {
                const t =
                  remaining.find((a) => a.id === squad.transitId) ||
                  armies.find((a) => a.id === squad.transitId);
                if (!t) return squad.territoryId;
                const pr = t.pathRemaining ?? [];
                return pr.length ? pr[pr.length - 1]! : t.toId;
              })()
            : squad.territoryId;
        if (liveTarget === army.toId) {
          const arrived = applySquadArrival(
            { ...state, territories, squads, armiesInTransit: remaining },
            { ...army, turnsRemaining: 0 },
            territories,
            squads,
            log,
          );
          if (arrived.consumed) {
            territories = arrived.territories;
            squads = arrived.squads;
            log.length = 0;
            log.push(...arrived.log);
            continue;
          }
        }
        if (liveTarget !== army.toId) {
          const route = findRoute(army.toId, liveTarget, army.force, {
            avoidEnemy: true,
            owner: playerId,
            territories,
          });
          if (route && route.path.length >= 2) {
            rest = route.path.slice(1);
          }
        }
      }

      if (rest.length > 0) {
        const nextHop = rest[0]!;
        const turns = travelTurns(army.toId, nextHop, army.force, territories);
        remaining.push({
          ...army,
          fromId: army.toId,
          toId: nextHop,
          turnsRemaining: turns,
          totalTurns: turns,
          pathRemaining: rest.slice(1),
        });
        // Keep squad.territoryId as last occupied hop while marching
        if (army.squadId) {
          squads = squads.map((s) =>
            s.id === army.squadId
              ? { ...s, territoryId: army.toId, transitId: army.id, status: "marching" }
              : s,
          );
        }
        log.push(
          `Column continues ${getTerritory(army.toId).name} → ${getTerritory(nextHop).name}.`,
        );
        continue;
      }

      // Final friendly arrival
      const arrived = applySquadArrival(
        { ...state, territories, squads, armiesInTransit: remaining },
        army,
        territories,
        squads,
        log,
      );
      if (arrived.consumed) {
        territories = arrived.territories;
        squads = arrived.squads;
        log.length = 0;
        log.push(...arrived.log);
        continue;
      }
      // Plain reinforce (no squad tags)
      territories = {
        ...territories,
        [army.toId]: mergeIntoGarrison(dest, army.force),
      };
      log.push(`Reinforcements arrived in ${getTerritory(army.toId).name}.`);
      continue;
    }

    // Enemy / neutral — battle (squad or raw column)
    const snap: GameState = { ...state, territories, squads };
    battle = createBattle(snap, army.toId, playerId, army.force, army.fromId);
    battleMessage = `Arriving army engages in ${getTerritory(army.toId).name}.`;
    log.push(`Arrival battle · ${getTerritory(army.toId).name}.`);
    if (army.squadId) {
      engagedSquadId = army.squadId;
      squads = squads.map((s) =>
        s.id === army.squadId
          ? { ...s, status: "engaged", transitId: undefined, force: [] }
          : s,
      );
    }
  }

  if (battle) {
    return {
      ...state,
      territories,
      squads,
      armiesInTransit: remaining,
      turnLog: log,
      battle,
      phase: "battle",
      screen: "battle",
      message: battleMessage,
      selectedSquadId: engagedSquadId ?? state.selectedSquadId,
    };
  }
  return {
    ...state,
    territories,
    squads,
    armiesInTransit: remaining,
    turnLog: log,
  };
}
