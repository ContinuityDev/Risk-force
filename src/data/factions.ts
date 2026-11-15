import type { FactionId } from "./types";

/**
 * Faction display names — placeholder labels until lore names land.
 * Engine code should always use FactionId; UI reads labels from here.
 */
export const FACTION_NAMES: Record<FactionId, string> = {
  player: "Commander",
  faction_a: "Faction A",
  faction_b: "Faction B",
  faction_c: "Faction C",
  neutral: "Unclaimed",
};

export const FACTION_COLORS: Record<FactionId, string> = {
  player: "#5a9e82",
  faction_a: "#b87070",
  faction_b: "#6a8eb8",
  faction_c: "#b89a5a",
  neutral: "#5c6b7e",
};

export const AI_FACTIONS: FactionId[] = ["faction_a", "faction_b", "faction_c"];

export const PLAYABLE_FACTIONS: FactionId[] = [
  "player",
  "faction_a",
  "faction_b",
  "faction_c",
];

export function factionName(id: FactionId): string {
  return FACTION_NAMES[id];
}

export function factionColor(id: FactionId): string {
  return FACTION_COLORS[id];
}

export function isAiFaction(id: FactionId): boolean {
  return AI_FACTIONS.includes(id);
}

export function isNeutral(id: FactionId): boolean {
  return id === "neutral";
}
