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
  // Match building readability; deep units track the ≥24px focus-frame floor.
  const sizeScale = tier === "world" ? 0.92 : tier === "mid" ? 0.95 : 0.92;
  const size = Math.max(
    tier === "deep" ? 7.0 : 0,
    iconWorldSize(zoomScale, cam.w, tier) * sizeScale,
  );
  const gap = Math.max(1.0, size * 0.24);
  // Peer occupancy from buildings / prior units. Each territory adds its own
  // label keep-out so adjacent country names don't starve neighboring plots.
  const occupied: Box[] = [...occupiedExtra];
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

    const localOcc: Box[] = [
      ...labels
        .filter((l) => {
          if (l.id === t.id) return true;
          return Math.hypot(l.x - pole.x, l.y - pole.y) < size * 2.2 + l.w * 0.55;
        })
        .map((l) =>
          labelKeepOutBox(
            l,
            l.id === t.id ? size : Math.min(size * 0.35, 2.4),
          ),
        ),
      ...occupied,
    ];

    const total = sorted.reduce((s, u) => s + u.count, 0);
    const compactOnly = Boolean(wantCompact?.(t, ts));

    const placeCompact = (chipSize: number) => {
      // Never fall back onto the label pole — keep-outs stay hard.
      for (const trySize of [chipSize, chipSize * 0.85, chipSize * 0.7, 5.0, 4.2]) {
        const pt = claimInteriorSlot(t, trySize, localOcc, gap * 0.55);
        if (pt) {
          const box = groundedOccupancyBox(pt.x, pt.y, trySize);
          localOcc.push(box);
          occupied.push(box);
          const top = sorted[0]!;
          const m = toMini(
            `${t.id}:troops`,
            top.unitId,
            total,
            pt.x,
            pt.y,
            trySize,
            { territoryId: t.id, compact: true, owner: ts?.owner },
          );
          if (m) out.push(m);
          return true;
        }
      }
      return false;
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
    const sizeTries = [
      size,
      size * 0.9,
      size * 0.78,
      Math.max(5.2, size * 0.62),
      Math.max(4.6, size * 0.52),
      Math.max(4.0, size * 0.45),
    ];
    let placed = false;
    let best: {
      centers: { x: number; y: number }[];
      trySize: number;
    } | null = null;
    for (const trySize of sizeTries) {
      const centers = claimInteriorCluster(
        t,
        slotCount,
        trySize,
        localOcc,
        Math.max(gap * 0.2, trySize * 0.08),
      );
      if (!centers.length) continue;
      if (
        centers.length >= shown.length ||
        (best && centers.length > best.centers.length) ||
        !best
      ) {
        if (
          !best ||
          centers.length > best.centers.length ||
          (centers.length === best.centers.length && trySize > best.trySize)
        ) {
          best = { centers, trySize };
        }
      }
      if (centers.length >= shown.length) break;
    }
    if (best && best.centers.length > 0) {
      const { centers, trySize } = best;
      const placeN = Math.min(shown.length, centers.length);
      for (let i = 0; i < placeN; i++) {
        const c = centers[i]!;
        const u = shown[i]!;
        const box = groundedOccupancyBox(c.x, c.y, trySize * 0.55);
        localOcc.push(box);
        occupied.push(box);
        const m = toMini(
          `${t.id}:${u.unitId}`,
          u.unitId,
          u.count,
          c.x,
          c.y,
          trySize,
          { territoryId: t.id, owner: ts?.owner },
        );
        if (m) out.push(m);
      }
      if (moreCount > 0 && centers[placeN]) {
        const c = centers[placeN]!;
        const moreSize = trySize * 0.85;
        const box = groundedOccupancyBox(c.x, c.y, moreSize * 0.55);
        localOcc.push(box);
        occupied.push(box);
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
      } else if (moreCount > 0 && placeN === 1) {
        const only = out[out.length - 1];
        if (only) only.compact = true;
      }
      placed = true;
    }
    if (!placed) placeCompact(Math.max(size * 0.85, 5.0));
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
