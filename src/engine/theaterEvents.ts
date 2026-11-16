/**
 * Theater events — random headlines each turn with real mechanical effects.
 */

import { TERRITORIES } from "../data/map/territories";
import type { FactionId } from "../data/types";
import { mulberry32 } from "./rng";
import type { GameState, TheaterEvent } from "./state";
import { makeNewsItem } from "./news";

export type TheaterEventKind =
  | "solar_flare"
  | "refugee_wave"
  | "debris_field"
  | "black_market";

interface EventDef {
  kind: TheaterEventKind;
  headline: string;
  body: (where: string) => string;
  apply: (state: GameState, tid: string, owner: FactionId) => GameState;
}

const EVENTS: EventDef[] = [
  {
    kind: "solar_flare",
    headline: "Solar flare scrambles uplinks",
    body: (w) =>
      `Geomagnetic storm over ${w} — orbital assets offline, research paused locally.`,
    apply: (state, tid) => {
      const ts = state.territories[tid]!;
      // Damage orbital buildings lightly + cut supply stock
      return {
        ...state,
        territories: {
          ...state.territories,
          [tid]: {
            ...ts,
            supplyStock: Math.max(0, Math.floor(ts.supplyStock * 0.7)),
            supplyCutTurns: Math.max(ts.supplyCutTurns ?? 0, 1),
            buildings: ts.buildings.map((b) =>
              b.buildingId.includes("uplink") ||
              b.buildingId.includes("orbital") ||
              b.buildingId === "silo_pad"
                ? { ...b, hp: Math.max(1, Math.floor(b.hp * 0.85)) }
                : b,
            ),
          },
        },
      };
    },
  },
  {
    kind: "refugee_wave",
    headline: "Refugee wave swells population",
    body: (w) =>
      `Displaced civilians flood ${w} — population up, supply stretched.`,
    apply: (state, tid) => {
      const ts = state.territories[tid]!;
      return {
        ...state,
        territories: {
          ...state.territories,
          [tid]: {
            ...ts,
            population: ts.population + 8,
            supplyStock: Math.max(0, ts.supplyStock - 6),
          },
        },
      };
    },
  },
  {
    kind: "debris_field",
    headline: "Debris field closes sea lane",
    body: (w) =>
      `Orbital scrap rains near ${w} — coastal marches delayed next crossing.`,
    apply: (state, tid) => {
      const ts = state.territories[tid]!;
      return {
        ...state,
        territories: {
          ...state.territories,
          [tid]: {
            ...ts,
            debrisTurns: Math.max(ts.debrisTurns ?? 0, 2),
          },
        },
      };
    },
  },
  {
    kind: "black_market",
    headline: "Black-market cache uncovered",
    body: (w) =>
      `Smugglers dump alloy and supply in ${w} — a windfall for the garrison.`,
    apply: (state, tid, owner) => {
      const ts = state.territories[tid]!;
      const p = state.players[owner]!;
      return {
        ...state,
        players: {
          ...state.players,
          [owner]: {
            ...p,
            resources: {
              ...p.resources,
              alloy: p.resources.alloy + 18,
              supply: p.resources.supply + 14,
              energy: p.resources.energy + 25,
            },
          },
        },
        territories: {
          ...state.territories,
          [tid]: {
            ...ts,
            supplyStock: ts.supplyStock + 10,
          },
        },
      };
    },
  },
];

export function rollTheaterEvent(state: GameState): GameState {
  // One event when a full round completes (active index wraps to 0) — called from END_TURN when idx===0
  const rand = mulberry32((state.seed ^ (state.turn * 2654435761)) >>> 0);
  if (rand() > 0.72) return state; // not every turn
  const owned = Object.entries(state.territories).filter(
    ([, ts]) => ts.owner !== "neutral",
  );
  if (!owned.length) return state;
  const [tid, ts] = owned[Math.floor(rand() * owned.length)]!;
  const def = EVENTS[Math.floor(rand() * EVENTS.length)]!;
  const where = TERRITORIES.find((t) => t.id === tid)?.name ?? tid;
  let next = def.apply(state, tid, ts.owner);
  const evt: TheaterEvent = {
    id: `evt-${state.turn}-${def.kind}`,
    kind: def.kind,
    turn: state.turn,
    territoryId: tid,
    headline: def.headline,
    body: def.body(where),
  };
  const news = makeNewsItem({
    turn: state.turn,
    category: "general",
    factionId: ts.owner,
    headline: def.headline,
    body: def.body(where),
  });
  return {
    ...next,
    theaterEvents: [...(next.theaterEvents ?? []).slice(-20), evt],
    newsFeed: [...(next.newsFeed ?? []), news].slice(-120),
    newsUnread: (next.newsUnread ?? 0) + 1,
  };
}

export function tickDebris(state: GameState, playerId: string): GameState {
  const territories = { ...state.territories };
  let changed = false;
  for (const [tid, ts] of Object.entries(territories)) {
    if (ts.owner !== playerId) continue;
    if ((ts.debrisTurns ?? 0) > 0) {
      territories[tid] = {
        ...ts,
        debrisTurns: Math.max(0, (ts.debrisTurns ?? 0) - 1),
      };
      changed = true;
    }
  }
  return changed ? { ...state, territories } : state;
}
