import { CIVIL_WAR } from "./civilWar";
import type { MapId, MapMeta, MapPack } from "./types";
import { MAP_IDS } from "./types";
import { WORLD_WAR } from "./worldWar";

const PACKS: Record<MapId, MapPack> = {
  world_war: WORLD_WAR,
  civil_war: CIVIL_WAR,
};

export function getMapPack(id: MapId | string | undefined | null): MapPack {
  if (id && id in PACKS) return PACKS[id as MapId];
  return WORLD_WAR;
}

export function listMaps(): MapMeta[] {
  return MAP_IDS.map((id) => PACKS[id]!.meta);
}

export { MAP_IDS, PACKS };
