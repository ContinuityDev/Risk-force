import { AI_FACTIONS, FACTION_NAMES } from "../data/factions";
import { TERRITORIES } from "../data/map/territories";
import type { FactionId } from "../data/types";
import type { NewGamePayload } from "./actions";
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
      energy: kind === "human" ? 480 : 420,
      alloy: kind === "human" ? 140 : 120,
      research: kind === "human" ? 30 : 24,
      supply: kind === "human" ? 40 : 35,
    },
    // Seed early doctrines so invasions field mixed silhouettes out of the gate.
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
    reserves:
      kind === "human"
        ? {
            trooper: 4,
            assault_mech: 3,
            hover_tank: 3,
            drone: 4,
            siege_cannon: 2,
          }
        : { trooper: 4, assault_mech: 1 },
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
    },
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "reactor",
      x: 0,
      y: 0,
      hp: 240,
      buildRemaining: 0,
    },
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "refinery",
      x: 0,
      y: 2,
      hp: 220,
      buildRemaining: 0,
    },
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "shield_wall",
      x: 1,
      y: 4,
      hp: 480,
      buildRemaining: 0,
    },
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "laser_turret",
      x: 4,
      y: 0,
      hp: 260,
      buildRemaining: 0,
    },
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "laser_turret",
      x: 5,
      y: 2,
      hp: 260,
      buildRemaining: 0,
    },
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "shield_wall",
      x: 4,
      y: 4,
      hp: 480,
      buildRemaining: 0,
    },
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "reactor",
      x: 5,
      y: 3,
      hp: 240,
      buildRemaining: 0,
    },
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "supply_depot",
      x: 2,
      y: 4,
      hp: 200,
      buildRemaining: 0,
    },
    {
      instanceId: `b${nextId.n++}`,
      buildingId: "missile_battery",
      x: 0,
      y: 4,
      hp: 250,
      buildRemaining: 0,
    },
  ];
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
  const active = new Set(playerOrder);

  const territories: Record<string, TerritoryState> = {};
  // Round-robin orphans (inactive startingOwner) so one faction isn't flooded.
  let orphanIdx = 0;
  for (const t of TERRITORIES) {
    let owner = t.startingOwner;
    if (!active.has(owner)) {
      owner = playerOrder[orphanIdx % playerOrder.length]!;
      orphanIdx++;
    }
    territories[t.id] = {
      owner,
      buildings: starterBuildings(nextId, owner),
      supplyStock: 20,
    };
  }

  const preferredStarts = ["alaska", "canada", "usa", "mexico"];
  humans.forEach((hid, i) => {
    const owns = Object.values(territories).some((ts) => ts.owner === hid);
    if (!owns) {
      const tid = preferredStarts[i] ?? TERRITORIES[i]!.id;
      territories[tid]!.owner = hid;
    }
  });

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
    message:
      humanCount > 1
        ? `${players[humans[0]!]!.displayName}'s turn — build, research, invade, then End Turn.`
        : "Earth, late 22nd century. Build, research, and reclaim the theater.",
    nextInstanceId: nextId.n,
  };
}
