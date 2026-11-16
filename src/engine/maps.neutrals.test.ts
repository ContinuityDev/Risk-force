import { describe, expect, it } from "vitest";
import { activateMap } from "../data/maps/activate";
import { TERRITORIES } from "../data/map/territories";
import { planAiTurn, planAttacks } from "./ai";
import { createInitialState } from "./init";
import { isSeaLink, tickArmiesForPlayer } from "./movement";
import { regenerateNeutralGarrisons } from "./neutrals";
import { reduce } from "./reducer";
import type { GameState } from "./state";
import { checkEliminationsAndVictory } from "./victory";

function ownedSet(state: GameState, pid: string): Set<string> {
  return new Set(
    Object.entries(state.territories)
      .filter(([, ts]) => ts.owner === pid)
      .map(([id]) => id),
  );
}

/** Ground adjacency or naval sea-lane from previously owned land. */
function reachableFromOwned(owned: Set<string>, targetId: string): boolean {
  for (const from of owned) {
    const def = TERRITORIES.find((t) => t.id === from);
    if (!def) continue;
    if (def.neighbors.includes(targetId)) return true;
    if (isSeaLink(from, targetId)) return true;
  }
  return false;
}

function resolveBattle(state: GameState): GameState {
  let cur = state;
  let guard = 0;
  while (
    cur.phase === "battle" &&
    cur.battle?.status === "running" &&
    guard++ < 120
  ) {
    cur = reduce(cur, { type: "BATTLE_TICK", payload: { dt: 5 } });
  }
  if (cur.phase === "battle") {
    cur = reduce(cur, { type: "RESOLVE_BATTLE" });
  }
  return cur;
}

/** Advance one player's turn: AI plans+fights, human just ends. */
function playActive(state: GameState): GameState {
  let cur = state;
  // Arrival battles open when the previous player ended turn.
  if (cur.phase === "battle") cur = resolveBattle(cur);
  if (cur.phase !== "play") return cur;

  const pid = cur.playerOrder[cur.activePlayerIndex]!;
  const player = cur.players[pid]!;
  if (player.eliminated) {
    return reduce(cur, { type: "END_TURN" });
  }
  if (player.kind === "ai") {
    const actions = planAiTurn(cur);
    for (const a of actions) {
      cur = reduce(cur, a);
      if (cur.phase === "battle") cur = resolveBattle(cur);
      if (a.type === "END_TURN") break;
    }
    // Clamp march ETA so adjacency captures resolve within the early-turn window
    // (CW Albers distances otherwise take 4–5 ticks).
    if (cur.armiesInTransit?.length) {
      cur = {
        ...cur,
        armiesInTransit: cur.armiesInTransit.map((a) =>
          a.owner === pid ? { ...a, turnsRemaining: 1 } : a,
        ),
      };
    }
    if (
      cur.phase === "play" &&
      cur.playerOrder[cur.activePlayerIndex] === pid
    ) {
      cur = reduce(cur, { type: "END_TURN" });
    }
    return cur;
  }
  return reduce(cur, { type: "END_TURN" });
}

