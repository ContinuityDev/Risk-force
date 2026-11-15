import { getResearch, RESEARCH } from "../data/research";
import type { GameState, PlayerState, ResearchJob } from "./state";

export function hasResearched(player: PlayerState, nodeId: string): boolean {
  return player.researched.includes(nodeId);
}

/** Research takes 1–N turns based on node cost. */
export function researchTurns(nodeId: string): number {
  try {
    const node = getResearch(nodeId);
    return Math.max(1, Math.min(6, 1 + Math.floor(node.cost / 40)));
  } catch {
    return 1;
  }
}

export function canResearch(player: PlayerState, nodeId: string): boolean {
  const node = RESEARCH[nodeId];
  if (!node) return false;
  if (hasResearched(player, nodeId)) return false;
  if (player.researchJob) return false;
  if (player.resources.research < node.cost) return false;
  return node.prerequisites.every((p) => hasResearched(player, p));
}

export function isUnlocked(player: PlayerState, unlockId: string): boolean {
  const gatedBy = Object.values(RESEARCH).find((n) =>
    n.unlocks.includes(unlockId),
  );
  if (!gatedBy) return true;
  return hasResearched(player, gatedBy.id);
}

/**
 * Start a research job (charges full cost immediately). Completes via tickResearch.
 */
export function applyResearch(
  player: PlayerState,
  nodeId: string,
): PlayerState | null {
  if (!canResearch(player, nodeId)) return null;
  const node = getResearch(nodeId);
  const turns = researchTurns(nodeId);
  const job: ResearchJob = {
    nodeId,
    turnsRemaining: turns,
    totalTurns: turns,
  };
  return {
    ...player,
    resources: {
      ...player.resources,
      research: player.resources.research - node.cost,
    },
    researchJob: job,
  };
}

/** Advance research job one turn; returns completed node id if any. */
export function tickResearch(
  player: PlayerState,
): { player: PlayerState; completed: string | null } {
  const job = player.researchJob;
  if (!job) return { player, completed: null };
  const rem = job.turnsRemaining - 1;
  if (rem <= 0) {
    return {
      player: {
        ...player,
        researched: player.researched.includes(job.nodeId)
          ? player.researched
          : [...player.researched, job.nodeId],
        researchJob: null,
      },
      completed: job.nodeId,
    };
  }
  return {
    player: {
      ...player,
      researchJob: { ...job, turnsRemaining: rem },
    },
    completed: null,
  };
}

export function tickResearchForPlayer(
  state: GameState,
  playerId: string,
): GameState {
  const player = state.players[playerId];
  if (!player || player.eliminated) return state;
  const { player: next, completed } = tickResearch(player);
  const log = [...(state.turnLog ?? [])];
  if (completed) {
    try {
      log.push(
        `${player.displayName} completed research: ${getResearch(completed).name}.`,
      );
    } catch {
      log.push(`${player.displayName} completed research: ${completed}.`);
    }
  }
  return {
    ...state,
    players: { ...state.players, [playerId]: next },
    turnLog: log,
  };
}

export function researchByBranch(): Record<string, (typeof RESEARCH)[string][]> {
  const out: Record<string, (typeof RESEARCH)[string][]> = {};
  for (const node of Object.values(RESEARCH)) {
    const branch = node.branch ?? "general";
    (out[branch] ??= []).push(node);
  }
  for (const list of Object.values(out)) {
    list.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  }
  return out;
}
