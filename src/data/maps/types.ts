import type { ContinentBonus } from "../continents";
import type { BiomeId } from "../biomes";
import type { TerritoryDef } from "../types";

export type MapId = "world_war" | "civil_war";

export interface MapMeta {
  id: MapId;
  name: string;
  tagline: string;
  /** Preview thumbnail under public/ (resolved with Vite base). */
  preview: string;
}

export interface MapPack {
  meta: MapMeta;
  viewBox: { w: number; h: number };
  territories: TerritoryDef[];
  landPath: string;
  seaRoutes: { d: string }[];
  continents: Record<string, ContinentBonus>;
  /** Optional per-territory biome overrides (Civil War). */
  biomes?: Record<string, BiomeId>;
  /** Short labels at world zoom (e.g. state postal codes). */
  abbreviations?: Record<string, string>;
}

export const MAP_IDS: MapId[] = ["world_war", "civil_war"];
