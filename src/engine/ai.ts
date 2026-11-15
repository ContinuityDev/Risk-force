import { BUILDING_LIST } from "../data/buildings";
import { getAiPersonality } from "../data/gameLoop";
import { GAME_LOOP } from "../data/gameLoop";
import { TERRITORIES } from "../data/map/territories";
import { RESEARCH_LIST } from "../data/research";
import type { GameAction } from "./actions";
import { canAfford } from "./economy";
import { canPlaceBuilding } from "./placement";
import { canResearch, isUnlocked } from "./research";
import type { AiAttackPlan, GameState, StrikeForceSlot } from "./state";
import { enqueueWorker } from "./training";

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

/**
 * Believable AI: defend borders, pick weak targets, open flanks by personality.
 */
export function planAiTurn(state: GameState): GameAction[] {
  const pid = state.playerOrder[state.activePlayerIndex]!;
  const player = state.players[pid]!;
  if (player.kind !== "ai") return [];

  const persona = getAiPersonality(pid);
  const actions: GameAction[] = [];

  // Campaign budget
  const budget = Math.min(
    GAME_LOOP.campaigning.maxBudget,
    Math.floor(40 + persona.campaignBias * 80),
  );
  actions.push({ type: "SET_CAMPAIGN_BUDGET", payload: { energy: budget } });

  // Research
  const researchable = RESEARCH_LIST.filter((n) =>
    canResearch(player, n.id),
  ).sort((a, b) => a.cost - b.cost);
  if (researchable[0] && player.resources.research >= researchable[0].cost) {
    actions.push({ type: "RESEARCH", payload: { nodeId: researchable[0].id } });
  }

  const owned = TERRITORIES.filter((t) => state.territories[t.id]?.owner === pid);
  const frontier = owned.filter((t) =>
    t.neighbors.some((n) => state.territories[n]?.owner !== pid),
  );
  const safe = owned.filter((t) => !frontier.some((f) => f.id === t.id));

  // Train workers on safe / economy territories; troopers on frontier
  for (const t of owned.slice(0, 6)) {
    const ts = state.territories[t.id]!;
    if (ts.population < 2) continue;
    const isFront = frontier.some((f) => f.id === t.id);
    if (!isFront && ts.workers < 6) {
      const preview = enqueueWorker(player, ts, 1);
      if (preview) {
        actions.push({
          type: "TRAIN_WORKER",
          payload: { territoryId: t.id, count: 1 },
        });
      }
    }
    if (isFront && garrisonStrength(ts.garrison) < 5 + persona.defense * 4) {
      actions.push({
        type: "TRAIN_UNIT",
        payload: {
          territoryId: t.id,
          unitId: GAME_LOOP.training.basicUnitId,
          count: 1,
        },
      });
    }
  }

  // Build — cap placements so the turn reaches multi-front attacks promptly
  const buildSites = [...frontier, ...safe];
  let buildsThisTurn = 0;
  const maxBuilds = 4;
  for (const t of buildSites) {
    if (buildsThisTurn >= maxBuilds) break;
    const ts = state.territories[t.id]!;
    const isFront = frontier.some((f) => f.id === t.id);
    const candidates = BUILDING_LIST.filter((b) => {
      if (b.id === "command_nexus") {
        return ts.buildings.length === 0;
      }
      if (!isUnlocked(player, b.id) && b.id !== "command_nexus") return false;
      if (!canAfford(player, b.cost)) return false;
      if (isFront) return b.category === "defense" || b.category === "economy";
      return b.category === "economy" || b.category === "support";
    }).sort((a, b) => a.cost.energy - b.cost.energy);

    for (const b of candidates.slice(0, 1)) {
      outer: for (let y = 0; y < t.grid.rows; y++) {
        for (let x = 0; x < t.grid.cols; x++) {
          if (canPlaceBuilding(ts, t.id, b.id, x, y, player).ok) {
            actions.push({
              type: "PLACE_BUILDING",
              payload: { territoryId: t.id, buildingId: b.id, x, y },
            });
            buildsThisTurn++;
            break outer;
          }
        }
      }
      break;
    }
  }

  // Reinforce exposed borders from safe interiors
  if (persona.defense > 0.4) {
    for (const front of frontier) {
      const fts = state.territories[front.id]!;
      if (garrisonStrength(fts.garrison) >= 4 + persona.defense * 3) continue;
      const donor = safe
        .map((t) => ({ t, g: garrisonStrength(state.territories[t.id]!.garrison) }))
        .filter((x) => x.g >= 3)
        .sort((a, b) => b.g - a.g)[0];
      if (!donor) continue;
      const dts = state.territories[donor.t.id]!;
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

  // Multi-front attack planning — show all axes; execute the primary strike
  const plans = planAttacks(state, pid, persona);
  if (plans.length) {
    actions.push({ type: "SET_AI_ATTACK_PLANS", payload: { plans } });
    const primary = plans[0]!;
    actions.push({
      type: "START_INVASION",
      payload: {
        fromId: primary.fromId,
        toId: primary.toId,
        force: primary.force,
      },
    });
    // Battle phase interrupts the turn — do not END_TURN here
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
    if (strength < 3) continue;
    for (const nid of t.neighbors) {
      const nts = state.territories[nid];
      if (!nts || nts.owner === pid) continue;
      const def = defenseScore(state, nid);
      const val = territoryValue(nid);
      // Prefer weak / valuable targets (opportunism)
      let score =
        persona.opportunism * (val / (def + 1)) +
        persona.flanking * (strength / (def + 1));
      // Keep some home garrison
      const keep = Math.ceil(1 + persona.defense * 2);
      const available = Math.max(0, strength - keep);
      if (available < 2) continue;
      if (available < def * 0.6 && persona.opportunism < 0.8) continue;

      const force: StrikeForceSlot[] = [];
      let left = Math.min(
        available,
        persona.concentration > 0.6 ? available : Math.ceil(available * 0.65),
      );
      const entries = Object.entries(ts.garrison).sort((a, b) => b[1] - a[1]);
      for (const [unitId, count] of entries) {
        if (left <= 0) break;
        const take = Math.min(count, left);
        if (take > 0) {
          force.push({ unitId, count: take });
          left -= take;
        }
      }
      if (!force.length) continue;
      score += force.reduce((s, f) => s + f.count, 0) * 0.1;
      cands.push({ fromId: t.id, toId: nid, score, force });
    }
  }

  cands.sort((a, b) => b.score - a.score);
  const plans: AiAttackPlan[] = [];
  const usedFrom = new Set<string>();
  const usedTo = new Set<string>();

  for (const c of cands) {
    if (plans.length >= (persona.flanking > 0.6 ? 2 : 1)) break;
    if (usedFrom.has(c.fromId)) continue;
    // Flanking: prefer a second target that is a different neighbor region
    if (plans.length === 1 && persona.flanking > 0.5) {
      if (usedTo.has(c.toId)) continue;
      // Prefer different fromId (second front)
    }
    plans.push({ fromId: c.fromId, toId: c.toId, force: c.force });
    usedFrom.add(c.fromId);
    usedTo.add(c.toId);
    if (persona.concentration > 0.75) break;
  }

  return plans;
}
