import { GAME_LOOP } from "../data/gameLoop";
import { getBuilding } from "../data/buildings";
import { getUnit } from "../data/units";
import { applyDoctrineUnitCost } from "./doctrine";
import type { PlayerState, TerritoryState, TrainingJob } from "./state";
import { canAfford, spend } from "./economy";
import { syncHpArray } from "./garrisonHp";
import { isUnlocked } from "./research";
import { trainingStaffSpeedMult } from "./workerEffects";

export function workerCapForBuilding(buildingId: string): number {
  try {
    const def = getBuilding(buildingId);
    const cat = def.category;
    if (cat === "economy") return GAME_LOOP.workers.economyCap;
    if (cat === "defense") return GAME_LOOP.workers.defenseCap;
    if (cat === "command" || cat === "research") return GAME_LOOP.workers.commandCap;
    // Barracks / factories / airfields — staff for faster training.
    if (def.produces?.length) return GAME_LOOP.workers.defaultCap + 1;
  } catch {
    /* */
  }
  return GAME_LOOP.workers.defaultCap;
}

export function staffingMultiplier(assigned: number, cap: number): number {
  const a = Math.max(0, Math.min(assigned, cap));
  return 1 + GAME_LOOP.workers.outputBonusPerWorker * a;
}

export function canQueueWorker(
  player: PlayerState,
  ts: TerritoryState,
  count: number,
): { ok: true } | { ok: false; reason: string } {
  if (count < 1) return { ok: false, reason: "Invalid count." };
  const cfg = GAME_LOOP.training.worker;
  if (ts.population < cfg.popCost * count) {
    return { ok: false, reason: "Not enough population." };
  }
  const cost = {
    energy: cfg.energy * count,
    alloy: cfg.alloy * count,
  };
  if (!canAfford(player, cost)) return { ok: false, reason: "Insufficient resources." };
  return { ok: true };
}

/** Territory has a completed building that lists this unit in `produces`. */
export function hasProducerBuilding(
  ts: TerritoryState,
  unitId: string,
): boolean {
  return ts.buildings.some((b) => {
    if (b.buildRemaining > 0 || b.hp <= 0) return false;
    try {
      const def = getBuilding(b.buildingId);
      return !!def.produces?.includes(unitId);
    } catch {
      return false;
    }
  });
}

export function unitTrainCost(
  unitId: string,
  count: number,
  player?: PlayerState,
): {
  energy: number;
  alloy: number;
  supply: number;
  research: number;
} {
  const cfg = GAME_LOOP.training.unit;
  const def = getUnit(unitId);
  const base = {
    energy: Math.ceil(def.cost.energy * cfg.energyMult) * count,
    alloy: Math.ceil((def.cost.alloy ?? 0) * cfg.alloyMult) * count,
    supply: Math.ceil((def.cost.supply ?? 0) * count),
    research: Math.ceil((def.cost.research ?? 0) * count),
  };
  return player ? applyDoctrineUnitCost(player, unitId, base) : base;
}

export function canQueueUnit(
  player: PlayerState,
  ts: TerritoryState,
  unitId: string,
  count: number,
): { ok: true } | { ok: false; reason: string } {
  if (count < 1) return { ok: false, reason: "Invalid count." };
  if (unitId !== GAME_LOOP.training.basicUnitId && !isUnlocked(player, unitId)) {
    return { ok: false, reason: "Unit locked — research required." };
  }
  if (!hasProducerBuilding(ts, unitId)) {
    return {
      ok: false,
      reason: "Need a completed training building that produces this unit.",
    };
  }
  const cfg = GAME_LOOP.training.unit;
  if (ts.population < cfg.popCost * count) {
    return { ok: false, reason: "Not enough population." };
  }
  let def;
  try {
    def = getUnit(unitId);
  } catch {
    return { ok: false, reason: "Unknown unit." };
  }
  void def;
  const cost = unitTrainCost(unitId, count, player);
  if (!canAfford(player, cost)) return { ok: false, reason: "Insufficient resources." };
  return { ok: true };
}

