import { getDoctrine } from "../data/doctrines";
import { BUILDING_LIST } from "../data/buildings";
import { getAiPersonality } from "../data/gameLoop";
import { GAME_LOOP } from "../data/gameLoop";
import { TERRITORIES } from "../data/map/territories";
import { RESEARCH_LIST } from "../data/research";
import { UNIT_LIST } from "../data/units";
import type { GameAction } from "./actions";
import {
  COMMANDER_ROLES,
  COMMANDER_TRAIN_COST,
  hasCommanderRole,
} from "./commanders";
import { playerDoctrineId } from "./doctrine";
import { canAfford } from "./economy";
import { isSupplied } from "./logistics";
import { canOrderMove } from "./movement";
import { canPlaceBuilding } from "./placement";
import { canResearch, isUnlocked, researchTurns } from "./research";
import { hasReconAsset } from "./recon";
import type { AiAttackPlan, GameState, StrikeForceSlot } from "./state";
import {
  canLaunchStrike,
  playerHasStrikeAsset,
} from "./strikes";
import {
  enqueueUnit,
  enqueueWorker,
  workerCapForBuilding,
} from "./training";
import type { StrikeKind } from "./state";

function garrisonStrength(garrison: Record<string, number>): number {
  return Object.values(garrison).reduce((a, b) => a + b, 0);
}

function defenseScore(state: GameState, tid: string): number {
  const ts = state.territories[tid]!;
  let score = garrisonStrength(ts.garrison) * 2;
  for (const b of ts.buildings) {
    if (b.buildRemaining > 0) continue;
    const d = BUILDING_LIST.find((x) => x.id === b.buildingId);
    if (!d) continue;
    if (d.damage) score += 3;
    else if (d.category === "defense") score += 1.5;
    else if (d.category === "command") score += 2;
  }
  return score;
}

function territoryValue(tid: string): number {
  const t = TERRITORIES.find((x) => x.id === tid);
  return t ? t.area * 100 + 1 : 1;
}

function freeWorkers(ts: { workers: number; buildings: { workers: number }[] }) {
  const used = ts.buildings.reduce((s, b) => s + (b.workers ?? 0), 0);
  return Math.max(0, ts.workers - used);
}

/**
 * Believable AI: real economy (build, staff, research, train), then strategy.
 */
