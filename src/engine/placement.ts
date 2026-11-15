import { getBuilding } from "../data/buildings";
import { getTerritory } from "../data/map/territories";
import type { PlayerState, TerritoryState } from "./state";
import { isUnlocked } from "./research";

export function cellsOccupied(
  buildings: TerritoryState["buildings"],
): Set<string> {
  const cells = new Set<string>();
  for (const b of buildings) {
    const def = getBuilding(b.buildingId);
    for (let dy = 0; dy < def.size.h; dy++) {
      for (let dx = 0; dx < def.size.w; dx++) {
        cells.add(`${b.x + dx},${b.y + dy}`);
      }
    }
  }
  return cells;
}

export function canPlaceBuilding(
  territory: TerritoryState,
  territoryId: string,
  buildingId: string,
  x: number,
  y: number,
  player: PlayerState,
): { ok: true } | { ok: false; reason: string } {
  if (buildingId === "command_nexus") {
    if (territory.buildings.some((b) => b.buildingId === "command_nexus")) {
      return { ok: false, reason: "Command Nexus already present." };
    }
  } else if (!isUnlocked(player, buildingId)) {
    return { ok: false, reason: "Research required." };
  }
  const def = getBuilding(buildingId);
  const tdef = getTerritory(territoryId);
  if ((def.category === "naval" || buildingId.includes("coastal")) && !tdef.coastal) {
    return { ok: false, reason: "Requires a coastal territory." };
  }
  const grid = tdef.grid;
  if (x < 0 || y < 0 || x + def.size.w > grid.cols || y + def.size.h > grid.rows) {
    return { ok: false, reason: "Outside base grid." };
  }
  const occupied = cellsOccupied(territory.buildings);
  for (let dy = 0; dy < def.size.h; dy++) {
    for (let dx = 0; dx < def.size.w; dx++) {
      if (occupied.has(`${x + dx},${y + dy}`)) {
        return { ok: false, reason: "Tile occupied." };
      }
    }
  }
  return { ok: true };
}