export function unitTrainTurns(unitId: string): number {
  const cfg = GAME_LOOP.training.unit;
  try {
    const def = getUnit(unitId);
    return Math.max(
      1,
      cfg.turnsBase + Math.floor(def.cost.energy / 100) * cfg.turnsPer100Energy,
    );
  } catch {
    return cfg.turnsBase;
  }
}

export function enqueueWorker(
  player: PlayerState,
  ts: TerritoryState,
  count: number,
): { player: PlayerState; territory: TerritoryState } | null {
  const check = canQueueWorker(player, ts, count);
  if (!check.ok) return null;
  const cfg = GAME_LOOP.training.worker;
  const spent = spend(player, {
    energy: cfg.energy * count,
    alloy: cfg.alloy * count,
  });
  const job: TrainingJob = {
    id: `trw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: "worker",
    count,
    turnsRemaining: cfg.turns,
  };
  return {
    player: spent,
    territory: {
      ...ts,
      population: ts.population - cfg.popCost * count,
      trainingQueue: [...ts.trainingQueue, job],
    },
  };
}

export function enqueueUnit(
  player: PlayerState,
  ts: TerritoryState,
  unitId: string,
  count: number,
): { player: PlayerState; territory: TerritoryState } | null {
  const check = canQueueUnit(player, ts, unitId, count);
  if (!check.ok) return null;
  const cfg = GAME_LOOP.training.unit;
  const cost = unitTrainCost(unitId, count, player);
  const spent = spend(player, cost);
  const staffMult = trainingStaffSpeedMult(ts.buildings, unitId);
  const turns = Math.max(1, Math.ceil(unitTrainTurns(unitId) * staffMult));
  const job: TrainingJob = {
    id: `tru-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: "unit",
    unitId,
    count,
    turnsRemaining: turns,
  };
  return {
    player: spent,
    territory: {
      ...ts,
      population: ts.population - cfg.popCost * count,
      trainingQueue: [...ts.trainingQueue, job],
    },
  };
}

/** Advance training queues by one turn for a player's territories. */
export function tickTraining(
  territories: Record<string, TerritoryState>,
  playerId: string,
): Record<string, TerritoryState> {
  const next = { ...territories };
  for (const [tid, ts] of Object.entries(territories)) {
    if (ts.owner !== playerId || !ts.trainingQueue.length) continue;
    let workers = ts.workers;
    const garrison = { ...ts.garrison };
    const garrisonHp = { ...(ts.garrisonHp ?? {}) };
    const queue: TrainingJob[] = [];
    for (const job of ts.trainingQueue) {
      const rem = job.turnsRemaining - 1;
      if (rem <= 0) {
        if (job.kind === "worker") workers += job.count;
        else if (job.unitId) {
          garrison[job.unitId] = (garrison[job.unitId] ?? 0) + job.count;
          const fresh = syncHpArray(job.unitId, job.count);
          garrisonHp[job.unitId] = [
            ...(garrisonHp[job.unitId] ?? []),
            ...fresh,
          ];
        }
      } else {
        queue.push({ ...job, turnsRemaining: rem });
      }
    }
    next[tid] = { ...ts, workers, garrison, garrisonHp, trainingQueue: queue };
  }
  return next;
}

export function assignBuildingWorkers(
  ts: TerritoryState,
  instanceId: string,
  workers: number,
): TerritoryState | null {
  const b = ts.buildings.find((x) => x.instanceId === instanceId);
  if (!b || b.buildRemaining > 0) return null;
  const cap = workerCapForBuilding(b.buildingId);
  const want = Math.max(0, Math.min(cap, Math.floor(workers)));
  const currentlyAssigned = ts.buildings.reduce((s, x) => s + x.workers, 0);
  const free = ts.workers - currentlyAssigned + b.workers;
  const assigned = Math.min(want, Math.max(0, free));
  return {
    ...ts,
    buildings: ts.buildings.map((x) =>
      x.instanceId === instanceId ? { ...x, workers: assigned } : x,
    ),
  };
}
