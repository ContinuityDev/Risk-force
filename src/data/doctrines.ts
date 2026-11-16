import type { UnitRole } from "./types";

/** Strategic opening doctrine — picked in lobby, shapes costs/stats/tech. */
export type DoctrineId = "vanguard" | "ironclad" | "skyborne" | "spectre";

export interface DoctrineRoleMod {
  /** Multiplier on train/build unit cost (energy+alloy). */
  cost?: number;
  damage?: number;
  maxHp?: number;
  speed?: number;
}

export interface DoctrineDef {
  id: DoctrineId;
  name: string;
  tagline: string;
  /** Opening researched node ids. */
  openingTech: string[];
  /** Preferred starter garrison extras (unitId → count). */
  openingGarrison?: Record<string, number>;
  roleMods: Partial<Record<UnitRole, DoctrineRoleMod>>;
  /** Accent used in HUD chrome. */
  accent: string;
}

export const DOCTRINES: Record<DoctrineId, DoctrineDef> = {
  vanguard: {
    id: "vanguard",
    name: "Vanguard",
    tagline: "Cheap infantry & jumpjets — swarm the line.",
    openingTech: ["infantry_doctrine", "mech_corps", "spec_ops"],
    openingGarrison: { trooper: 2, power_trooper: 1 },
    roleMods: {
      infantry: { cost: 0.78, speed: 1.12, damage: 1.05 },
      air: { cost: 0.92, speed: 1.08 },
      armor: { cost: 1.12 },
    },
    accent: "#7ec8a0",
  },
  ironclad: {
    id: "ironclad",
    name: "Ironclad",
    tagline: "Armor & mechs — grind forward under plate.",
    openingTech: ["infantry_doctrine", "mech_corps", "grav_armor"],
    openingGarrison: { assault_mech: 1, hover_tank: 1 },
    roleMods: {
      armor: { cost: 0.82, maxHp: 1.15, damage: 1.08 },
      artillery: { cost: 0.9, damage: 1.1 },
      infantry: { cost: 1.08, maxHp: 1.05 },
      air: { cost: 1.15 },
    },
    accent: "#c4a574",
  },
  skyborne: {
    id: "skyborne",
    name: "Skyborne",
    tagline: "Air & dropships — jump the theater.",
    openingTech: ["infantry_doctrine", "nano_industry", "drone_swarm"],
    openingGarrison: { drone: 2, trooper: 1 },
    roleMods: {
      air: { cost: 0.8, speed: 1.18, damage: 1.06 },
      orbital: { cost: 0.92 },
      armor: { cost: 1.12, speed: 0.92 },
      naval: { cost: 1.05 },
    },
    accent: "#7eb6d8",
  },
  spectre: {
    id: "spectre",
    name: "Spectre",
    tagline: "Cyber, EMP & stealth — blind the enemy.",
    openingTech: ["infantry_doctrine", "cyber_doctrine", "spec_ops"],
    openingGarrison: { stealth_operative: 1, trooper: 2 },
    roleMods: {
      cyber: { cost: 0.78, damage: 1.15 },
      infantry: { cost: 0.95, speed: 1.06 },
      armor: { cost: 1.1 },
      orbital: { cost: 0.95, damage: 1.08 },
    },
    accent: "#a88ad0",
  },
};

export const DOCTRINE_LIST: DoctrineDef[] = Object.values(DOCTRINES);

export function getDoctrine(id: DoctrineId | undefined | null): DoctrineDef {
  return DOCTRINES[id ?? "vanguard"] ?? DOCTRINES.vanguard;
}

/** Stable AI doctrine picks so factions feel distinct. */
export const AI_DOCTRINE_BY_FACTION: Record<string, DoctrineId> = {
  faction_a: "ironclad",
  faction_b: "skyborne",
  faction_c: "spectre",
  player: "vanguard",
};
