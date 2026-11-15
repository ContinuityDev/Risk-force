/**
 * Persistent per-unit HP for garrisons and transit forces.
 * Garrison counts stay as Record<string, number>; parallel garrisonHp
 * arrays hold current HP (length === count). Missing arrays = full HP.
 */

import { getUnit } from "../data/units";
import type { StrikeForceSlot, TerritoryState } from "./state";

export function maxHpFor(unitId: string): number {
  try {
    return getUnit(unitId).maxHp;
  } catch {
    return 40;
  }
}

/** Ensure HP array length matches count; fill missing slots at maxHp. */
export function syncHpArray(
  unitId: string,
  count: number,
  existing?: number[],
): number[] {
  const max = maxHpFor(unitId);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const v = existing?.[i];
    out.push(
      v === undefined || !Number.isFinite(v)
        ? max
        : Math.max(1, Math.min(max, Math.round(v))),
    );
  }
  return out;
}

export function ensureTerritoryHp(ts: TerritoryState): TerritoryState {
  const garrisonHp: Record<string, number[]> = { ...(ts.garrisonHp ?? {}) };
  let changed = false;
  for (const [unitId, count] of Object.entries(ts.garrison ?? {})) {
    if (count <= 0) {
      if (garrisonHp[unitId]) {
        delete garrisonHp[unitId];
        changed = true;
      }
      continue;
    }
    const cur = garrisonHp[unitId];
    if (!cur || cur.length !== count) {
      garrisonHp[unitId] = syncHpArray(unitId, count, cur);
      changed = true;
    }
  }
  for (const unitId of Object.keys(garrisonHp)) {
    if (!(ts.garrison?.[unitId] > 0)) {
      delete garrisonHp[unitId];
      changed = true;
    }
  }
  return changed ? { ...ts, garrisonHp } : ts;
}

/** Normalize a strike force so every slot has an hps array. */
export function normalizeForce(force: StrikeForceSlot[]): StrikeForceSlot[] {
  return force
    .filter((s) => s.count > 0)
    .map((s) => ({
      unitId: s.unitId,
      count: s.count,
      hps: syncHpArray(s.unitId, s.count, s.hps),
    }));
}

/**
 * Pull `count` units of `unitId` from a territory (prefer most-damaged first
 * so healthier troops stay home). Returns HP list taken.
 */
export function takeFromGarrison(
  ts: TerritoryState,
  unitId: string,
  count: number,
): { territory: TerritoryState; hps: number[] } | null {
  const have = ts.garrison[unitId] ?? 0;
  if (count <= 0 || have < count) return null;
  const ensured = ensureTerritoryHp(ts);
  const pool = [...(ensured.garrisonHp[unitId] ?? syncHpArray(unitId, have))];
  // Prefer shipping damaged units into battle / away.
  pool.sort((a, b) => a - b);
  const hps = pool.splice(0, count);
  const garrison = { ...ensured.garrison };
  const left = have - count;
  if (left <= 0) delete garrison[unitId];
  else garrison[unitId] = left;
  const garrisonHp = { ...ensured.garrisonHp };
  if (left <= 0) delete garrisonHp[unitId];
  else garrisonHp[unitId] = pool;
  return {
    territory: { ...ensured, garrison, garrisonHp },
    hps,
  };
}

/** Merge returning / arriving units into a garrison, preserving HP. */
export function mergeIntoGarrison(
  ts: TerritoryState,
  force: StrikeForceSlot[],
): TerritoryState {
  let cur = ensureTerritoryHp(ts);
  const garrison = { ...cur.garrison };
  const garrisonHp = { ...cur.garrisonHp };
  for (const slot of normalizeForce(force)) {
    garrison[slot.unitId] = (garrison[slot.unitId] ?? 0) + slot.count;
    garrisonHp[slot.unitId] = [
      ...(garrisonHp[slot.unitId] ?? []),
      ...slot.hps!,
    ];
  }
  return { ...cur, garrison, garrisonHp };
}

/** Damage dealt scales with remaining HP fraction (floor 35%). */
export function damageScaleFromHp(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 1;
  return Math.max(0.35, Math.min(1, hp / maxHp));
}

/** Heal garrison units by `amount` HP each (Repair Bay / field repair). */
export function healGarrison(
  ts: TerritoryState,
  amount: number,
): TerritoryState {
  if (amount <= 0) return ts;
  const ensured = ensureTerritoryHp(ts);
  const garrisonHp: Record<string, number[]> = {};
  let changed = false;
  for (const [unitId, count] of Object.entries(ensured.garrison)) {
    if (count <= 0) continue;
    const max = maxHpFor(unitId);
    const cur = ensured.garrisonHp[unitId] ?? syncHpArray(unitId, count);
    const next = cur.map((hp) => {
      const healed = Math.min(max, hp + amount);
      if (healed !== hp) changed = true;
      return healed;
    });
    garrisonHp[unitId] = next;
  }
  return changed ? { ...ensured, garrisonHp } : ensured;
}

/** Build StrikeForceSlot[] with HP from a territory's garrison counts. */
export function forceFromGarrisonCounts(
  ts: TerritoryState,
  counts: Record<string, number>,
): StrikeForceSlot[] {
  const ensured = ensureTerritoryHp(ts);
  const out: StrikeForceSlot[] = [];
  for (const [unitId, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    const pool = [
      ...(ensured.garrisonHp[unitId] ??
        syncHpArray(unitId, ensured.garrison[unitId] ?? count)),
    ];
    pool.sort((a, b) => a - b);
    out.push({
      unitId,
      count,
      hps: pool.slice(0, count),
    });
  }
  return out;
}

/** Tally alive battle units into force slots with remaining HP. */
export function forceFromBattleUnits(
  units: { unitId: string; hp: number; alive: boolean; side: string }[],
  side: "attacker" | "defender",
): StrikeForceSlot[] {
  const buckets: Record<string, number[]> = {};
  for (const u of units) {
    if (!u.alive || u.side !== side) continue;
    (buckets[u.unitId] ??= []).push(Math.max(1, Math.round(u.hp)));
  }
  return Object.entries(buckets).map(([unitId, hps]) => ({
    unitId,
    count: hps.length,
    hps,
  }));
}
