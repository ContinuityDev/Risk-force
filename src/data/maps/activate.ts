import { CONTINENT_BONUSES, CONTINENT_LIST } from "../continents";
import { clearBiomeCache, setBiomeOverrides } from "../biomes";
import {
  setLandPath,
  setOceanView,
  SEA_ROUTES,
} from "../map/earthPaths";
import { setAbbrevOverrides } from "../map/abbreviations";
import {
  rebuildTerritoryIndex,
  replaceTerritories,
} from "../map/territories";
import { getMapPack } from "./registry";
import type { MapId, MapPack } from "./types";

let activeId: MapId = "world_war";
let activePack: MapPack = getMapPack("world_war");

/**
 * Swap the live map pack used by engine/UI modules.
 * Mutates shared exports in place so existing imports stay valid.
 */
export function activateMap(id: MapId | string | undefined | null): MapPack {
  const pack = getMapPack(id);
  activeId = pack.meta.id;
  activePack = pack;

  replaceTerritories(pack.territories);
  rebuildTerritoryIndex();

  for (const key of Object.keys(CONTINENT_BONUSES)) {
    delete CONTINENT_BONUSES[key];
  }
  Object.assign(CONTINENT_BONUSES, pack.continents);
  CONTINENT_LIST.length = 0;
  CONTINENT_LIST.push(...Object.values(CONTINENT_BONUSES));

  SEA_ROUTES.length = 0;
  SEA_ROUTES.push(...pack.seaRoutes);

  setLandPath(pack.landPath);
  setOceanView(pack.viewBox.w, pack.viewBox.h);

  setBiomeOverrides(pack.biomes ?? null);
  clearBiomeCache();
  setAbbrevOverrides(pack.abbreviations ?? null);

  return pack;
}

export function activeMapId(): MapId {
  return activeId;
}

export function activeMap(): MapPack {
  return activePack;
}
