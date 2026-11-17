import {
  AI_DOCTRINE_BY_FACTION,
  getDoctrine,
  type DoctrineId,
} from "../data/doctrines";
import { createDefaultRelations } from "../data/diplomacy";
import { AI_FACTIONS, FACTION_NAMES } from "../data/factions";
import { GAME_LOOP } from "../data/gameLoop";
import { activateMap, activeMapId } from "../data/maps/activate";
import type { MapId } from "../data/maps/types";
import { TERRITORIES } from "../data/map/territories";
import type { FactionId, TerritoryDef } from "../data/types";
import type { NewGamePayload } from "./actions";
import { makeNeutralTerritory } from "./neutrals";
import { mulberry32, shuffleInPlace } from "./rng";
import type { GameState, PlayerState, TerritoryState } from "./state";
import { emptyResources } from "./state";

/** Difficulty only scales AI budgets + bonus techs — no flat human tech dump. */
const DIFFICULTY = {
  easy: {
    energy: 400,
    alloy: 90,
    research: 14,
    supply: 50,
    techBonus: [] as string[],
  },
  normal: {
    energy: 460,
    alloy: 115,
    research: 22,
    supply: 65,
    techBonus: [] as string[],
  },
  hard: {
    energy: 540,
    alloy: 145,
    research: 36,
    supply: 85,
    techBonus: ["plasma_doctrine", "nano_industry"] as string[],
  },
} as const;

function makePlayer(
  id: FactionId,
  kind: "human" | "ai",
  displayName: string,
  difficulty: "easy" | "normal" | "hard" = "normal",
  doctrineId: DoctrineId = "vanguard",
): PlayerState {
  const diff = DIFFICULTY[difficulty];
  const doctrine = getDoctrine(doctrineId);
  const researched = [
    ...new Set([
      ...doctrine.openingTech,
      ...(kind === "ai" ? diff.techBonus : []),
    ]),
  ];
  return {
    id,
    kind,
    displayName,
    resources: {
      ...emptyResources(),
      energy: kind === "human" ? 520 : diff.energy,
      alloy: kind === "human" ? 140 : diff.alloy,
      research: kind === "human" ? 30 : diff.research,
      supply: kind === "human" ? 80 : diff.supply,
    },
    researched,
    researchJob: null,
    reserves: {},
    campaignBudget:
      kind === "human"
        ? GAME_LOOP.campaigning.defaultBudget
        : GAME_LOOP.campaigning.aiDefaultBudget,
    insolvent: false,
    eliminated: false,
    doctrineId,
    commanders: [],
    strikeCooldowns: {},
    recon: [],
    armyTemplates: [],
  };
}

function starterBuildings(
  nextId: { n: number },
  owner: FactionId,
): TerritoryState["buildings"] {
  const shift = owner === "player" ? 0 : owner === "faction_a" ? 1 : 0;
  const row = shift % 2;
  return [
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "command_nexus",
      x: 2,
      y: 1 + row,
      hp: 900,
      buildRemaining: 0,
      workers: 1,
    },
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "reactor",
      x: 0,
      y: 0,
      hp: 240,
      buildRemaining: 0,
      workers: 2,
    },
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "reactor",
      x: 1,
      y: 0,
      hp: 240,
      buildRemaining: 0,
      workers: 2,
    },
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "refinery",
      x: 0,
      y: 2,
      hp: 220,
      buildRemaining: 0,
      workers: 2,
    },
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "supply_depot",
      x: 2,
      y: 4,
      hp: 200,
      buildRemaining: 0,
      workers: 2,
    },
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "laser_turret",
      x: 4,
      y: 0,
      hp: 260,
      buildRemaining: 0,
      workers: 1,
    },
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "barracks",
      x: 4,
      y: 2,
      hp: 260,
      buildRemaining: 0,
      workers: 0,
    },
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "shield_wall",
      x: 4,
      y: 4,
      hp: 480,
      buildRemaining: 0,
      workers: 0,
    },
  ];
}

