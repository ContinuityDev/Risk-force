/**
 * Zoom-aware unit / garrison minis on the world map.
 * World: one compact strength chip per territory.
 * Mid: up to 3 types + '+N' (compact on tiny plots).
 * Deep: multi-type grid ABOVE the label so it never overlaps
 * building clusters (which sit below labels).
 */

import type { TerritoryDef } from "../data/types";
import { getUnit } from "../data/units";
import type { ArmyTransit, TerritoryState } from "../engine/state";
import { getSpriteUrl } from "../sprites/registry";
import {
  iconWorldSize,
  isSmallPlot,
  mapMedianArea,
  miniZoomTier,
  type LabelBox,
  type MiniZoomTier,
} from "./buildingMinis";
import {
  claimInteriorCluster,
  claimInteriorSlot,
  getTerritoryAnchors,
  groundedOccupancyBox,
  labelKeepOutBox,
  marchLandPoint,
} from "./territoryAnchors";

export interface PlacedUnitMini {
  key: string;
  territoryId?: string;
  armyId?: string;
  unitId: string;
  spriteId: string;
  spriteUrl: string;
  x: number;
  y: number;
  size: number;
  count: number;
  /** Compact world-zoom: total troop badge. */
  compact?: boolean;
  more?: number;
  /** In-transit army along a march route. */
  transit?: boolean;
  owner?: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Prefer elite / heavy / high-count units in the mid shortlist. */
export function unitPriority(unitId: string, count: number): number {
  let def;
  try {
    def = getUnit(unitId);
  } catch {
    return count;
  }
  let score = count * 10;
  switch (def.role) {
    case "armor":
      score += 80;
      break;
    case "artillery":
      score += 70;
      break;
    case "air":
      score += 65;
      break;
    case "orbital":
      score += 75;
      break;
    case "infantry":
      score += 40;
      break;
    case "naval":
      score += 55;
      break;
    case "cyber":
      score += 50;
      break;
    default:
      score += 30;
  }
  score += Math.min(40, def.damage + def.maxHp / 20);
  if (def.requiresResearch) score += 15;
  return score;
}

function sortGarrison(
  garrison: Record<string, number>,
): Array<{ unitId: string; count: number }> {
  return Object.entries(garrison)
    .filter(([, c]) => c > 0)
    .map(([unitId, count]) => ({ unitId, count }))
    .sort(
      (a, b) =>
        unitPriority(b.unitId, b.count) - unitPriority(a.unitId, a.count) ||
        a.unitId.localeCompare(b.unitId),
    );
}

function toMini(
  key: string,
  unitId: string,
  count: number,
  x: number,
  y: number,
  size: number,
  extras: Partial<PlacedUnitMini> = {},
): PlacedUnitMini | null {
  let def;
  try {
    def = getUnit(unitId);
  } catch {
    return null;
  }
  return {
    key,
    unitId,
    spriteId: def.sprite.id,
    spriteUrl: getSpriteUrl(def.sprite.id),
    x,
    y,
    size,
    count,
    ...extras,
  };
}

/**
 * Layout garrison unit minis on interior land anchors (never on water).
 * `occupiedExtra` should include building mini boxes.
 */
export function layoutUnitMinis(
  territories: TerritoryDef[],
  territoryState: Record<string, TerritoryState>,
  zoomScale: number,
  cam: { x: number; y: number; w: number; h: number },
  labels: LabelBox[],
  occupiedExtra: Box[] = [],
  /** When set, only emit chrome for focused territories (declutter). */
  showTerritory?: (t: TerritoryDef, ts: TerritoryState | undefined) => boolean,
  /** When true, emit a single compact chip (neighbor neutrals). */
  wantCompact?: (t: TerritoryDef, ts: TerritoryState | undefined) => boolean,
): PlacedUnitMini[] {
  const tier: MiniZoomTier = miniZoomTier(zoomScale);
  const sizeScale = tier === "world" ? 0.62 : tier === "mid" ? 0.62 : 0.74;
  const size = iconWorldSize(zoomScale, cam.w, tier) * sizeScale;
  const gap = Math.max(0.55, size * 0.2);
  // Hard label keep-out — garrison chips clear the country name.
  const labelBoxes: Box[] = labels.map((l) => labelKeepOutBox(l, size));
  const occupied: Box[] = [...labelBoxes, ...occupiedExtra];
  const out: PlacedUnitMini[] = [];

  const ranked = [...territories].sort((a, b) => b.area - a.area);

  for (const t of ranked) {
    const ts = territoryState[t.id];
    if (showTerritory && !showTerritory(t, ts)) continue;
    const garrison = ts?.garrison ?? {};
    const sorted = sortGarrison(garrison);
    if (!sorted.length) continue;

    const pole = getTerritoryAnchors(t).pole;
    const isPlayer = ts?.owner && ts.owner !== "neutral";
    if (
      !isPlayer &&
      (pole.x < cam.x - 40 ||
        pole.x > cam.x + cam.w + 40 ||
        pole.y < cam.y - 40 ||
        pole.y > cam.y + cam.h + 40)
    ) {
      continue;
    }

    const total = sorted.reduce((s, u) => s + u.count, 0);
    const compactOnly = Boolean(wantCompact?.(t, ts));

    const placeCompact = (chipSize: number) => {
      const slot = claimInteriorSlot(t, chipSize, occupied, gap * 0.7);
      const pt = slot ?? (isPlayer ? { x: pole.x, y: pole.y + chipSize * 0.45 } : null);
      if (!pt) return false;
      occupied.push(groundedOccupancyBox(pt.x, pt.y, chipSize));
      const top = sorted[0]!;
      const m = toMini(
        `${t.id}:troops`,
        top.unitId,
        total,
        pt.x,
        pt.y,
        chipSize,
        { territoryId: t.id, compact: true, owner: ts?.owner },
      );
      if (m) out.push(m);
      return true;
    };

    if (tier === "world" || compactOnly) {
      if (!compactOnly) {
        const med = mapMedianArea();
        if (t.area < med * 0.45) continue;
        if (total <= 2 && t.area < med * 0.95) continue;
        if (zoomScale >= 0.88 && t.area < med * 0.65) continue;
      }
      placeCompact(size);
      continue;
    }

    const forceCompact =
      tier === "mid" && (isSmallPlot(t.area) || sorted.length === 1);
    if (forceCompact) {
      const chipSize = size * (isSmallPlot(t.area, 0.4) ? 0.75 : 0.85);
      placeCompact(chipSize);
      continue;
    }

    const maxShow =
      tier === "mid" ? Math.min(3, sorted.length) : Math.min(6, sorted.length);
    const shown = sorted.slice(0, maxShow);
    const moreCount = sorted.length - shown.length;
    const slotCount = shown.length + (moreCount > 0 ? 1 : 0);
    const centers = claimInteriorCluster(
      t,
      slotCount,
      size,
      occupied,
      gap * 0.5,
    );

    if (centers.length >= shown.length) {
      for (let i = 0; i < shown.length; i++) {
        const c = centers[i]!;
        const u = shown[i]!;
        occupied.push(groundedOccupancyBox(c.x, c.y, size));
        const m = toMini(
          `${t.id}:${u.unitId}`,
          u.unitId,
          u.count,
          c.x,
          c.y,
          size,
          { territoryId: t.id, owner: ts?.owner },
        );
        if (m) out.push(m);
      }
      if (moreCount > 0 && centers[shown.length]) {
        const c = centers[shown.length]!;
        const moreSize = size * 0.85;
        occupied.push(groundedOccupancyBox(c.x, c.y, moreSize));
        out.push({
          key: `${t.id}:more`,
          territoryId: t.id,
          unitId: "_more",
          spriteId: "",
          spriteUrl: "",
          x: c.x,
          y: c.y,
          size: moreSize,
          count: moreCount,
          more: moreCount,
          owner: ts?.owner,
        });
      }
      continue;
    }

    placeCompact(size * 0.85);
  }

  return out;
}

function isNavalOnlyForce(
  force: { unitId: string; count: number }[],
): boolean {
  if (!force.length) return false;
  return force.every((f) => {
    try {
      return getUnit(f.unitId).role === "naval";
    } catch {
      return false;
    }
  });
}

/** Place in-transit army minis on a land-safe march path (naval may cross water). */
export function layoutTransitUnitMinis(
  armies: ArmyTransit[],
  territories: TerritoryDef[],
  zoomScale: number,
  cam: { x: number; y: number; w: number; h: number },
): PlacedUnitMini[] {
  if (!armies.length) return [];
  const tier = miniZoomTier(zoomScale);
  const size = iconWorldSize(zoomScale, cam.w, tier) * 0.85;
  const byId = Object.fromEntries(territories.map((t) => [t.id, t]));
  const out: PlacedUnitMini[] = [];

  for (const army of armies) {
    const from = byId[army.fromId];
    const to = byId[army.toId];
    if (!from || !to) continue;
    const progress =
      1 - army.turnsRemaining / Math.max(1, army.totalTurns);
    const t = Math.min(0.85, 0.12 + progress * 0.7);
    const naval = isNavalOnlyForce(army.force);
    const pt = marchLandPoint(from, to, t, naval);
    if (
      pt.x < cam.x - 30 ||
      pt.x > cam.x + cam.w + 30 ||
      pt.y < cam.y - 30 ||
      pt.y > cam.y + cam.h + 30
    ) {
      continue;
    }
    const sorted = sortGarrison(
      Object.fromEntries(army.force.map((f) => [f.unitId, f.count])),
    );
    if (!sorted.length) continue;
    const show =
      tier === "world"
        ? sorted.slice(0, 1)
        : tier === "mid"
          ? sorted.slice(0, 2)
          : sorted.slice(0, 3);
    // Keep multi-type transit chips clustered on land around the march point.
    const host = t < 0.5 ? from : to;
    const centers = claimInteriorCluster(
      host,
      show.length,
      size,
      [{ x: pt.x, y: pt.y, w: size * 0.4, h: size * 0.4 }],
      size * 0.35,
    );
    show.forEach((u, i) => {
      const c = centers[i] ?? {
        x: pt.x + i * (size * 0.55),
        y: pt.y,
      };
      // Prefer march point for the lead chip so motion reads clearly.
      const x = i === 0 ? pt.x : c.x;
      const y = i === 0 ? pt.y : c.y;
      const m = toMini(
        `${army.id}:${u.unitId}`,
        u.unitId,
        tier === "world"
          ? army.force.reduce((s, f) => s + f.count, 0)
          : u.count,
        x,
        y,
        size,
        {
          armyId: army.id,
          territoryId: army.toId,
          transit: true,
          compact: tier === "world",
          owner: army.owner,
        },
      );
      if (m) out.push(m);
    });
  }
  return out;
}

export function garrisonFingerprint(
  territoryState: Record<string, TerritoryState>,
): string {
  const parts: string[] = [];
  for (const id of Object.keys(territoryState).sort()) {
    const g = territoryState[id]?.garrison;
    if (!g) continue;
    const keys = Object.keys(g).sort();
    if (!keys.length) continue;
    parts.push(`${id}:${keys.map((k) => `${k}:${g[k]}`).join(",")}`);
  }
  return parts.join("|");
}

export function transitFingerprint(armies: ArmyTransit[] | undefined): string {
  if (!armies?.length) return "";
  return armies
    .map(
      (a) =>
        `${a.id}:${a.fromId}>${a.toId}:${a.turnsRemaining}:${a.force
          .map((f) => `${f.unitId}:${f.count}`)
          .join(",")}`,
    )
    .join("|");
}