describe("one-start + neutrals", () => {
  it("gives each faction exactly one territory; rest are neutral (World War)", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 42,
      mapId: "world_war",
    });
    expect(state.mapId).toBe("world_war");
    const counts: Record<string, number> = {};
    for (const ts of Object.values(state.territories)) {
      counts[ts.owner] = (counts[ts.owner] ?? 0) + 1;
    }
    expect(counts.player).toBe(1);
    expect(counts.faction_a).toBe(1);
    expect(counts.faction_b).toBe(1);
    expect(counts.neutral).toBe(TERRITORIES.length - 3);
    expect(Object.keys(state.territories)).toHaveLength(TERRITORIES.length);
  });

  it("same one-start setup on Civil War map", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 99,
      mapId: "civil_war",
    });
    expect(state.mapId).toBe("civil_war");
    expect(TERRITORIES.some((t) => t.id === "california")).toBe(true);
    const byOwner: Record<string, number> = {};
    for (const ts of Object.values(state.territories)) {
      byOwner[ts.owner] = (byOwner[ts.owner] ?? 0) + 1;
    }
    expect(byOwner.player).toBe(1);
    expect(byOwner.faction_a).toBe(1);
    expect(byOwner.faction_b).toBe(1);
    expect(byOwner.neutral).toBe(TERRITORIES.length - 3);
    activateMap("world_war");
  });

  it("neutrals never appear in playerOrder and do not act on END_TURN", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 7,
      mapId: "world_war",
    });
    expect(state.playerOrder.includes("neutral" as never)).toBe(false);
    const before = structuredClone(state.territories);
    // End human turn → AI turn economy, then back
    state = reduce(state, { type: "END_TURN" });
    // If AI is active, end their turn too
    if (state.players[state.playerOrder[state.activePlayerIndex]!]?.kind === "ai") {
      state = reduce(state, { type: "END_TURN" });
    }
    for (const [id, ts] of Object.entries(before)) {
      if (ts.owner !== "neutral") continue;
      const after = state.territories[id]!;
      expect(after.owner).toBe("neutral");
      // Neutrals do not train / build / change owner on their own
      expect(after.trainingQueue).toEqual([]);
    }
  });

  it("neutral garrisons can slowly regenerate", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 0,
      multiplayerMode: "solo",
      seed: 3,
    });
    const nid = Object.entries(state.territories).find(
      ([, ts]) => ts.owner === "neutral",
    )![0];
    state = {
      ...state,
      territories: {
        ...state.territories,
        [nid]: {
          ...state.territories[nid]!,
          garrison: { trooper: 1 },
        },
      },
    };
    const next = regenerateNeutralGarrisons(state);
    expect(next.territories[nid]!.garrison.trooper).toBeGreaterThan(1);
  });

  it("AI prefers capturing adjacent neutrals and can finish the capture", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 11,
      mapId: "world_war",
    });
    const aiId = "faction_a";
    const home = Object.entries(state.territories).find(
      ([, ts]) => ts.owner === aiId,
    )![0];
    const homeDef = TERRITORIES.find((t) => t.id === home)!;
    const neutralNeighbor = homeDef.neighbors.find(
      (n) => state.territories[n]?.owner === "neutral",
    );
    expect(neutralNeighbor).toBeTruthy();

    // Fat garrison + tiny neutral defender so invasion is viable immediately
    state = {
      ...state,
      activePlayerIndex: state.playerOrder.indexOf(aiId),
      territories: {
        ...state.territories,
        [home]: {
          ...state.territories[home]!,
          garrison: { trooper: 14, assault_mech: 2 },
          supplyStock: 40,
        },
        [neutralNeighbor!]: {
          ...state.territories[neutralNeighbor!]!,
          garrison: { trooper: 1 },
          buildings: [],
        },
      },
      players: {
        ...state.players,
        [aiId]: {
          ...state.players[aiId]!,
          resources: {
            ...state.players[aiId]!.resources,
            energy: 5000,
            alloy: 500,
            supply: 100,
          },
        },
      },
    };

    const plans = planAttacks(state, aiId);
    expect(plans.length).toBeGreaterThanOrEqual(1);
    expect(plans[0]!.toId).toBe(neutralNeighbor);

    const actions = planAiTurn(state);
    expect(actions.some((a) => a.type === "START_INVASION")).toBe(true);
    for (const a of actions) {
      state = reduce(state, a);
    }
    expect(state.armiesInTransit?.length).toBeGreaterThan(0);

    // Arrive next AI tick (force 1-turn remaining) and resolve the fight.
    state = tickArmiesForPlayer(
      {
        ...state,
        armiesInTransit: state.armiesInTransit!.map((a) => ({
          ...a,
          turnsRemaining: 1,
        })),
      },
      aiId,
    );
    expect(state.phase).toBe("battle");
    let guard = 0;
    while (
      state.phase === "battle" &&
      state.battle?.status === "running" &&
      guard++ < 80
    ) {
      state = reduce(state, { type: "BATTLE_TICK", payload: { dt: 5 } });
    }
    state = reduce(state, { type: "RESOLVE_BATTLE" });
    const owned = Object.values(state.territories).filter(
      (ts) => ts.owner === aiId,
    ).length;
    expect(owned).toBeGreaterThanOrEqual(2);
    expect(state.territories[neutralNeighbor!]!.owner).toBe(aiId);
  });

  it("every AI capture on turns 1–3 is adjacent or sea-reachable from land it already owned", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 55,
      mapId: "civil_war",
    });
    // Buff AI + thin adjacent neutrals so early invasions can win fights.
    const territories = { ...state.territories };
    for (const [id, ts] of Object.entries(territories)) {
      if (ts.owner === "neutral" || ts.owner === "player") continue;
      territories[id] = {
        ...ts,
        garrison: { trooper: 14, assault_mech: 2 },
        supplyStock: 40,
      };
      const home = TERRITORIES.find((t) => t.id === id);
      for (const nid of home?.neighbors ?? []) {
        if (territories[nid]?.owner !== "neutral") continue;
        territories[nid] = {
          ...territories[nid]!,
          garrison: { trooper: 1 },
          buildings: [],
        };
      }
    }
    state = { ...state, territories };

    const priorOwned = new Map<string, Set<string>>();
    for (const pid of state.playerOrder) {
      if (state.players[pid]?.kind === "ai") {
        priorOwned.set(pid, ownedSet(state, pid));
      }
    }

    const captures: Array<{ pid: string; tid: string; turn: number }> = [];
    // Launch on an AI turn; arrival resolves when that AI's turn starts again.
    const steps = state.playerOrder.length * 3;
    for (let i = 0; i < steps; i++) {
      const before = structuredClone(state.territories);
      const turn = state.turn;
      state = playActive(state);
      for (const pid of state.playerOrder) {
        if (state.players[pid]?.kind !== "ai") continue;
        const prev = priorOwned.get(pid) ?? new Set();
        for (const [tid, ts] of Object.entries(state.territories)) {
          if (ts.owner !== pid) continue;
          if (before[tid]?.owner === pid) continue;
          expect(
            reachableFromOwned(prev, tid),
            `${pid} captured ${tid} on turn ${turn} without adjacency/sea link from prior owned [${[...prev].join(",")}]`,
          ).toBe(true);
          captures.push({ pid, tid, turn });
        }
        priorOwned.set(pid, ownedSet(state, pid));
      }
    }

    expect(captures.length).toBeGreaterThan(0);
  });

  it("victory requires clearing neutrals — sole living faction with neutrals left does not win", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 5,
    });
    const territories = { ...state.territories };
    for (const id of Object.keys(territories)) {
      if (territories[id]!.owner === "faction_a") {
        territories[id] = { ...territories[id]!, owner: "player" };
      }
      // leave neutrals
    }
    state = checkEliminationsAndVictory({ ...state, territories });
    expect(state.players.faction_a?.eliminated).toBe(true);
    expect(state.winner).toBeNull();
    expect(state.phase).toBe("play");

    // Now claim all neutrals
    for (const id of Object.keys(territories)) {
      territories[id] = { ...territories[id]!, owner: "player" };
    }
    state = checkEliminationsAndVictory({ ...state, territories });
    expect(state.winner).toBe("player");
    expect(state.phase).toBe("ended");
  });
});
