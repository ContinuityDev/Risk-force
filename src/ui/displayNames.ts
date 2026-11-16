/**
 * Human-readable labels for IDs that would otherwise leak as snake_case.
 */

import { factionName } from "../data/factions";
import { TERRITORIES } from "../data/map/territories";
import { getResearch } from "../data/research";
import type { FactionId } from "../data/types";
import { getUnit } from "../data/units";
import { STRIKE_DEFS } from "../engine/strikes";
import type { StrikeKind } from "../engine/state";

export function unitDisplayName(unitId: string): string {
  try {
    return getUnit(unitId).name;
  } catch {
    return unitId.replace(/_/g, " ");
  }
}

export function territoryDisplayName(id: string): string {
  return TERRITORIES.find((t) => t.id === id)?.name ?? id.replace(/_/g, " ");
}

export function factionDisplayName(id: string): string {
  try {
    return factionName(id as FactionId);
  } catch {
    return id.replace(/_/g, " ");
  }
}

export function researchDisplayName(nodeId: string): string {
  try {
    return getResearch(nodeId).name;
  } catch {
    return nodeId.replace(/_/g, " ");
  }
}

export function strikeDisplayName(kind: string): string {
  const def = STRIKE_DEFS[kind as StrikeKind];
  return def?.label ?? kind.replace(/_/g, " ");
}

export function reconModeDisplayName(mode: string): string {
  if (mode === "drone") return "stealth drone";
  if (mode === "satellite") return "satellite relay";
  return mode.replace(/_/g, " ");
}

export function roleDisplayName(role: string): string {
  const cleaned = role.replace(/_/g, " ").trim();
  if (!cleaned) return role;
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format garrison intel with unit display names. */
export function formatUnitCount(unitId: string, count: number | string): string {
  return `${unitDisplayName(unitId)}×${count}`;
}

export function formatUnitRange(
  unitId: string,
  lo: number,
  hi: number,
): string {
  return `${unitDisplayName(unitId)}×${lo}–${hi}`;
}
