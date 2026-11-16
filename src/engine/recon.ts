/**
 * Recon — stealth drones / satellite relays reveal exact garrisons & research
 * on a target for N turns. Without recon, enemy garrisons show as ranges.
 */

import type { FactionId } from "../data/types";
import {
  formatUnitCount,
  formatUnitRange,
  territoryDisplayName,
} from "../ui/displayNames";
import type { GameState, ReconLink } from "./state";
import { canAfford, spend } from "./economy";
import { makeNewsItem } from "./news";

export const RECON_DURATION = 3;

export const RECON_COST = {
  drone: { energy: 40, alloy: 12, supply: 4 },
  satellite: { energy: 55, alloy: 18, research: 6 },
} as const;

export type ReconMode = "drone" | "satellite";

function territoryLabel(id: string): string {
  return territoryDisplayName(id);
}

export function hasReconAsset(
  state: GameState,
  playerId: FactionId,
  mode: ReconMode,
): boolean {
  for (const ts of Object.values(state.territories)) {
    if (ts.owner !== playerId) continue;
    if (mode === "drone" && (ts.garrison.stealth_recon_drone ?? 0) > 0) {
      return true;
    }
    if (mode === "satellite" && (ts.garrison.satellite_relay ?? 0) > 0) {
      return true;
    }
  }
  return false;
}

export function isTerritoryRevealed(
  state: GameState,
  viewerId: FactionId,
  territoryId: string,
): boolean {
  const ts = state.territories[territoryId];
  if (!ts) return false;
  if (ts.owner === viewerId) return true;
  const links = state.players[viewerId]?.recon ?? [];
  return links.some(
    (l) =>
      l.untilTurn >= state.turn &&
      (l.targetTerritoryId === territoryId || l.targetFactionId === ts.owner),
  );
}

export function revealedResearch(
  state: GameState,
  viewerId: FactionId,
  factionId: FactionId,
): string[] | null {
  if (viewerId === factionId) {
    return state.players[factionId]?.researched ?? [];
  }
  const links = state.players[viewerId]?.recon ?? [];
  const hit = links.some(
    (l) => l.untilTurn >= state.turn && l.targetFactionId === factionId,
  );
  if (!hit) return null;
  return state.players[factionId]?.researched ?? [];
}

/** Approximate garrison counts for UI when recon is absent. */
export function approximateGarrison(
  garrison: Record<string, number>,
): { unitId: string; lo: number; hi: number; exact?: number }[] {
  return Object.entries(garrison)
    .filter(([, n]) => n > 0)
    .map(([unitId, n]) => {
      if (n <= 2) return { unitId, lo: 1, hi: 3, exact: undefined };
      const spread = Math.max(1, Math.ceil(n * 0.35));
      return {
        unitId,
        lo: Math.max(1, n - spread),
        hi: n + spread,
      };
    });
}

export function formatGarrisonIntel(
  state: GameState,
  viewerId: FactionId,
  territoryId: string,
): string {
  const ts = state.territories[territoryId];
  if (!ts) return "—";
  const entries = Object.entries(ts.garrison).filter(([, n]) => n > 0);
  if (!entries.length) return "Empty";
  if (isTerritoryRevealed(state, viewerId, territoryId)) {
    return entries.map(([id, n]) => formatUnitCount(id, n)).join(", ");
  }
  return approximateGarrison(ts.garrison)
    .map((g) => formatUnitRange(g.unitId, g.lo, g.hi))
    .join(", ");
}

export function launchRecon(
  state: GameState,
  playerId: FactionId,
  targetId: string,
  mode: ReconMode,
): GameState {
  const player = state.players[playerId];
  const target = state.territories[targetId];
  if (!player || !target) {
    return { ...state, message: "Invalid recon target." };
  }
  if (target.owner === playerId) {
    return { ...state, message: "Already own that territory." };
  }
  if (!hasReconAsset(state, playerId, mode)) {
    return {
      ...state,
      message:
        mode === "drone"
          ? "Need a Stealth Recon Drone."
          : "Need a Satellite Relay.",
    };
  }
  const cost = RECON_COST[mode];
  if (!canAfford(player, cost)) {
    return { ...state, message: "Insufficient resources for recon." };
  }
  const spent = spend(player, cost);
  const link: ReconLink = {
    targetTerritoryId: targetId,
    targetFactionId: target.owner,
    untilTurn: state.turn + RECON_DURATION,
    mode,
  };
  const news = makeNewsItem({
    turn: state.turn,
    category: "movement",
    factionId: playerId,
    headline:
      mode === "drone"
        ? `Recon drone paints ${territoryLabel(targetId)}`
        : `Satellite relay locks ${territoryLabel(targetId)}`,
    body: `Exact garrison and research intel available for ${RECON_DURATION} turns.`,
  });
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...spent,
        recon: [...(spent.recon ?? []).filter((l) => l.untilTurn >= state.turn), link],
      },
    },
    newsFeed: [...(state.newsFeed ?? []), news].slice(-120),
    newsUnread: (state.newsUnread ?? 0) + 1,
    message: `Recon active on ${territoryLabel(targetId)} (${RECON_DURATION}t).`,
  };
}

export function tickRecon(state: GameState, playerId: string): GameState {
  const p = state.players[playerId];
  if (!p?.recon?.length) return state;
  const recon = p.recon.filter((l) => l.untilTurn >= state.turn);
  if (recon.length === p.recon.length) return state;
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...p, recon },
    },
  };
}
