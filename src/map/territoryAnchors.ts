/**
 * Land anchors for map minis — pole of inaccessibility + interior slots
 * guaranteed inside the territory's largest landmass (point-in-polygon).
 */
import polylabel from "polylabel";
import type { TerritoryDef } from "../data/types";

export type Pt = { x: number; y: number };
export type Ring = Pt[];

export interface TerritoryAnchorSet {
  territoryId: string;
  /** Pole of inaccessibility on the largest land ring. */
  pole: Pt;
  /** Interior slots (pole first), spaced for mini footprints. */
  slots: Pt[];
  rings: Ring[];
  largestRingIndex: number;
}

const cache = new Map<string, TerritoryAnchorSet>();

/** Parse SVG path (M/L/Z only — our baked maps) into closed rings. */
export function parseSvgPathRings(path: string): Ring[] {
  const rings: Ring[] = [];
  let cur: Ring = [];
  let x = 0;
  let y = 0;
  const re =
    /([MmLlZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*,\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)/g;
  let m: RegExpExecArray | null;
  let mode: "M" | "L" = "M";
  while ((m = re.exec(path))) {
    if (m[1] === "M" || m[1] === "m") {
      if (cur.length >= 3) rings.push(cur);
      cur = [];
      mode = "M";
      continue;
    }
    if (m[1] === "L" || m[1] === "l") {
      mode = "L";
      continue;
    }
    if (m[1] === "Z" || m[1] === "z") {
      if (cur.length >= 3) {
        const f = cur[0]!;
        const l = cur[cur.length - 1]!;
        if (f.x !== l.x || f.y !== l.y) cur.push({ ...f });
        rings.push(cur);
      }
      cur = [];
      continue;
    }
    if (m[2] != null && m[3] != null) {
      x = Number(m[2]);
      y = Number(m[3]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      cur.push({ x, y });
      mode = "L";
      void mode;
    }
  }
  if (cur.length >= 3) {
    const f = cur[0]!;
    const l = cur[cur.length - 1]!;
    if (f.x !== l.x || f.y !== l.y) cur.push({ ...f });
    rings.push(cur);
  }
  return rings;
}

export function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i]!;
    const pj = ring[j]!;
    a += pj.x * pi.y - pi.x * pj.y;
  }
  return Math.abs(a) / 2;
}

export function pointInRing(x: number, y: number, ring: Ring): boolean {
  // Ray casting; ring may be open or closed.
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]!.x;
    const yi = ring[i]!.y;
    const xj = ring[j]!.x;
    const yj = ring[j]!.y;
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInRings(x: number, y: number, rings: Ring[]): boolean {
  return rings.some((r) => pointInRing(x, y, r));
}

