import { GAME_LOOP } from "../data/gameLoop";
import { getBuilding } from "../data/buildings";
import { getUnit } from "../data/units";
import type { PlayerState, TerritoryState, TrainingJob } from "./state";
import { canAfford, spend } from "./economy";
import { isUnlocked } from "./research";

export function workerCapForBuilding(buildingId: string): number {
  try {
    const cat = getBuilding(buildingId).category;
    if (cat === "economy") return GAME_LOOP.workers.economyCap;
    if (cat === "defense") return GAME_LOOP.workers.defenseCap;
    if (cat === "command") return GAME_LOOP.workers.commandCap;
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
  const cost = {
    energy: Math.ceil(def.cost.energy * cfg.energyMult) * count,
    alloy: Math.ceil((def.cost.alloy ?? 0) * cfg.alloyMult) * count,
  };
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
  const def = getUnit(unitId);
  const spent = spend(player, {
    energy: Math.ceil(def.cost.energy * cfg.energyMult) * count,
    alloy: Math.ceil((def.cost.alloy ?? 0) * cfg.alloyMult) * count,
  });
  const job: TrainingJob = {
    id: `tru-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: "unit",
    unitId,
    count,
    turnsRemaining: unitTrainTurns(unitId),
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
    const queue: TrainingJob[] = [];
    for (const job of ts.trainingQueue) {
      const rem = job.turnsRemaining - 1;
      if (rem <= 0) {
        if (job.kind === "worker") workers += job.count;
        else if (job.unitId) {
          garrison[job.unitId] = (garrison[job.unitId] ?? 0) + job.count;
        }
      } else {
        queue.push({ ...job, turnsRemaining: rem });
      }
    }
    next[tid] = { ...ts, workers, garrison, trainingQueue: queue };
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
