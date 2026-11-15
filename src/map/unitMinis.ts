/**
 * Zoom-aware unit / garrison minis on the world map.
 * Mirrors buildingMinis: compact troop count at world zoom, top unit types
 * at mid, full breakdown at deep. Placed above labels so they do not overlap
 * building clusters (which sit below labels).
 */

import type { TerritoryDef } from "../data/types";
import { getUnit } from "../data/units";
import type { ArmyTransit, TerritoryState } from "../engine/state";
import { getSpriteUrl } from "../sprites/registry";
import {
  iconWorldSize,
  miniZoomTier,
  type LabelBox,
  type MiniZoomTier,
} from "./buildingMinis";

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

function overlaps(a: Box, b: Box, pad = 1.2): boolean {
  return !(
    a.x + a.w / 2 + pad < b.x - b.w / 2 ||
    a.x - a.w / 2 - pad > b.x + b.w / 2 ||
    a.y + a.h / 2 + pad < b.y - b.h / 2 ||
    a.y - a.h / 2 - pad > b.y + b.h / 2
  );
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

function gridSlots(
  n: number,
  cols: number,
  size: number,
  gap: number,
  cx: number,
  cy: number,
): Array<{ x: number; y: number }> {
  const rows = Math.ceil(n / cols);
  const gridW = cols * size + (cols - 1) * gap;
  const gridH = rows * size + (rows - 1) * gap;
  const x0 = cx - gridW / 2 + size / 2;
  const y0 = cy - gridH / 2 + size / 2;
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push({ x: x0 + c * (size + gap), y: y0 + r * (size + gap) });
  }
  return out;
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
 * Layout garrison unit minis. `occupied` should already include labels and
 * building mini boxes so units nest above the label pole.
 */
export function layoutUnitMinis(
  territories: TerritoryDef[],
  territoryState: Record<string, TerritoryState>,
  zoomScale: number,
  cam: { x: number; y: number; w: number; h: number },
  labels: LabelBox[],
  occupiedExtra: Box[] = [],
): PlacedUnitMini[] {
  const tier: MiniZoomTier = miniZoomTier(zoomScale);
  const size = iconWorldSize(zoomScale, cam.w, tier) * 0.92;
  const gap = Math.max(0.7, size * 0.15);
  const labelById = Object.fromEntries(labels.map((l) => [l.id, l]));
  // Labels always reserved; building boxes only block non-side anchors so the
  // left-of-label unit lane stays free beside building clusters.
  const labelBoxes: Box[] = labels.map((l) => ({
    x: l.x,
    y: l.y,
    w: l.w,
    h: l.h,
  }));
  const occupied: Box[] = [...labelBoxes, ...occupiedExtra];
  const out: PlacedUnitMini[] = [];

  const ranked = [...territories].sort((a, b) => b.area - a.area);

  for (const t of ranked) {
    const ts = territoryState[t.id];
    const garrison = ts?.garrison ?? {};
    const sorted = sortGarrison(garrison);
    if (!sorted.length) continue;

    const ax = t.label.x;
    const ay = t.label.y;
    if (
      ax < cam.x - 40 ||
      ax > cam.x + cam.w + 40 ||
      ay < cam.y - 40 ||
      ay > cam.y + cam.h + 40
    ) {
      continue;
    }

    const lbl = labelById[t.id];
    const baseX = lbl?.x ?? ax;
    // Sit just below-left of the label (same vertical band as buildings, shifted
    // left) so deep-zoom cameras that frame the label keep units on-screen.
    const sideX = lbl ? lbl.x - size * 1.15 : ax - size;
    const sideY = lbl
      ? lbl.y + lbl.h / 2 + gap + size / 2
      : ay + size * 0.9;
    const aboveY = lbl
      ? lbl.y - lbl.h / 2 - gap - size / 2
      : ay - size * 0.95;

    if (tier === "world") {
      // Skip 1-troop speckles on tiny plots — they read as "ghost" chips
      // next to empty neighbors (Morocco/Tunisia-style).
      if (zoomScale >= 0.98 && t.area < 0.0035) continue;
      const total = sorted.reduce((s, u) => s + u.count, 0);
      if (total < 3 && t.area < 0.008) continue;
      const top = sorted[0]!;
      const anchors = [
        { x: sideX, y: sideY },
        { x: sideX, y: sideY - size - gap },
        { x: baseX, y: aboveY },
        { x: baseX + (lbl?.w ?? size) / 2 + gap + size / 2, y: sideY },
      ];
      for (const a of anchors) {
        const box: Box = { x: a.x, y: a.y, w: size * 1.15, h: size * 1.15 };
        if (occupied.some((o) => overlaps(box, o, gap * 0.4))) continue;
        occupied.push(box);
        const m = toMini(
          `${t.id}:troops`,
          top.unitId,
          total,
          a.x,
          a.y,
          size,
          { territoryId: t.id, compact: true, owner: ts?.owner },
        );
        if (m) out.push(m);
        break;
      }
      continue;
    }

    const maxShow = tier === "mid" ? Math.min(3, sorted.length) : sorted.length;
    const shown = sorted.slice(0, maxShow);
    const moreCount = sorted.length - shown.length;
    const cols =
      tier === "deep"
        ? Math.min(3, Math.max(2, Math.ceil(Math.sqrt(shown.length + (moreCount ? 1 : 0)))))
        : Math.min(3, shown.length + (moreCount ? 1 : 0));
    const slotCount = shown.length + (moreCount > 0 ? 1 : 0);
    const anchors = [
      { cx: sideX - (tier === "deep" ? size * 0.4 : 0), cy: sideY },
      { cx: sideX, cy: sideY - size },
      { cx: baseX, cy: aboveY },
      {
        cx: baseX + (lbl?.w ?? size) / 2 + gap + size,
        cy: sideY,
      },
    ];

    let placed = false;
    for (let ai = 0; ai < anchors.length; ai++) {
      const { cx, cy } = anchors[ai]!;
      // First two anchors are the dedicated unit lane — ignore building boxes
      const blockers = ai < 2 ? labelBoxes : occupied;
      const slots = gridSlots(slotCount, cols, size, gap, cx, cy);
      const trial: PlacedUnitMini[] = [];
      const trialBoxes: Box[] = [];
      let ok = true;
      for (let i = 0; i < shown.length; i++) {
        const slot = slots[i]!;
        const u = shown[i]!;
        const box: Box = { x: slot.x, y: slot.y, w: size, h: size };
        if (
          blockers.some((o) => overlaps(box, o, gap * 0.35)) ||
          trialBoxes.some((o) => overlaps(box, o, gap * 0.2))
        ) {
          ok = false;
          break;
        }
        const m = toMini(
          `${t.id}:${u.unitId}`,
          u.unitId,
          u.count,
          slot.x,
          slot.y,
          size,
          { territoryId: t.id, owner: ts?.owner },
        );
        if (!m) continue;
        trial.push(m);
        trialBoxes.push(box);
      }
      if (!ok) continue;
      if (moreCount > 0) {
        const slot = slots[shown.length]!;
        const box: Box = { x: slot.x, y: slot.y, w: size * 0.85, h: size * 0.85 };
        if (
          occupied.some((o) => overlaps(box, o, gap * 0.35)) ||
          trialBoxes.some((o) => overlaps(box, o, gap * 0.2))
        ) {
          continue;
        }
        trial.push({
          key: `${t.id}:more`,
          territoryId: t.id,
          unitId: "_more",
          spriteId: "",
          spriteUrl: "",
          x: slot.x,
          y: slot.y,
          size: size * 0.85,
          count: moreCount,
          more: moreCount,
          owner: ts?.owner,
        });
        trialBoxes.push(box);
      }
      for (const box of trialBoxes) occupied.push(box);
      out.push(...trial);
      placed = true;
      break;
    }

    if (!placed) {
      // Fallback compact badge
      const total = sorted.reduce((s, u) => s + u.count, 0);
      const top = sorted[0]!;
      const fx = sideX;
      const fy = sideY;
      const box: Box = {
        x: fx,
        y: fy,
        w: size * 1.1,
        h: size * 1.1,
      };
      if (!occupied.some((o) => overlaps(box, o, gap * 0.3))) {
        occupied.push(box);
        const m = toMini(
          `${t.id}:troops`,
          top.unitId,
          total,
          fx,
          fy,
          size * 0.9,
          { territoryId: t.id, compact: true, owner: ts?.owner },
        );
        if (m) out.push(m);
      }
    }
  }

  return out;
}

/** Place in-transit army minis along their march routes. */
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
    const x = from.label.x + (to.label.x - from.label.x) * t;
    const y = from.label.y + (to.label.y - from.label.y) * t - 6;
    if (
      x < cam.x - 30 ||
      x > cam.x + cam.w + 30 ||
      y < cam.y - 30 ||
      y > cam.y + cam.h + 30
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
    show.forEach((u, i) => {
      const m = toMini(
        `${army.id}:${u.unitId}`,
        u.unitId,
        tier === "world"
          ? army.force.reduce((s, f) => s + f.count, 0)
          : u.count,
        x + i * (size * 0.85),
        y,
        size,
        {
          armyId: army.id,
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