/** Minimum distance from (x,y) to any edge segment of the ring. */
export function distanceToRingEdge(x: number, y: number, ring: Ring): number {
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const ax = ring[i]!.x;
    const ay = ring[i]!.y;
    const bx = ring[i + 1]!.x;
    const by = ring[i + 1]!.y;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((x - ax) * dx + (y - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.hypot(x - px, y - py);
    if (d < best) best = d;
  }
  return best;
}

/**
 * True when the axis-aligned footprint sits inland: PIP samples + min
 * distance from the coast/border (keeps minis out of fjords and gulfs).
 */
export function footprintInsideRing(
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  ring: Ring,
  inset = 0.35,
): boolean {
  if (!pointInRing(x, y, ring)) return false;
  const hw = Math.max(0.25, halfW * (1 - inset * 0.5));
  const hh = Math.max(0.25, halfH * (1 - inset * 0.5));
  const samples: Pt[] = [
    { x, y },
    { x: x - hw, y },
    { x: x + hw, y },
    { x, y: y - hh },
    { x, y: y + hh },
    { x: x - hw * 0.75, y: y - hh * 0.75 },
    { x: x + hw * 0.75, y: y - hh * 0.75 },
    { x: x - hw * 0.75, y: y + hh * 0.75 },
    { x: x + hw * 0.75, y: y + hh * 0.75 },
  ];
  if (!samples.every((p) => pointInRing(p.x, p.y, ring))) return false;
  // Require clearance from the coastline/border — scaled to footprint
  // so large deep-zoom sprites don't hang over water.
  const minEdge = Math.max(1.35, Math.hypot(halfW, halfH) * 1.05);
  return distanceToRingEdge(x, y, ring) >= minEdge;
}

function ringBBox(ring: Ring): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function poleOfRing(ring: Ring): Pt {
  const coords = [ring.map((p) => [p.x, p.y] as [number, number])];
  try {
    const [x, y] = polylabel(coords, 0.5);
    if (Number.isFinite(x) && Number.isFinite(y) && pointInRing(x, y, ring)) {
      return { x, y };
    }
  } catch {
    /* fall through */
  }
  // Centroid fallback
  let sx = 0;
  let sy = 0;
  for (const p of ring) {
    sx += p.x;
    sy += p.y;
  }
  const n = Math.max(1, ring.length);
  return { x: sx / n, y: sy / n };
}

/**
 * Sample interior slots on the largest ring: pole first, then a spiral/grid
 * of candidates that keep a mini footprint inland.
 * When `label` is set, also seeds candidates beside/below the name so minis
 * can clear the glyph keep-out without leaving the polygon.
 */
export function buildInteriorSlots(
  ring: Ring,
  pole: Pt,
  count = 12,
  footprint = 2.2,
  label?: Pt,
): Pt[] {
  const slots: Pt[] = [];
  const minSep = footprint * 1.45;
  const push = (p: Pt) => {
    if (!footprintInsideRing(p.x, p.y, footprint, footprint, ring, 0.4)) return;
    if (slots.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < minSep)) return;
    slots.push(p);
  };
  push(pole);

  const bbox = ringBBox(ring);
  const span = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, 4);
  const step = Math.max(footprint * 1.55, span * 0.09);

  // Beside / below the country name (label is often the pole).
  if (label) {
    const d = Math.max(step * 1.05, footprint * 1.55);
    const offsets: Pt[] = [
      { x: 0, y: d }, // south / below
      { x: d * 0.85, y: d * 0.55 },
      { x: -d * 0.85, y: d * 0.55 },
      { x: d, y: 0 },
      { x: -d, y: 0 },
      { x: d * 0.7, y: -d * 0.35 },
      { x: -d * 0.7, y: -d * 0.35 },
      { x: 0, y: d * 1.7 },
      { x: d * 1.35, y: d * 0.9 },
      { x: -d * 1.35, y: d * 0.9 },
    ];
    for (const o of offsets) {
      push({ x: label.x + o.x, y: label.y + o.y });
    }
  }

  // Spiral around the pole
  for (let ringN = 1; ringN <= 10 && slots.length < count; ringN++) {
    const r = step * ringN;
    const n = Math.max(6, ringN * 6);
    for (let i = 0; i < n && slots.length < count; i++) {
      const a = (i / n) * Math.PI * 2 + ringN * 0.35;
      push({ x: pole.x + Math.cos(a) * r, y: pole.y + Math.sin(a) * r });
    }
  }

  // Fallback grid over bbox if still short
  if (slots.length < Math.min(6, count)) {
    const gx = Math.max(3, Math.floor((bbox.maxX - bbox.minX) / step));
    const gy = Math.max(3, Math.floor((bbox.maxY - bbox.minY) / step));
    for (let iy = 1; iy < gy && slots.length < count; iy++) {
      for (let ix = 1; ix < gx && slots.length < count; ix++) {
        push({
          x: bbox.minX + ((bbox.maxX - bbox.minX) * ix) / gx,
          y: bbox.minY + ((bbox.maxY - bbox.minY) * iy) / gy,
        });
      }
    }
  }

  return slots;
}

/** Axis-aligned overlap for center-based boxes (x/y = center). */
export function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  pad = 0,
): boolean {
  return !(
    a.x + a.w / 2 + pad < b.x - b.w / 2 ||
    a.x - a.w / 2 - pad > b.x + b.w / 2 ||
    a.y + a.h / 2 + pad < b.y - b.h / 2 ||
    a.y - a.h / 2 - pad > b.y + b.h / 2
  );
}

/**
 * Center-based AABB of a grounded mini whose foot sits at `(x, y)`.
 * Sprites rise above the foot (CoN-style), so occupancy is biased upward —
 * a foot just south of a label still collides if we only checked a
 * foot-centered square.
 */
export function groundedOccupancyBox(
  x: number,
  y: number,
  size: number,
): { x: number; y: number; w: number; h: number } {
  const w = size * 0.92;
  const h = size * 1.05;
  // ~84% of the box sits above the foot; a thin pad below covers the shadow.
  return { x, y: y - h * 0.42, w, h };
}

