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

function tryPlaceGrid(
  shown: Array<{ unitId: string; count: number }>,
  moreCount: number,
  territoryId: string,
  owner: string | undefined,
  cols: number,
  size: number,
  gap: number,
  cx: number,
  cy: number,
  occupied: Box[],
  collisionPad: number,
): { minis: PlacedUnitMini[]; boxes: Box[] } | null {
  const slotCount = shown.length + (moreCount > 0 ? 1 : 0);
  const slots = gridSlots(slotCount, cols, size, gap, cx, cy);
  const trial: PlacedUnitMini[] = [];
  const trialBoxes: Box[] = [];

  for (let i = 0; i < shown.length; i++) {
    const slot = slots[i]!;
    const u = shown[i]!;
    const box: Box = { x: slot.x, y: slot.y, w: size, h: size };
    if (
      occupied.some((o) => overlaps(box, o, collisionPad)) ||
      trialBoxes.some((o) => overlaps(box, o, gap * 0.2))
    ) {
      return null;
    }
    const m = toMini(
      `${territoryId}:${u.unitId}`,
      u.unitId,
      u.count,
      slot.x,
      slot.y,
      size,
      { territoryId, owner },
    );
    if (!m) continue;
    trial.push(m);
    trialBoxes.push(box);
  }

  if (moreCount > 0) {
    const slot = slots[shown.length];
    if (!slot) return null;
    const box: Box = {
      x: slot.x,
      y: slot.y,
      w: size * 0.85,
      h: size * 0.85,
    };
    if (
      occupied.some((o) => overlaps(box, o, collisionPad)) ||
      trialBoxes.some((o) => overlaps(box, o, gap * 0.2))
    ) {
      return null;
    }
    trial.push({
      key: `${territoryId}:more`,
      territoryId,
      unitId: "_more",
      spriteId: "",
      spriteUrl: "",
      x: slot.x,
      y: slot.y,
      size: size * 0.85,
      count: moreCount,
      more: moreCount,
      owner,
    });
    trialBoxes.push(box);
  }

  if (!trial.length) return null;
  return { minis: trial, boxes: trialBoxes };
}

