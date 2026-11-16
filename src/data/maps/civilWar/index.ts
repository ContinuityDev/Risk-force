import type { MapPack } from "../types";
import { CIVIL_WAR_CONTINENTS } from "./continents";
import { CIVIL_WAR_ABBREV, CIVIL_WAR_BIOMES } from "./meta";
import {
  CIVIL_WAR_LAND_PATH,
  CIVIL_WAR_SEA_ROUTES,
  CIVIL_WAR_VIEW,
} from "./paths";
import { CIVIL_WAR_TERRITORIES } from "./territories";

export const CIVIL_WAR: MapPack = {
  meta: {
    id: "civil_war",
    name: "Civil War",
    tagline: "Fifty states. One republic. Total conquest.",
    preview: "maps/civil-war-preview.svg",
  },
  viewBox: CIVIL_WAR_VIEW,
  territories: CIVIL_WAR_TERRITORIES,
  landPath: CIVIL_WAR_LAND_PATH,
  seaRoutes: CIVIL_WAR_SEA_ROUTES,
  continents: CIVIL_WAR_CONTINENTS,
  biomes: CIVIL_WAR_BIOMES,
  abbreviations: CIVIL_WAR_ABBREV,
};

export { CIVIL_WAR_POP_WEIGHT } from "./territories";