/**
 * Keep-out box around a territory name glyph so minis never cover the label.
 * `w`/`h` are the laid-out text extents; padded generously vs mini size and
 * biased south — grounded sprites whose feet sit below the glyph still clear
 * the name with their upright body.
 */
export function labelKeepOutBox(
  label: { x: number; y: number; w: number; h: number },
  miniSize: number,
): { x: number; y: number; w: number; h: number } {
  // Keep names readable without swallowing whole archipelagos / small plots
  // when minis grow for mobile readability.
  return {
    x: label.x,
    // Bias the keep-out below the glyph so south-of-label feet don't rise
    // back into the letters.
    y: label.y + miniSize * 0.2,
    w: Math.max(label.w * 1.25, miniSize * 1.55, 9),
    h: Math.max(label.h * 1.85, miniSize * 1.35, 6),
  };
}

export function getTerritoryAnchors(t: TerritoryDef): TerritoryAnchorSet {
  const hit = cache.get(t.id);
  if (hit) return hit;
  const rings = parseSvgPathRings(t.path);
  let largestRingIndex = 0;
  let bestA = -1;
  for (let i = 0; i < rings.length; i++) {
    const a = ringArea(rings[i]!);
    if (a > bestA) {
      bestA = a;
      largestRingIndex = i;
    }
  }
  const ring = rings[largestRingIndex] ?? [{ x: t.label.x, y: t.label.y }];
  // Prefer the deeper inland point between polylabel and the baked label
  // (labels can sit near coasts — e.g. Finland's southern label).
  let pole = rings.length ? poleOfRing(ring) : { x: t.label.x, y: t.label.y };
  if (rings.length) {
    const labelOk = footprintInsideRing(
      t.label.x,
      t.label.y,
      1.4,
      1.4,
      ring,
      0.25,
    );
    const poleOk = footprintInsideRing(pole.x, pole.y, 1.2, 1.2, ring, 0.25);
    if (labelOk && poleOk) {
      const labelEdge = distanceToRingEdge(t.label.x, t.label.y, ring);
      const poleEdge = distanceToRingEdge(pole.x, pole.y, ring);
      // Only take the label when it is at least as inland as the pole.
      if (labelEdge >= poleEdge * 0.92) {
        pole = { x: t.label.x, y: t.label.y };
      }
    } else if (labelOk && !poleOk) {
      pole = { x: t.label.x, y: t.label.y };
    } else if (!poleOk) {
      // Nudge pole toward label until inland clearance is met.
      for (let i = 1; i <= 8; i++) {
        const u = i / 8;
        const nx = pole.x + (t.label.x - pole.x) * u;
        const ny = pole.y + (t.label.y - pole.y) * u;
        if (footprintInsideRing(nx, ny, 1.2, 1.2, ring, 0.25)) {
          pole = { x: nx, y: ny };
          break;
        }
      }
    }
  }
  // Footprint scale for slot spacing — keep modest so we stay inland.
  const fp = Math.max(1.8, Math.min(2.8, Math.sqrt(Math.max(t.area, 0.001)) * 6));
  const labelPt = { x: t.label.x, y: t.label.y };
  let slots = rings.length
    ? buildInteriorSlots(ring, pole, 24, fp, labelPt)
    : [pole];
  // Prefer deepest inland slots, then ones offset from the name glyph
  // (beside/below) so claimInteriorSlot can clear label keep-outs.
  if (rings.length && slots.length) {
    slots = [...slots].sort((a, b) => {
      const edge =
        distanceToRingEdge(b.x, b.y, ring) -
        distanceToRingEdge(a.x, a.y, ring);
      if (Math.abs(edge) > 0.35) return edge;
      // Prefer south/east of the label so pieces sit under/beside the name.
      const score = (p: Pt) => {
        const dx = p.x - labelPt.x;
        const dy = p.y - labelPt.y;
        const away = Math.hypot(dx, dy);
        return away * 2 + Math.max(0, dy) * 3 + Math.abs(dx);
      };
      return score(b) - score(a);
    });
    // Keep pole as the deepest inland point (not necessarily the label).
    pole = [...slots].sort(
      (a, b) =>
        distanceToRingEdge(b.x, b.y, ring) -
        distanceToRingEdge(a.x, a.y, ring),
    )[0] ?? pole;
  }
  const set: TerritoryAnchorSet = {
    territoryId: t.id,
    pole,
    slots: slots.length ? slots : [pole],
    rings,
    largestRingIndex,
  };
  cache.set(t.id, set);
  return set;
}

