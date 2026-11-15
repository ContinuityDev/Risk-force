/**
 * Diplomacy hook — relations state for a future AI diplomacy pass.
 * Not used by combat/economy yet; keep the API stable for later wiring.
 */

import type { FactionId } from "./types";

export type RelationStance = "war" | "neutral" | "friendly" | "allied";

/** Canonical key for an unordered faction pair. */
export function relationKey(a: FactionId, b: FactionId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export type RelationsTable = Record<string, RelationStance>;

/** Default: every pair at war (classic free-for-all). */
export function createDefaultRelations(
  factions: FactionId[],
): RelationsTable {
  const out: RelationsTable = {};
  for (let i = 0; i < factions.length; i++) {
    for (let j = i + 1; j < factions.length; j++) {
      out[relationKey(factions[i]!, factions[j]!)] = "war";
    }
  }
  return out;
}

export function getRelation(
  relations: RelationsTable,
  a: FactionId,
  b: FactionId,
): RelationStance {
  if (a === b) return "allied";
  return relations[relationKey(a, b)] ?? "neutral";
}

export function setRelation(
  relations: RelationsTable,
  a: FactionId,
  b: FactionId,
  stance: RelationStance,
): RelationsTable {
  if (a === b) return relations;
  return { ...relations, [relationKey(a, b)]: stance };
}

/** Future: treat non-war stances as non-attackable. Always false for now. */
export function areAtPeace(
  _relations: RelationsTable,
  _a: FactionId,
  _b: FactionId,
): boolean {
  return false;
}