export function planAiTurn(state: GameState): GameAction[] {
  const pid = state.playerOrder[state.activePlayerIndex]!;
  const player = state.players[pid]!;
  if (player.kind !== "ai") return [];

  const persona = getAiPersonality(pid);
  const actions: GameAction[] = [];
  // Working copy so later plans see staffing / spends within the same batch.
  let simPlayer = { ...player, resources: { ...player.resources } };
  let simTerritories = { ...state.territories };

  // Campaign budget — income vs upkeep pressure
  const energy = simPlayer.resources.energy;
  const budget = Math.min(
    GAME_LOOP.campaigning.maxBudget,
    Math.max(
      10,
      Math.floor(
        Math.min(energy * 0.2, 40 + persona.campaignBias * 80),
      ),
    ),
  );
  actions.push({ type: "SET_CAMPAIGN_BUDGET", payload: { energy: budget } });
  simPlayer = { ...simPlayer, campaignBudget: budget };

  const doctrine = getDoctrine(playerDoctrineId(simPlayer));
  // Research — prefer doctrine branch, then cheapest
  const researchable = RESEARCH_LIST.filter((n) =>
    canResearch(simPlayer, n.id),
  ).sort((a, b) => {
    const prefer = (branch: string) => {
      if (doctrine.id === "vanguard" && branch === "infantry") return -2;
      if (doctrine.id === "ironclad" && (branch === "armor" || branch === "infantry"))
        return -2;
      if (doctrine.id === "skyborne" && (branch === "air" || branch === "orbital"))
        return -2;
      if (doctrine.id === "spectre" && branch === "cyber") return -2;
      return 0;
    };
    return prefer(a.branch) - prefer(b.branch) || a.cost - b.cost;
  });
  if (
    researchable[0] &&
    !simPlayer.researchJob &&
    simPlayer.resources.research >= researchable[0].cost
  ) {
    const node = researchable[0];
    const turns = researchTurns(node.id);
    actions.push({ type: "RESEARCH", payload: { nodeId: node.id } });
    simPlayer = {
      ...simPlayer,
      resources: {
        ...simPlayer.resources,
        research: simPlayer.resources.research - node.cost,
      },
      researchJob: {
        nodeId: node.id,
        turnsRemaining: turns,
        totalTurns: turns,
      },
    };
  }

  // Stabilize valuable occupied land
  for (const t of TERRITORIES) {
    const ts = simTerritories[t.id];
    if (!ts || ts.owner !== pid || ts.control !== "occupied") continue;
    if (ts.occupiedTurns >= 2 && simPlayer.resources.energy >= 35) {
      actions.push({
        type: "STABILIZE_TERRITORY",
        payload: { territoryId: t.id },
      });
      simPlayer = {
        ...simPlayer,
        resources: {
          ...simPlayer.resources,
          energy: simPlayer.resources.energy - 35,
          alloy: simPlayer.resources.alloy - 10,
        },
      };
      break;
    }
  }

  // Market: buy supply when global stock is critically low
  if (
    simPlayer.resources.supply < 15 &&
    simPlayer.resources.energy > 80
  ) {
    actions.push({
      type: "MARKET_TRADE",
      payload: { from: "energy", to: "supply", amount: 30 },
    });
    simPlayer = {
      ...simPlayer,
      resources: {
        ...simPlayer.resources,
        energy: simPlayer.resources.energy - 30,
        supply: simPlayer.resources.supply + 10,
      },
    };
  }

  const owned = TERRITORIES.filter((t) => simTerritories[t.id]?.owner === pid);
  const frontier = owned.filter((t) =>
    t.neighbors.some((n) => simTerritories[n]?.owner !== pid),
  );
  const safe = owned.filter((t) => !frontier.some((f) => f.id === t.id));

  // Staff completed economy / defense buildings that have free capacity
  for (const t of owned) {
    const ts = simTerritories[t.id]!;
    let free = freeWorkers(ts);
    if (free <= 0) continue;
    const needy = [...ts.buildings]
      .filter((b) => b.buildRemaining <= 0)
      .map((b) => {
        const cap = workerCapForBuilding(b.buildingId);
        return { b, cap, need: Math.max(0, cap - (b.workers ?? 0)) };
      })
      .filter((x) => x.need > 0)
      .sort((a, b) => {
        // Prefer economy output first
        const ca =
          BUILDING_LIST.find((x) => x.id === a.b.buildingId)?.category ?? "";
        const cb =
          BUILDING_LIST.find((x) => x.id === b.b.buildingId)?.category ?? "";
        if (ca === "economy" && cb !== "economy") return -1;
        if (cb === "economy" && ca !== "economy") return 1;
        return b.need - a.need;
      });
    for (const n of needy) {
      if (free <= 0) break;
      const add = Math.min(free, n.need);
      const nextWorkers = (n.b.workers ?? 0) + add;
      actions.push({
        type: "ASSIGN_WORKERS",
        payload: {
          territoryId: t.id,
          instanceId: n.b.instanceId,
          workers: nextWorkers,
        },
      });
      free -= add;
      simTerritories = {
        ...simTerritories,
        [t.id]: {
          ...ts,
          buildings: ts.buildings.map((b) =>
            b.instanceId === n.b.instanceId
              ? { ...b, workers: nextWorkers }
              : b,
          ),
        },
      };
    }
  }

  // Train workers on safe land; combat units on frontiers from local pop
  for (const t of owned.slice(0, 8)) {
    const ts = simTerritories[t.id]!;
    if (ts.population < 2) continue;
    const isFront = frontier.some((f) => f.id === t.id);
    if (!isFront && ts.workers < 8) {
      const preview = enqueueWorker(simPlayer, ts, 1);
      if (preview) {
        actions.push({
          type: "TRAIN_WORKER",
          payload: { territoryId: t.id, count: 1 },
        });
        simPlayer = preview.player;
        simTerritories = {
          ...simTerritories,
          [t.id]: preview.territory,
        };
      }
    }
    if (isFront && garrisonStrength(ts.garrison) < 5 + persona.defense * 4) {
      const unlocked = UNIT_LIST.filter(
        (u) =>
          u.id === GAME_LOOP.training.basicUnitId ||
          isUnlocked(simPlayer, u.id),
      ).sort((a, b) => a.cost.energy - b.cost.energy);
      // Prefer troopers when poor; otherwise a mid unlocked combat unit
      const pick =
        simPlayer.resources.energy < 80
          ? unlocked.find((u) => u.id === GAME_LOOP.training.basicUnitId)
          : unlocked.find((u) => u.id !== GAME_LOOP.training.basicUnitId) ??
            unlocked[0];
      if (pick) {
        const preview = enqueueUnit(simPlayer, ts, pick.id, 1);
        if (preview) {
          actions.push({
            type: "TRAIN_UNIT",
            payload: {
              territoryId: t.id,
              unitId: pick.id,
              count: 1,
            },
          });
          simPlayer = preview.player;
          simTerritories = {
            ...simTerritories,
            [t.id]: preview.territory,
          };
        }
      }
    }
  }

  // Build economy / research / defense — no free units; real placement
  const buildSites = [...safe, ...frontier];
  let buildsThisTurn = 0;
  const maxBuilds = 5;
  for (const t of buildSites) {
    if (buildsThisTurn >= maxBuilds) break;
    const ts = simTerritories[t.id]!;
    const isFront = frontier.some((f) => f.id === t.id);
    const hasReactor = ts.buildings.some((b) => b.buildingId === "reactor");
    const hasRefinery = ts.buildings.some((b) => b.buildingId === "refinery");
    const candidates = BUILDING_LIST.filter((b) => {
      if (b.id === "command_nexus") return ts.buildings.length === 0;
      if (!isUnlocked(simPlayer, b.id) && b.id !== "command_nexus") return false;
      if (!canAfford(simPlayer, b.cost)) return false;
      if (b.category === "naval") return false;
      if (b.category === "orbital" && doctrine.id !== "skyborne") return false;
      if (isFront) {
        return b.category === "defense" || b.category === "economy";
      }
      // Safe: prioritize missing economy, then research, then support
      if (!hasReactor && b.id === "reactor") return true;
      if (!hasRefinery && b.id === "refinery") return true;
      return (
        b.category === "economy" ||
        b.category === "research" ||
        b.category === "support"
      );
    }).sort((a, b) => {
      // Prefer reactors/refineries first
      const rank = (id: string) =>
        id === "reactor" ? 0 : id === "refinery" ? 1 : id === "supply_depot" ? 2 : 3;
      return rank(a.id) - rank(b.id) || a.cost.energy - b.cost.energy;
    });

    for (const b of candidates.slice(0, 3)) {
      let placed = false;
      outer: for (let y = 0; y < t.grid.rows; y++) {
        for (let x = 0; x < t.grid.cols; x++) {
          const check = canPlaceBuilding(ts, t.id, b.id, x, y, simPlayer);
          if (!check.ok) continue;
          actions.push({
            type: "PLACE_BUILDING",
            payload: { territoryId: t.id, buildingId: b.id, x, y },
          });
          // Spend on sim player
          simPlayer = {
            ...simPlayer,
            resources: {
              ...simPlayer.resources,
              energy: simPlayer.resources.energy - (b.cost.energy ?? 0),
              alloy: simPlayer.resources.alloy - (b.cost.alloy ?? 0),
            },
          };
          buildsThisTurn++;
          placed = true;
          break outer;
        }
      }
      if (placed) break;
    }
  }

  // Reinforce exposed borders from safe interiors
  if (persona.defense > 0.4) {
    for (const front of frontier) {
      const fts = simTerritories[front.id]!;
      if (garrisonStrength(fts.garrison) >= 4 + persona.defense * 3) continue;
      const donor = safe
        .map((t) => ({
          t,
          g: garrisonStrength(simTerritories[t.id]!.garrison),
        }))
        .filter((x) => x.g >= 3)
        .sort((a, b) => b.g - a.g)[0];
      if (!donor) continue;
      const dts = simTerritories[donor.t.id]!;
      const unitId = Object.entries(dts.garrison).find(([, c]) => c > 0)?.[0];
      if (!unitId) continue;
      actions.push({
        type: "MOVE_GARRISON",
        payload: {
          fromId: donor.t.id,
          toId: front.id,
          unitId,
          count: 1,
        },
      });
    }
  }

  // War College — commission missing officers when possible
  for (const t of owned) {
    const ts = simTerritories[t.id]!;
    const college = ts.buildings.some(
      (b) =>
        b.buildingId === "war_college" &&
        b.buildRemaining <= 0 &&
        b.hp > 0,
    );
    if (!college) continue;
    for (const role of COMMANDER_ROLES) {
      if (hasCommanderRole(simPlayer, role)) continue;
      if (!canAfford(simPlayer, COMMANDER_TRAIN_COST)) break;
      actions.push({
        type: "TRAIN_COMMANDER",
        payload: { territoryId: t.id, role },
      });
      simPlayer = {
        ...simPlayer,
        resources: {
          ...simPlayer.resources,
          energy: simPlayer.resources.energy - COMMANDER_TRAIN_COST.energy,
          alloy: simPlayer.resources.alloy - COMMANDER_TRAIN_COST.alloy,
          research:
            simPlayer.resources.research - COMMANDER_TRAIN_COST.research,
        },
        commanders: [
          ...(simPlayer.commanders ?? []),
          {
            id: `ai-cmd-${role}`,
            role,
            name: role,
            attachedTerritoryId: t.id,
          },
        ],
      };
      break;
    }
  }

  const simState = {
    ...state,
    territories: simTerritories,
    players: { ...state.players, [pid]: simPlayer },
  };

  // Recon a frontier enemy when assets exist
  if (hasReconAsset(simState, pid, "drone") || hasReconAsset(simState, pid, "satellite")) {
    const target = frontier
      .flatMap((t) =>
        t.neighbors
          .filter((n) => simTerritories[n]?.owner !== pid)
          .map((n) => n),
      )[0];
    if (target) {
      const mode = hasReconAsset(simState, pid, "drone") ? "drone" : "satellite";
      actions.push({
        type: "LAUNCH_RECON",
        payload: { targetId: target, mode },
      });
    }
  }

  // Soften a hard target with strikes before invading
  const strikeKinds: StrikeKind[] = ["cruise", "orbital", "kinetic"];
  for (const kind of strikeKinds) {
    if (!playerHasStrikeAsset(simState, pid, kind)) continue;
    const enemy = TERRITORIES.find((t) => {
      const ts = simTerritories[t.id];
      return (
        ts &&
        ts.owner !== pid &&
        t.neighbors.some((n) => simTerritories[n]?.owner === pid)
      );
    });
    if (!enemy) continue;
    const check = canLaunchStrike(simState, pid, kind, enemy.id);
    if (!check.ok) continue;
    actions.push({
      type: "LAUNCH_STRIKE",
      payload: { kind, targetId: enemy.id },
    });
    break;
  }

  // Multi-front attack planning — show all axes; execute the primary strike
  const plans = planAttacks(simState, pid, persona);
  if (plans.length) {
    // Prefer supplied launch sites when possible
    const supplied =
      plans.find((p) => isSupplied(simState, p.fromId, pid)) ?? plans[0]!;
    actions.push({ type: "SET_AI_ATTACK_PLANS", payload: { plans } });
    // Prefer squad march when possible; fall back to legacy invasion march.
    actions.push({
      type: "ORDER_MOVE",
      payload: {
        fromId: supplied.fromId,
        toId: supplied.toId,
        force: supplied.force,
      },
    });
    return actions;
  }

  actions.push({ type: "END_TURN" });
  return actions;
}