/** Clear cache (tests / map swaps). */
export function clearTerritoryAnchorCache(): void {
  cache.clear();
}

/** Pick the next free interior slot near the pole, avoiding occupied boxes. */
export function claimInteriorSlot(
  t: TerritoryDef,
  size: number,
  occupied: { x: number; y: number; w: number; h: number }[],
  pad = 0.6,
): Pt | null {
  const anchors = getTerritoryAnchors(t);
  const ring = anchors.rings[anchors.largestRingIndex];
  if (!ring) return null;
  const half = size / 2;
  const tryPoint = (s: Pt, landHalf: number, softPad: number): Pt | null => {
    if (!footprintInsideRing(s.x, s.y, landHalf, landHalf, ring, 0.35)) {
      return null;
    }
    // Collide with the upright sprite body, not a foot-centered square.
    const box = groundedOccupancyBox(s.x, s.y, size);
    if (occupied.some((o) => boxesOverlap(box, o, softPad))) return null;
    return s;
  };
  for (const s of anchors.slots) {
    const hit = tryPoint(s, half, pad);
    if (hit) return hit;
  }
  // Soften peer-mini pad only — never relax below a floor so label keep-outs
  // stay hard (sprites must not rise into the country name).
  const softPad = Math.max(pad * 0.7, 0.35);
  for (const s of anchors.slots) {
    const hit = tryPoint(s, half, softPad);
    if (hit) return hit;
  }
  return tryPoint(anchors.pole, Math.max(0.85, half * 0.85), softPad);
}

/**
 * Claim N distinct interior slots for a cluster (buildings / multi-type units).
 * Returns centers that all sit inland.
 */
export function claimInteriorCluster(
  t: TerritoryDef,
  count: number,
  size: number,
  occupied: { x: number; y: number; w: number; h: number }[],
  pad = 0.55,
): Pt[] {
  const out: Pt[] = [];
  const localOcc = [...occupied];
  for (let i = 0; i < count; i++) {
    const p = claimInteriorSlot(t, size, localOcc, pad);
    if (!p) break;
    out.push(p);
    localOcc.push(groundedOccupancyBox(p.x, p.y, size));
  }
  return out;
}

/** Edge-biased interior point in `from` facing toward `to` (for land marches). */
export function borderFacingPoint(from: TerritoryDef, toward: TerritoryDef): Pt {
  const a = getTerritoryAnchors(from);
  const b = getTerritoryAnchors(toward).pole;
  const ring = a.rings[a.largestRingIndex];
  if (!ring) return a.pole;
  let best = a.pole;
  let bestScore = -Infinity;
  const dx = b.x - a.pole.x;
  const dy = b.y - a.pole.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  for (const s of a.slots) {
    if (!footprintInsideRing(s.x, s.y, 1.2, 1.2, ring, 0.35)) continue;
    const score = (s.x - a.pole.x) * ux + (s.y - a.pole.y) * uy;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

/**
 * Land-safe march position between two territories.
 * Stays inside `from` for the first half, `to` for the second.
 * Naval stacks may use a straight water lerp between poles.
 */
export function marchLandPoint(
  from: TerritoryDef,
  to: TerritoryDef,
  t01: number,
  naval = false,
): Pt {
  const t = Math.max(0, Math.min(1, t01));
  const a = getTerritoryAnchors(from);
  const b = getTerritoryAnchors(to);
  if (naval) {
    return {
      x: a.pole.x + (b.pole.x - a.pole.x) * t,
      y: a.pole.y + (b.pole.y - a.pole.y) * t,
    };
  }
  const exit = borderFacingPoint(from, to);
  const entry = borderFacingPoint(to, from);
  if (t < 0.5) {
    const u = t * 2;
    return {
      x: a.pole.x + (exit.x - a.pole.x) * u,
      y: a.pole.y + (exit.y - a.pole.y) * u,
    };
  }
  const u = (t - 0.5) * 2;
  return {
    x: entry.x + (b.pole.x - entry.x) * u,
    y: entry.y + (b.pole.y - entry.y) * u,
  };
}

/** Assert helper: point is inside the territory's largest landmass. */
export function isInsideTerritoryLand(
  t: TerritoryDef,
  x: number,
  y: number,
  half = 0.8,
): boolean {
  const a = getTerritoryAnchors(t);
  const ring = a.rings[a.largestRingIndex];
  if (!ring) return false;
  return footprintInsideRing(x, y, half, half, ring, 0.15);
}
