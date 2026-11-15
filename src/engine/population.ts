import { GAME_LOOP } from "../data/gameLoop";
import { TERRITORIES } from "../data/map/territories";
import type { GameState, PlayerState, TerritoryState } from "./state";

/**
 * Total recruits this turn for a faction.
 * recruits = baseLandFactor * landMass + campaignFactor * sqrt(campaignSpend)
 */
export function computeRecruitment(
  landMass: number,
  campaignSpend: number,
): number {
  const { baseLandFactor, campaignFactor, minRecruits } = GAME_LOOP.population;
  const raw =
    baseLandFactor * landMass + campaignFactor * Math.sqrt(Math.max(0, campaignSpend));
  return Math.max(minRecruits, Math.floor(raw));
}

export function factionLandMass(state: GameState, playerId: string): number {
  let mass = 0;
  for (const t of TERRITORIES) {
    if (state.territories[t.id]?.owner === playerId) mass += t.area;
  }
  return mass;
}

/**
 * Distribute recruits across owned territories by land share.
 * Returns updated territories map (shallow-copied entries that change).
 */
export function applyPopulationGrowth(
  state: GameState,
  playerId: string,
  campaignSpend: number,
): Record<string, TerritoryState> {
  const owned = TERRITORIES.filter(
    (t) => state.territories[t.id]?.owner === playerId,
  );
  if (!owned.length) return state.territories;

  const totalLand = owned.reduce((s, t) => s + t.area, 0) || 1;
  const recruits = computeRecruitment(totalLand, campaignSpend);
  const { landShareWeight } = GAME_LOOP.population;

  // First pass: proportional + flat remainder tracking
  const weights = owned.map((t) => {
    const share = t.area / totalLand;
    return landShareWeight * share + (1 - landShareWeight) / owned.length;
  });
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;

  const territories = { ...state.territories };
  let assigned = 0;
  const allotments = weights.map((w) => {
    const n = Math.floor((recruits * w) / weightSum);
    assigned += n;
    return n;
  });
  // Remainder to largest territories
  let rem = recruits - assigned;
  const order = owned
    .map((t, i) => ({ i, area: t.area }))
    .sort((a, b) => b.area - a.area);
  let k = 0;
  while (rem > 0 && order.length) {
    const idx = order[k % order.length]!.i;
    allotments[idx]!++;
    rem--;
    k++;
  }

  owned.forEach((t, i) => {
    const ts = territories[t.id]!;
    const add = allotments[i] ?? 0;
    if (add > 0) {
      territories[t.id] = { ...ts, population: ts.population + add };
    }
  });

  return territories;
}

/** Spend campaign budget from player energy; returns player + amount spent. */
export function spendCampaignBudget(player: PlayerState): {
  player: PlayerState;
  spent: number;
} {
  const want = Math.max(0, Math.floor(player.campaignBudget));
  const spent = Math.min(want, Math.floor(player.resources.energy));
  if (spent <= 0) return { player, spent: 0 };
  return {
    spent,
    player: {
      ...player,
      resources: {
        ...player.resources,
        energy: player.resources.energy - spent,
      },
    },
  };
}
