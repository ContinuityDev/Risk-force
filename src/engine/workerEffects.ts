/**
 * Data-driven staffing effects shown in Workers / Info panels and applied
 * in economy, training, and defense math.
 */

import { getBuilding, isTrainingBuilding } from "../data/buildings";
import { GAME_LOOP } from "../data/gameLoop";
import type { BuildingDef } from "../data/types";
import type { PlacedBuilding } from "./state";

/** Local copy to avoid a circular import with training.ts. */
function workerCapForBuilding(buildingId: string): number {
  try {
    const def = getBuilding(buildingId);
    const cat = def.category;
    if (cat === "economy") return GAME_LOOP.workers.economyCap;
    if (cat === "defense") return GAME_LOOP.workers.defenseCap;
    if (cat === "command" || cat === "research") {
      return GAME_LOOP.workers.commandCap;
    }
    if (def.produces?.length) return GAME_LOOP.workers.defaultCap + 1;
  } catch {
    /* */
  }
  return GAME_LOOP.workers.defaultCap;
}

function staffingMultiplier(assigned: number, cap: number): number {
  const a = Math.max(0, Math.min(assigned, cap));
  return 1 + GAME_LOOP.workers.outputBonusPerWorker * a;
}

export type WorkerEffectKind =
  | "output"
  | "research"
  | "training"
  | "defense"
  | "build";

export interface WorkerEffectSummary {
  kind: WorkerEffectKind;
  /** Short label e.g. "+30% research" or "−20% train time". */
  label: string;
  /** Multiplier applied (≥1 for bonuses, ≤1 for faster training). */
  mult: number;
  assigned: number;
  cap: number;
}

export function workerEffectForBuilding(
  buildingId: string,
  assigned: number,
): WorkerEffectSummary {
  const cap = workerCapForBuilding(buildingId);
  const a = Math.max(0, Math.min(assigned, cap));
  const mult = staffingMultiplier(a, cap);
  const pct = Math.round((mult - 1) * 100);
  let def: BuildingDef | null = null;
  try {
    def = getBuilding(buildingId);
  } catch {
    /* */
  }
  if (!def) {
    return {
      kind: "output",
      label: `${a}/${cap} workers: +${pct}% output`,
      mult,
      assigned: a,
      cap,
    };
  }

  if (def.output?.research && !def.output.energy && !def.output.alloy) {
    return {
      kind: "research",
      label: `${a}/${cap} workers: +${pct}% research`,
      mult,
      assigned: a,
      cap,
    };
  }
  if (def.category === "research" || def.id === "command_nexus") {
    return {
      kind: "research",
      label: `${a}/${cap} workers: +${pct}% research`,
      mult,
      assigned: a,
      cap,
    };
  }
  if (isTrainingBuilding(def)) {
    // Faster training: each worker shaves outputBonusPerWorker off duration.
    const speed = Math.max(0.45, 1 / mult);
    const faster = Math.round((1 - speed) * 100);
    return {
      kind: "training",
      label: `${a}/${cap} workers: −${faster}% train time`,
      mult: speed,
      assigned: a,
      cap,
    };
  }
  if (def.category === "defense" || def.damage) {
    return {
      kind: "defense",
      label: `${a}/${cap} workers: +${pct}% defense`,
      mult,
      assigned: a,
      cap,
    };
  }
  if (def.output) {
    const keys = Object.keys(def.output);
    const tip =
      keys.length === 1 ? keys[0]! : keys.includes("energy") ? "energy" : "output";
    return {
      kind: "output",
      label: `${a}/${cap} workers: +${pct}% ${tip}`,
      mult,
      assigned: a,
      cap,
    };
  }
  return {
    kind: "build",
    label: `${a}/${cap} workers: +${pct}% ops`,
    mult,
    assigned: a,
    cap,
  };
}

/** Training duration multiplier from the best staffed producer of this unit. */
export function trainingStaffSpeedMult(
  buildings: PlacedBuilding[],
  unitId: string,
): number {
  let best = 1;
  for (const b of buildings) {
    if (b.buildRemaining > 0 || b.hp <= 0) continue;
    let def: BuildingDef;
    try {
      def = getBuilding(b.buildingId);
    } catch {
      continue;
    }
    if (!def.produces?.includes(unitId)) continue;
    const effect = workerEffectForBuilding(b.buildingId, b.workers ?? 0);
    if (effect.kind === "training") best = Math.min(best, effect.mult);
  }
  return best;
}

/** Extra fortification from staffed defense buildings. */
export function staffedDefenseBonus(buildings: PlacedBuilding[]): number {
  let bonus = 0;
  for (const b of buildings) {
    if (b.buildRemaining > 0 || b.hp <= 0) continue;
    let def: BuildingDef;
    try {
      def = getBuilding(b.buildingId);
    } catch {
      continue;
    }
    if (def.category !== "defense" && !def.damage) continue;
    const effect = workerEffectForBuilding(b.buildingId, b.workers ?? 0);
    // Convert staffing mult into a soft incoming-damage reduction stack.
    bonus +=
      GAME_LOOP.combat.fortificationBuildingBonus *
      Math.max(0, effect.mult - 1) *
      2.2;
  }
  return bonus;
}