/**
 * Layout garrison unit minis. `occupiedExtra` should include building mini
 * boxes so units nest above the label pole (buildings sit below).
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
  // World chips stay compact; mid/deep shrink slightly so Europe stays readable.
  const sizeScale = tier === "world" ? 0.78 : tier === "mid" ? 0.82 : 0.88;
  const size = iconWorldSize(zoomScale, cam.w, tier) * sizeScale;
  const gap = Math.max(0.55, size * 0.18);
  const labelById = Object.fromEntries(labels.map((l) => [l.id, l]));
  // Use a tightened label box — map labels often pad wider than the glyph.
  const labelBoxes: Box[] = labels.map((l) => ({
    x: l.x,
    y: l.y,
    w: Math.min(l.w, Math.max(size * 1.4, 8)),
    h: Math.max(l.h, size * 0.55),
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
    const labelTop = lbl ? lbl.y - lbl.h / 2 : ay - 2;
    const labelBot = lbl ? lbl.y + lbl.h / 2 : ay + 2;
    const total = sorted.reduce((s, u) => s + u.count, 0);

    // ── World: exactly one compact strength chip ───────────────
    if (tier === "world") {
      // Europe clutter: skip speckles and tiny plots entirely.
      if (t.area < 0.0045) continue;
      if (total <= 1 && t.area < 0.01) continue;
      if (zoomScale >= 0.9 && t.area < 0.006) continue;

      const chipSize = size;
      const aboveY = labelTop - gap - chipSize / 2;
      const belowY = labelBot + gap + chipSize / 2;
      const anchors = [
        { x: baseX, y: aboveY },
        { x: baseX - chipSize * 0.9, y: aboveY },
        { x: baseX + chipSize * 0.9, y: aboveY },
        { x: baseX - chipSize * 1.1, y: lbl?.y ?? ay },
        { x: baseX + chipSize * 1.1, y: lbl?.y ?? ay },
        { x: baseX, y: belowY },
      ];
      const top = sorted[0]!;
      let placed = false;
      for (const a of anchors) {
        const box: Box = { x: a.x, y: a.y, w: chipSize, h: chipSize };
        // Strong pad so neighbor Europe chips don't stack.
        if (occupied.some((o) => overlaps(box, o, gap * 0.85))) continue;
        occupied.push(box);
        const m = toMini(
          `${t.id}:troops`,
          top.unitId,
          total,
          a.x,
          a.y,
          chipSize,
          { territoryId: t.id, compact: true, owner: ts?.owner },
        );
        if (m) out.push(m);
        placed = true;
        break;
      }
      void placed;
      continue;
    }

    // Mid: only larger territories get a multi-type row; Europe stays readable.
    const forceCompact =
      tier === "mid" && (t.area < 0.012 || sorted.length === 1);
    if (forceCompact) {
      const chipSize = size * (t.area < 0.005 ? 0.85 : 1);
      const aboveY = labelTop - gap - chipSize / 2;
      const anchors = [
        { x: baseX, y: aboveY },
        { x: baseX - chipSize, y: aboveY },
        { x: baseX + chipSize, y: aboveY },
        { x: baseX - chipSize * 1.15, y: lbl?.y ?? ay },
      ];
      const top = sorted[0]!;
      for (const a of anchors) {
        const box: Box = { x: a.x, y: a.y, w: chipSize, h: chipSize };
        if (occupied.some((o) => overlaps(box, o, gap * 0.6))) continue;
        occupied.push(box);
        const m = toMini(
          `${t.id}:troops`,
          top.unitId,
          total,
          a.x,
          a.y,
          chipSize,
          { territoryId: t.id, compact: true, owner: ts?.owner },
        );
        if (m) out.push(m);
        break;
      }
      continue;
    }

    // Mid: ≤3 types + optional +N. Deep: up to 6 types above the label.
    const maxShow =
      tier === "mid" ? Math.min(3, sorted.length) : Math.min(6, sorted.length);
    const shown = sorted.slice(0, maxShow);
    const moreCount = sorted.length - shown.length;
    const slotCount = shown.length + (moreCount > 0 ? 1 : 0);
    const cols =
      tier === "deep"
        ? Math.min(3, Math.max(2, Math.ceil(Math.sqrt(slotCount))))
        : Math.min(3, slotCount);
    const rows = Math.ceil(slotCount / cols);
    const gridH = rows * size + (rows - 1) * gap;
    const gridW = cols * size + (cols - 1) * gap;
    // Prefer LEFT/RIGHT of the label at label height — buildings sit BELOW
    // the label, so this lane stays clear and on-camera at deep zoom.
    const sideCy = lbl?.y ?? ay;
    const sideX = baseX - gridW / 2 - gap - size * 1.1;
    const rightX = baseX + gridW / 2 + gap + size * 1.1;
    const clearGap = gap + size * 0.4;
    const aboveCy = labelTop - clearGap - gridH / 2;

    const anchors = [
      { cx: sideX, cy: sideCy },
      { cx: sideX - size * 0.5, cy: sideCy },
      { cx: rightX, cy: sideCy },
      { cx: sideX, cy: sideCy - size * 0.55 },
      { cx: baseX, cy: aboveCy },
      { cx: baseX - size * 0.5, cy: aboveCy },
    ];

    let placed = false;
    for (const { cx, cy } of anchors) {
      const result = tryPlaceGrid(
        shown,
        moreCount,
        t.id,
        ts?.owner,
        cols,
        size,
        gap,
        cx,
        cy,
        occupied,
        gap * 0.55,
      );
      if (!result) continue;
      for (const box of result.boxes) occupied.push(box);
      out.push(...result.minis);
      placed = true;
      break;
    }

    if (!placed) {
      // Fallback: one compact chip above the label.
      const chipSize = size * 0.9;
      const fx = baseX;
      const fy = labelTop - gap - chipSize / 2;
      const box: Box = { x: fx, y: fy, w: chipSize, h: chipSize };
      if (!occupied.some((o) => overlaps(box, o, gap * 0.4))) {
        occupied.push(box);
        const top = sorted[0]!;
        const m = toMini(
          `${t.id}:troops`,
          top.unitId,
          total,
          fx,
          fy,
          chipSize,
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
