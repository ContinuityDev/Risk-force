/** Shared schema for data-driven units, buildings, research, and combat. */

export type ResourceId = "energy" | "alloy" | "research" | "supply";

/** Engine ids — display names live in data/factions.ts */
export type FactionId =
  | "player"
  | "faction_a"
  | "faction_b"
  | "faction_c"
  | "neutral";

export type DamageType =
  | "kinetic"
  | "energy"
  | "plasma"
  | "explosive"
  | "emp"
  | "missile";

export type ArmorType =
  | "light"
  | "medium"
  | "heavy"
  | "fortified"
  | "shielded"
  | "aircraft"
  | "naval";

export type UnitRole =
  | "infantry"
  | "armor"
  | "air"
  | "artillery"
  | "naval"
  | "orbital"
  | "cyber";

export type BuildingCategory =
  | "economy"
  | "defense"
  | "command"
  | "research"
  | "naval"
  | "orbital"
  | "support";

export type TargetPreference = "ground" | "air" | "naval" | "any";

export type ProjectileStyle =
  | "laser"
  | "plasma"
  | "rail"
  | "flak"
  | "missile"
  | "bolt"
  | "emp"
  | "torpedo"
  | "orbital";

export interface Cost {
  energy: number;
  alloy?: number;
  research?: number;
  supply?: number;
}

export interface SpriteRef {
  /** Key into the sprite registry (SVG asset id). */
  id: string;
  frameW: number;
  frameH: number;
}

export interface AnimClip {
  frames: number;
  fps: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  description: string;
  category: BuildingCategory;
  cost: Cost;
  buildTime: number;
  maxHp: number;
  size: { w: number; h: number };
  armorType: ArmorType;
  /** Present on armed defenses / combat structures. */
  damageType?: DamageType;
  /** Per-turn supply drain while this structure is online. */
  supplyUpkeep?: number;
  output?: Partial<Record<ResourceId, number>>;
  damage?: number;
  range?: number;
  fireRate?: number;
  targetPreference?: TargetPreference;
  projectile?: ProjectileStyle;
  requiresResearch?: string;
  sprite: SpriteRef;
  anims: {
    construction: AnimClip;
    idle: AnimClip;
    working?: AnimClip;
    firing?: AnimClip;
    destroyed: AnimClip;
  };
}

export interface UnitDef {
  id: string;
  name: string;
  description: string;
  role: UnitRole;
  cost: Cost;
  maxHp: number;
  damage: number;
  range: number;
  speed: number;
  fireRate: number;
  armorType: ArmorType;
  damageType: DamageType;
  /** Multipliers vs target armor (default 1 when omitted). */
  armorPierce?: Partial<Record<ArmorType, number>>;
  /** Population / logistics weight (typically 1–4). */
  supplyCost: number;
  targetPreference: TargetPreference;
  projectile?: ProjectileStyle;
  requiresResearch?: string;
  sprite: SpriteRef;
  anims: {
    idle: AnimClip;
    move: AnimClip;
    attack: AnimClip;
    hit: AnimClip;
    destroyed: AnimClip;
  };
}

export interface ResearchNodeDef {
  id: string;
  name: string;
  description: string;
  /** Tech tree branch for UI grouping and AI scoring. */
  branch: string;
  cost: number;
  prerequisites: string[];
  unlocks: string[];
}

export interface TerritoryDef {
  id: string;
  name: string;
  continent: string;
  /** SVG path on the world map viewBox (0 0 1000 520). */
  path: string;
  label: { x: number; y: number };
  neighbors: string[];
  startingOwner: FactionId;
  grid: { cols: number; rows: number };
  /** True if naval yards / coastal batteries can be sited here. */
  coastal: boolean;
}