/** Pure: score enemy neighbors and pick 1–2 invasion axes. */
export function planAttacks(
  state: GameState,
  pid: string,
  persona = getAiPersonality(pid as never),
): AiAttackPlan[] {
  const owned = TERRITORIES.filter((t) => state.territories[t.id]?.owner === pid);
  const ownedCount = owned.length;
  type Cand = {
    fromId: string;
    toId: string;
    score: number;
    force: StrikeForceSlot[];
  };
  const cands: Cand[] = [];

  for (const t of owned) {
    const ts = state.territories[t.id]!;
    const strength = garrisonStrength(ts.garrison);
    // Early one-start: allow leaner launches into adjacent neutrals.
    const minStr = ownedCount <= 2 ? 2 : 3;
    if (strength < minStr) continue;
    for (const nid of t.neighbors) {
      const nts = state.territories[nid];
      if (!nts || nts.owner === pid) continue;
      const isNeutral = nts.owner === "neutral";
      const def = defenseScore(state, nid);
      const val = territoryValue(nid);
      let score =
        (val * 1.2) / (1 + def) +
        persona.opportunism * 2 -
        persona.defense * 0.5;
      // Expand into neutrals first: weakest, valuable, adjacent.
      if (isNeutral) {
        score += 5 + persona.opportunism * 4;
        score += val * 0.8;
        score -= def * 0.35;
        if (ownedCount <= 3) score += 6;
      }
      // Flank bonus: multiple owned neighbors on the target
      const ownedNeighbors = TERRITORIES.find((x) => x.id === nid)!.neighbors.filter(
        (n) => state.territories[n]?.owner === pid,
      ).length;
      if (ownedNeighbors >= 2) score += persona.flanking * 3;

      const commitFrac = isNeutral
        ? 0.55 + persona.opportunism * 0.2
        : 0.45 + persona.opportunism * 0.25;
      const force: StrikeForceSlot[] = Object.entries(ts.garrison)
        .filter(([, c]) => c > 0)
        .map(([unitId, count]) => ({
          unitId,
          count: Math.max(1, Math.floor(count * commitFrac)),
        }))
        .filter((s) => s.count > 0);
      if (!force.length) continue;
      const committed = force.reduce((s, x) => s + x.count, 0);
      if (committed < (isNeutral ? 1 : 2)) continue;
      // Leave at least one trooper home when possible
      const homeLeft = strength - committed;
      if (homeLeft < 1 && strength > 2) {
        const troop = force.find((f) => f.unitId === "trooper");
        if (troop && troop.count > 1) troop.count -= 1;
      }
      // Only launch if the force can actually reach the target
      // (adjacent ground / sea lane / air jump — never teleport).
      if (!canOrderMove(state, pid, t.id, nid, force).ok) continue;
      cands.push({ fromId: t.id, toId: nid, score, force });
    }
  }

  cands.sort((a, b) => b.score - a.score);
  const picked: AiAttackPlan[] = [];
  const usedFrom = new Set<string>();
  const usedTo = new Set<string>();
  const maxPlans =
    persona.flanking > 0.6 && ownedCount >= 2 ? 2 : 1;
  for (const c of cands) {
    if (picked.length >= maxPlans) break;
    if (usedFrom.has(c.fromId) || usedTo.has(c.toId)) continue;
    usedFrom.add(c.fromId);
    usedTo.add(c.toId);
    picked.push({
      fromId: c.fromId,
      toId: c.toId,
      force: c.force,
    });
  }
  return picked;
}
