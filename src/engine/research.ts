import { getResearch, RESEARCH } from "../data/research";
import type { PlayerState } from "./state";

export function hasResearched(player: PlayerState, nodeId: string): boolean {
  return player.researched.includes(nodeId);
}

export function canResearch(player: PlayerState, nodeId: string): boolean {
  const node = RESEARCH[nodeId];
  if (!node) return false;
  if (hasResearched(player, nodeId)) return false;
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

export function applyResearch(
  player: PlayerState,
  nodeId: string,
): PlayerState | null {
  if (!canResearch(player, nodeId)) return null;
  const node = getResearch(nodeId);
  return {
    ...player,
    resources: {
      ...player.resources,
      research: player.resources.research - node.cost,
    },
    researched: [...player.researched, nodeId],
  };
}

export function researchByBranch(): Record<string, typeof RESEARCH[string][]> {
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
