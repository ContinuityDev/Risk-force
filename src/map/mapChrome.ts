import type { TerritoryDef } from "../data/types";
import type { ArmyTransit, TerritoryState } from "../engine/state";

export type MapChromeFocus = {
  /** Human player id — always show their bases/chips. */
  humanId: string | null | undefined;
  /** Currently selected territory. */
  selectedId: string | null | undefined;
  /** Neighbor ids of the selected territory (ground adjacency). */
  selectedNeighbors: ReadonlySet<string>;
  /** Territory ids referenced by in-flight marches (from/to). */
  armyTerritoryIds: ReadonlySet<string>;
};

/** Territories involved in any active march. */
export function armyTerritoryIdSet(
  armies: ArmyTransit[] | null | undefined,
): Set<string> {
  const ids = new Set<string>();
  for (const a of armies ?? []) {
    ids.add(a.fromId);
    ids.add(a.toId);
  }
  return ids;
}

/**
 * Whether unit / garrison chrome should render for this territory.
 * Player land, the selection focus ring (selected + neighbors), and march
 * endpoints. Quiet neutrals stay bare until selected or adjacent.
 */
export function shouldShowMapChrome(
  t: TerritoryDef,
  ts: TerritoryState | undefined,
  focus: MapChromeFocus,
): boolean {
  const owner = ts?.owner;
  if (focus.humanId && owner === focus.humanId) return true;
  if (focus.selectedId && t.id === focus.selectedId) return true;
  if (focus.selectedNeighbors.has(t.id)) return true;
  if (focus.armyTerritoryIds.has(t.id)) return true;
  return false;
}

/**
 * Building pads: only on player land or the actively selected plot.
 * Neighbor neutrals keep a garrison badge but drop building clusters —
 * that was the main Europe / NE noise source.
 */
export function shouldShowBuildingMinis(
  t: TerritoryDef,
  ts: TerritoryState | undefined,
  focus: MapChromeFocus,
): boolean {
  const owner = ts?.owner;
  if (focus.humanId && owner === focus.humanId) return true;
  if (focus.selectedId && t.id === focus.selectedId) return true;
  if (focus.armyTerritoryIds.has(t.id) && owner && owner !== "neutral") {
    return true;
  }
  return false;
}

/** Neighbors that aren't the selection itself get a single compact badge. */
export function forceCompactUnitChrome(
  t: TerritoryDef,
  ts: TerritoryState | undefined,
  focus: MapChromeFocus,
): boolean {
  if (!ts) return false;
  if (focus.selectedId && t.id === focus.selectedId) return false;
  if (focus.humanId && ts.owner === focus.humanId) return false;
  return focus.selectedNeighbors.has(t.id);
}
