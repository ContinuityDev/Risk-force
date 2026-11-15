import { createDefaultRelations } from "../data/diplomacy";
import { AI_FACTIONS, FACTION_NAMES } from "../data/factions";
import { GAME_LOOP } from "../data/gameLoop";
import { TERRITORIES } from "../data/map/territories";
import type { FactionId } from "../data/types";
import type { NewGamePayload } from "./actions";
import { mulberry32, shuffleInPlace } from "./rng";
import type { GameState, PlayerState, TerritoryState } from "./state";
import { emptyResources } from "./state";

function makePlayer(
  id: FactionId,
  kind: "human" | "ai",
  displayName: string,
): PlayerState {
  return {
    id,
    kind,
    displayName,
    resources: {
      ...emptyResources(),
      energy: kind === "human" ? 520 : 480,
      alloy: kind === "human" ? 140 : 120,
      research: kind === "human" ? 30 : 24,
      supply: kind === "human" ? 80 : 70,
    },
    researched:
      kind === "human"
        ? [
            "infantry_doctrine",
            "mech_corps",
            "grav_armor",
            "nano_industry",
            "drone_swarm",
            "plasma_doctrine",
            "siege_protocols",
          ]
        : ["infantry_doctrine", "mech_corps"],
    researchJob: null,
    reserves: {},
    campaignBudget:
      kind === "human"
        ? GAME_LOOP.campaigning.defaultBudget
        : GAME_LOOP.campaigning.aiDefaultBudget,
    insolvent: false,
    eliminated: false,
  };
}

function starterBuildings(
  nextId: { n: number },
  owner: FactionId,
): TerritoryState["buildings"] {
  const shift = owner === "player" ? 0 : owner === "faction_a" ? 1 : 0;
  const row = shift % 2;
  // Lean starter base: one reactor + refinery + depot staffed, light defenses.
  // Keeps turn-1 energy near break-even and supply from collapsing.
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

/**
 * Balanced random territory deal: shuffle territories with seeded RNG,
 * deal round-robin so counts differ by at most 1.
 */
export function assignTerritoriesBalanced(
  factionIds: FactionId[],
  seed: number,
): Record<FactionId, string[]> {
  const rand = mulberry32(seed ^ 0x7f4a7c15);
  const ids = shuffleInPlace(
    TERRITORIES.map((t) => t.id),
    rand,
  );
  const bags: Record<string, string[]> = {};
  for (const f of factionIds) bags[f] = [];
  ids.forEach((tid, i) => {
    const f = factionIds[i % factionIds.length]!;
    bags[f]!.push(tid);
  });
  return bags as Record<FactionId, string[]>;
}

export function createInitialState(payload: NewGamePayload): GameState {
  const seed = payload.seed ?? Date.now() % 1_000_000;
  const humanCount = Math.max(1, Math.min(4, payload.humanCount));
  const aiCount = Math.max(0, Math.min(3, payload.aiCount));

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
    players[id] = makePlayer(id, "human", name);
  });
  ais.forEach((id) => {
    players[id] = makePlayer(id, "ai", FACTION_NAMES[id]);
  });

  const playerOrder = [...humans, ...ais];
  const nextId = { n: 1 };
  const deal = assignTerritoriesBalanced(playerOrder, seed);

  const territories: Record<string, TerritoryState> = {};
  for (const fid of playerOrder) {
    const bag = deal[fid] ?? [];
    // Largest territories get a pop bonus
    const ranked = [...bag].sort((a, b) => {
      const ta = TERRITORIES.find((t) => t.id === a)!;
      const tb = TERRITORIES.find((t) => t.id === b)!;
      return tb.area - ta.area;
    });
    bag.forEach((tid) => {
      // Fewer cores → less early upkeep; expand to grow income + logistics load.
      const isCore = ranked.indexOf(tid) < Math.max(1, Math.ceil(bag.length * 0.18));
      territories[tid] = {
        owner: fid,
        buildings: isCore ? starterBuildings(nextId, fid) : [],
        supplyStock: isCore ? 24 : 6,
        population:
          GAME_LOOP.startingPopulation +
          (isCore ? GAME_LOOP.startingPopBonus : 0),
        // Core workers cover starter staffing (nexus1+reactor2+refinery2+depot2+turret1).
        workers: isCore ? 10 : 1,
        garrison: isCore
          ? {
              trooper: fid === humans[0] ? 5 : 4,
              assault_mech: 1,
              hover_tank: 1,
            }
          : { trooper: 1 },
        garrisonHp: {},
        trainingQueue: [],
        control: "core",
        occupiedTurns: 0,
        movedThisTurn: false,
      };
    });
  }

  // Safety: any territory missed (shouldn't happen)
  for (const t of TERRITORIES) {
    if (!territories[t.id]) {
      const owner = playerOrder[0]!;
      territories[t.id] = {
        owner,
        buildings: [],
        supplyStock: 5,
        population: GAME_LOOP.startingPopulation,
        workers: 1,
        garrison: { trooper: 1 },
        garrisonHp: {},
        trainingQueue: [],
        control: "core",
        occupiedTurns: 0,
        movedThisTurn: false,
      };
    }
  }

  const firstHumanTerritory =
    Object.entries(territories).find(([, ts]) => ts.owner === humans[0])?.[0] ??
    null;

  return {
    version: 1,
    seed,
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
    message: `Theater seeded (${seed}). Campaigning drives recruitment — land alone is not enough.`,
    nextInstanceId: nextId.n,
    aiAttackPlans: [],
    armiesInTransit: [],
    pendingCapture: null,
    turnLog: [],
    relations: createDefaultRelations(playerOrder),
    newsFeed: [],
    newsUnread: 0,
    newsDigest: null,
  };
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