/** BFS hop distance on the live territory graph. */
export function territoryGraphDistance(fromId: string, toId: string): number {
  if (fromId === toId) return 0;
  const byId = new Map(TERRITORIES.map((t) => [t.id, t]));
  const q: string[] = [fromId];
  const dist = new Map<string, number>([[fromId, 0]]);
  while (q.length) {
    const cur = q.shift()!;
    const d = dist.get(cur)!;
    const node = byId.get(cur);
    if (!node) continue;
    for (const n of node.neighbors) {
      if (dist.has(n)) continue;
      if (n === toId) return d + 1;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
  return 999;
}

/** Prefer connected, non-tiny land for opening positions. */
export function viableStartTerritories(): TerritoryDef[] {
  const areas = TERRITORIES.map((t) => t.area).sort((a, b) => a - b);
  const median = areas[Math.floor(areas.length / 2)] ?? 0.01;
  const minArea = Math.max(median * 0.35, 0.004);
  return TERRITORIES.filter(
    (t) => t.neighbors.length >= 2 && t.area >= minArea,
  );
}

/**
 * One territory per faction, spread by graph distance, preferring viable land.
 * Remaining territories stay Neutral.
 */
export function assignOneStartEach(
  factionIds: FactionId[],
  seed: number,
): Record<FactionId, string> {
  const rand = mulberry32(seed ^ 0x51ed2a01);
  const pool = shuffleInPlace([...viableStartTerritories()], rand);
  // Prefer larger first when scores tie
  pool.sort((a, b) => b.area - a.area + (rand() - 0.5) * 0.002);

  const minDist = Math.max(
    GAME_LOOP.neutrals.minStartDistance,
    Math.floor(Math.sqrt(TERRITORIES.length / Math.max(1, factionIds.length))),
  );

  const picks: string[] = [];
  for (let attempt = 0; attempt < 4 && picks.length < factionIds.length; attempt++) {
    const need = minDist - attempt;
    picks.length = 0;
    const order = shuffleInPlace([...pool], rand);
    for (const cand of order) {
      if (picks.length >= factionIds.length) break;
      const ok = picks.every(
        (p) => territoryGraphDistance(p, cand.id) >= need,
      );
      if (ok) picks.push(cand.id);
    }
  }
  // Fallback: fill remaining with farthest available
  if (picks.length < factionIds.length) {
    const used = new Set(picks);
    for (const cand of pool) {
      if (picks.length >= factionIds.length) break;
      if (used.has(cand.id)) continue;
      let bestMin = -1;
      let bestId = cand.id;
      for (const c of pool) {
        if (used.has(c.id)) continue;
        const m = picks.length
          ? Math.min(...picks.map((p) => territoryGraphDistance(p, c.id)))
          : 99;
        if (m > bestMin) {
          bestMin = m;
          bestId = c.id;
        }
      }
      used.add(bestId);
      picks.push(bestId);
    }
  }

  const out = {} as Record<FactionId, string>;
  factionIds.forEach((fid, i) => {
    out[fid] = picks[i] ?? pool[i % pool.length]!.id;
  });
  return out;
}

/** @deprecated Prefer assignOneStartEach — kept for tests that still deal bags. */
export function assignTerritoriesBalanced(
  factionIds: FactionId[],
  seed: number,
): Record<FactionId, string[]> {
  const starts = assignOneStartEach(factionIds, seed);
  const bags = {} as Record<FactionId, string[]>;
  for (const f of factionIds) bags[f] = [starts[f]!];
  return bags;
}

export function createInitialState(payload: NewGamePayload): GameState {
  const mapId = (payload.mapId ?? "world_war") as MapId;
  activateMap(mapId);

  const seed = payload.seed ?? Date.now() % 1_000_000;
  const humanCount = Math.max(1, Math.min(4, payload.humanCount));
  const aiCount = Math.max(0, Math.min(3, payload.aiCount));
  const difficulty = payload.difficulty ?? "normal";

  const humanFactionPool: FactionId[] = [
    "player",
    "faction_a",
    "faction_b",
    "faction_c",
  ];
  const humans =
    payload.humanFactions?.slice(0, humanCount) ??
    humanFactionPool.slice(0, humanCount);

  const used = new Set<FactionId>(humans);
  const ais: FactionId[] = [];
  for (const id of AI_FACTIONS) {
    if (ais.length >= aiCount) break;
    if (!used.has(id)) {
      ais.push(id);
      used.add(id);
    }
  }

  const players: Record<string, PlayerState> = {};
  humans.forEach((id, i) => {
    const name =
      payload.humanNames?.[i] ??
      (humanCount === 1 ? FACTION_NAMES.player : `Player ${i + 1}`);
    const doctrineId: DoctrineId =
      payload.humanDoctrines?.[i] ??
      payload.doctrineId ??
      "vanguard";
    players[id] = makePlayer(id, "human", name, difficulty, doctrineId);
  });
  ais.forEach((id) => {
    const doctrineId =
      AI_DOCTRINE_BY_FACTION[id] ?? ("ironclad" as DoctrineId);
    players[id] = makePlayer(
      id,
      "ai",
      FACTION_NAMES[id],
      difficulty,
      doctrineId,
    );
  });

  const playerOrder = [...humans, ...ais];
  const nextId = { n: 1 };
  const starts = assignOneStartEach(playerOrder, seed);
  const startSet = new Set(Object.values(starts));

  const territories: Record<string, TerritoryState> = {};
  for (const fid of playerOrder) {
    const tid = starts[fid]!;
    const doctrine = getDoctrine(players[fid]?.doctrineId);
    const garrison: Record<string, number> = {
      trooper: fid === humans[0] ? 6 : 5,
      assault_mech: 1,
    };
    for (const [uid, n] of Object.entries(doctrine.openingGarrison ?? {})) {
      garrison[uid] = (garrison[uid] ?? 0) + n;
    }
    territories[tid] = {
      owner: fid,
      buildings: starterBuildings(nextId, fid),
      supplyStock: 28,
      population:
        GAME_LOOP.startingPopulation + GAME_LOOP.startingPopBonus + 4,
      // Staff nexus + dual reactors + refinery + depot + turret (10) with spare.
      workers: 12,
      garrison,
      garrisonHp: {},
      trainingQueue: [],
      control: "core",
      occupiedTurns: 0,
      movedThisTurn: false,
    };
  }

  for (const t of TERRITORIES) {
    if (startSet.has(t.id)) continue;
    territories[t.id] = makeNeutralTerritory(t, nextId);
  }

  const firstHumanTerritory = starts[humans[0]!] ?? null;

  return {
    version: 1,
    seed,
    mapId: activeMapId(),
    turn: 1,
    phase: "play",
    activePlayerIndex: 0,
    playerOrder,
    players,
    territories,
    battle: null,
    selectedTerritoryId: firstHumanTerritory,
    screen: "map",
    multiplayerMode: payload.multiplayerMode,
    winner: null,
    message:
      "One homeland each — the rest is Neutral. Expand, then dominate.",
    nextInstanceId: nextId.n,
    aiAttackPlans: [],
    armiesInTransit: [],
    squads: [],
    selectedSquadId: null,
    pendingCapture: null,
    turnLog: [],
    relations: createDefaultRelations(playerOrder),
    newsFeed: [],
    newsUnread: 0,
    newsDigest: null,
    difficulty,
    turnLimit: payload.turnLimit ?? 0,
    victoryPointsEnabled: payload.victoryPointsEnabled ?? false,
    economySummary: null,
    plannedRoute: null,
    strikeFx: [],
    theaterEvents: [],
    handoff: null,
    strikeTargeting: null,
  };
}

export function createMenuState(): GameState {
  return {
    ...createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 1,
      mapId: "world_war",
    }),
    screen: "menu",
    message: null,
  };
}
