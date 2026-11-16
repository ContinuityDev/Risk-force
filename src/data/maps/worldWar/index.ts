import { CONTINENT_BONUSES } from "../../continents";
import {
  LAND_PATH,
  OCEAN_VIEW,
  SEA_ROUTES,
} from "../../map/earthPaths";
import { EARTH_TERRITORIES } from "../../map/territories";
import type { MapPack } from "../types";

/** Existing Earth theater — unchanged geometry. */
export const WORLD_WAR: MapPack = {
  meta: {
    id: "world_war",
    name: "World War",
    tagline: "Earth theater — continents and sea lanes.",
    preview: "maps/world-war-preview.svg",
  },
  viewBox: { ...OCEAN_VIEW },
  territories: EARTH_TERRITORIES,
  landPath: LAND_PATH,
  seaRoutes: [...SEA_ROUTES],
  continents: { ...CONTINENT_BONUSES },
};
