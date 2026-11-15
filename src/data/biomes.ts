/**
 * Territory biomes inferred from geography (label lat/lon proxies + flags).
 * Equirectangular viewBox 0 0 1000 500 → y≈0 north pole, y≈250 equator.
 */

import type { TerritoryDef } from "./types";
import { TERRITORIES } from "./map/territories";

export type BiomeId =
  | "plains"
  | "urban"
  | "mountain"
  | "desert"
  | "arctic"
  | "jungle"
  | "coastal";

export interface BiomeMods {
  /** Multiplier on damage dealt while fighting here (attacker & defender fire). */
  damageDealt: number;
  /** Multiplier on damage received by defenders (entrenchment-friendly biomes < 1). */
  defenderIncoming: number;
  /** Travel time multiplier when destination has this biome. */
  travelMult: number;
  label: string;
}

export const BIOME_MODS: Record<BiomeId, BiomeMods> = {
  plains: {
    damageDealt: 1,
    defenderIncoming: 1,
    travelMult: 1,
    label: "Plains",
  },
  urban: {
    damageDealt: 0.95,
    defenderIncoming: 0.85,
    travelMult: 1.1,
    label: "Urban",
  },
  mountain: {
    damageDealt: 0.9,
    defenderIncoming: 0.75,
    travelMult: 1.45,
    label: "Mountain",
  },
  desert: {
    damageDealt: 1.05,
    defenderIncoming: 1.05,
    travelMult: 1.2,
    label: "Desert",
  },
  arctic: {
    damageDealt: 0.92,
    defenderIncoming: 0.9,
    travelMult: 1.35,
    label: "Arctic",
  },
  jungle: {
    damageDealt: 0.88,
    defenderIncoming: 0.82,
    travelMult: 1.4,
    label: "Jungle",
  },
  coastal: {
    damageDealt: 1,
    defenderIncoming: 0.95,
    travelMult: 1.05,
    label: "Coastal",
  },
};

const URBAN_IDS = new Set([
  "usa_east",
  "usa_central",
  "usa_west",
  "uk",
  "france",
  "germany",
  "italy",
  "spain",
  "japan",
  "korea",
  "china_east",
  "india",
  "brazil_south",
  "egypt",
  "turkey",
]);

const MOUNTAIN_IDS = new Set([
  "afghanistan",
  "nepal",
  "switzerland",
  "peru",
  "bolivia",
  "chile",
  "tibet",
  "caucasus",
  "norway",
  "iran",
  "pakistan",
]);

const DESERT_IDS = new Set([
  "algeria",
  "libya",
  "egypt",
  "sudan",
  "saudi_arabia",
  "iraq",
  "iran",
  "australia_west",
  "namibia",
  "mali",
  "niger",
  "chad",
  "mauritania",
  "w_sahara",
  "mongolia",
]);

/** Infer biome for a territory (deterministic, no hand-authored table required). */
export function inferBiome(tdef: TerritoryDef): BiomeId {
  const y = tdef.label.y;
  const latApprox = 90 - (y / 500) * 180; // +90N … −90S
  if (Math.abs(latApprox) >= 60) return "arctic";
  if (URBAN_IDS.has(tdef.id) || tdef.area > 0.08) {
    if (URBAN_IDS.has(tdef.id)) return "urban";
  }
  if (MOUNTAIN_IDS.has(tdef.id)) return "mountain";
  if (DESERT_IDS.has(tdef.id)) return "desert";
  if (Math.abs(latApprox) < 18 && tdef.continent !== "Europe") return "jungle";
  if (tdef.coastal) return "coastal";
  if (URBAN_IDS.has(tdef.id)) return "urban";
  return "plains";
}

const CACHE = new Map<string, BiomeId>();

export function getBiome(territoryId: string): BiomeId {
  const hit = CACHE.get(territoryId);
  if (hit) return hit;
  const tdef = TERRITORIES.find((t) => t.id === territoryId);
  const biome = tdef ? inferBiome(tdef) : "plains";
  CACHE.set(territoryId, biome);
  return biome;
}

export function biomeLabel(territoryId: string): string {
  return BIOME_MODS[getBiome(territoryId)].label;
}
