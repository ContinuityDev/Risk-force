import { getBuilding, isTrainingBuilding } from "../data/buildings";
import type { TerritoryDef } from "../data/types";
import type { PlacedBuilding, TerritoryState } from "../engine/state";
import { getSpriteUrl } from "../sprites/registry";

export type MiniZoomTier = "world" | "mid" | "deep";

export interface PlacedMini {
  key: string;
  territoryId: string;
  buildingId: string;
  spriteId: string;
  spriteUrl: string;
  x: number;
  y: number;
  size: number;
  constructing: boolean;
  /** 0 = just started, 1 = complete (or idle). */
  progress: number;
  /** Compact world-zoom marker: show count badge instead of per-building art. */
  compact?: boolean;
  count?: number;
  /** Overflow badge after the visible set (+N). */
  more?: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LabelBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Box, b: Box, pad = 1.5): boolean {
  return !(
    a.x + a.w / 2 + pad < b.x - b.w / 2 ||
    a.x - a.w / 2 - pad > b.x + b.w / 2 ||
    a.y + a.h / 2 + pad < b.y - b.h / 2 ||
    a.y - a.h / 2 - pad > b.y + b.h / 2
  );
}

/** Higher = more important for the mid-zoom shortlist. */
export function buildingPriority(buildingId: string): number {
  let def;
  try {
    def = getBuilding(buildingId);
  } catch {
    return 0;
  }
  if (def.id === "command_nexus") return 1000;
  let score = 0;
  switch (def.category) {
    case "command":
      score = 900;
      break;
    case "economy":
      score = 700;
      break;
    case "defense":
      score = 550;
      break;
    case "naval":
    case "orbital":
      score = 500;
      break;
    case "research":
      score = 420;
      break;
    case "support":
      score = isTrainingBuilding(def) ? 480 : 300;
      break;
    default:
      score = 200;
  }
  score += Math.min(80, (def.cost.energy ?? 0) / 4 + (def.maxHp ?? 0) / 20);
  return score;
}

export function miniZoomTier(zoomScale: number): MiniZoomTier {
  if (zoomScale >= 0.85) return "world";
  if (zoomScale >= 0.32) return "mid";
  return "deep";
}

function sortBuildings(buildings: PlacedBuilding[]): PlacedBuilding[] {
  return [...buildings].sort(
    (a, b) =>
      buildingPriority(b.buildingId) - buildingPriority(a.buildingId) ||
      a.buildingId.localeCompare(b.buildingId),
  );
}

/**
 * World-unit icon size from camera width so on-screen px grow with zoom-in.
 * Assumes ~560–700px map CSS width (drawer-safe). Caps so icons stay readable
 * but not absurd (~40px max on a typical 844 landscape frame).
 */
export function iconWorldSize(
  zoomScale: number,
  camW: number,
  tier: MiniZoomTier,
): number {
  // Fraction of the visible camera width → roughly constant*growing screen px
  const frac =
    tier === "deep" ? 0.072 : tier === "mid" ? 0.042 : 0.016;
  const raw = camW * frac;
  // Hard clamps in world units (deep camW≈80 → ~5.8wu ≈ 35–40px on ~560px svg)
  const min = tier === "deep" ? 4.5 : tier === "mid" ? 2.2 : 1.5;
  const max = tier === "deep" ? 9.5 : tier === "mid" ? 6.5 : 3.2;
  void zoomScale;
  return Math.min(max, Math.max(min, raw));
}

/** @deprecated kept for tests — approximate screen px from zoom. */
export function targetScreenPx(zoomScale: number): number {
  const tier = miniZoomTier(zoomScale);
  const camW = 1000 * zoomScale;
  const wu = iconWorldSize(zoomScale, camW, tier);
  // Assume ~600px map CSS width
  return Math.min(40, Math.max(10, (wu / camW) * 600));
}

function toMini(
  tId: string,
  b: PlacedBuilding,
  x: number,
  y: number,
  size: number,
): PlacedMini | null {
  let def;
  try {
    def = getBuilding(b.buildingId);
  } catch {
    return null;
  }
  const buildTime = Math.max(1, def.buildTime);
  const constructing = b.buildRemaining > 0;
  return {
    key: `${tId}:${b.instanceId}`,
    territoryId: tId,
    buildingId: b.buildingId,
    spriteId: def.sprite.id,
    spriteUrl: getSpriteUrl(def.sprite.id),
    x,
    y,
    size,
    constructing,
    progress: constructing
      ? Math.max(0, Math.min(1, 1 - b.buildRemaining / buildTime))
      : 1,
  };
}

function tryPlaceCompact(
  t: TerritoryDef,
  buildings: PlacedBuilding[],
  baseX: number,
  baseY: number,
  size: number,
  gap: number,
  occupied: Box[],
): PlacedMini | null {
  const box: Box = { x: baseX, y: baseY, w: size * 1.2, h: size * 1.2 };
  const offsets = [
    { x: 0, y: 0 },
    { x: 0, y: size + gap },
    { x: 0, y: -(size + gap) },
    { x: size + gap, y: 0 },
    { x: -(size + gap), y: 0 },
  ];
  for (const off of offsets) {
    const b: Box = { x: baseX + off.x, y: baseY + off.y, w: box.w, h: box.h };
    if (occupied.some((o) => overlaps(b, o, gap * 0.5))) continue;
    occupied.push(b);
    let spriteId = "building-nexus";
    try {
      spriteId = getBuilding(sortBuildings(buildings)[0]!.buildingId).sprite.id;
    } catch {
      /* */
    }
    return {
      key: `${t.id}:compact`,
      territoryId: t.id,
      buildingId: "command_nexus",
      spriteId,
      spriteUrl: getSpriteUrl(spriteId),
      x: b.x,
      y: b.y,
      size,
      constructing: false,
      progress: 1,
      compact: true,
      count: buildings.length,
    };
  }
  return null;
}

/** Grid positions centered on (cx, cy), row-major. */
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

/**
 * Place building thumbnails near each territory's label pole.
 * Screen size grows with zoom-in; deep zoom uses a compact grid/cluster.
 */
export function layoutBuildingMinis(
  territories: TerritoryDef[],
  territoryState: Record<string, TerritoryState>,
  zoomScale: number,
  cam: { x: number; y: number; w: number; h: number },
  labels: LabelBox[],
): PlacedMini[] {
  const tier = miniZoomTier(zoomScale);
  const size = iconWorldSize(zoomScale, cam.w, tier);
  const gap = Math.max(0.8, size * 0.16);
  const labelById = Object.fromEntries(labels.map((l) => [l.id, l]));
  const occupied: Box[] = labels.map((l) => ({
    x: l.x,
    y: l.y,
    w: l.w,
    h: l.h,
  }));
  const out: PlacedMini[] = [];

  const ranked = [...territories].sort((a, b) => b.area - a.area);

  for (const t of ranked) {
    const ts = territoryState[t.id];
    // Skip empty / razed bases — never emit compact pads or +N for 0 buildings.
    const buildings = (ts?.buildings ?? []).filter((b) => b.hp > 0);
    if (!buildings.length) continue;

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
    const belowY = lbl
      ? lbl.y + lbl.h / 2 + gap + size / 2
      : ay + size * 0.9;

    if (tier === "world") {
      // World zoom: unit strength chips own the pole. Building pads at this
      // scale just double-stack Europe into an unreadible cloud.
      continue;
    }

    const sorted = sortBuildings(buildings);
    // Mid on small Europe plots: one compact pad, not a 3-icon stack.
    if (tier === "mid" && t.area < 0.012) {
      const compact = tryPlaceCompact(
        t,
        buildings,
        baseX,
        belowY,
        Math.max(size * 0.85, 1.6),
        gap,
        occupied,
      );
      if (compact) out.push(compact);
      continue;
    }
    const maxShow = tier === "mid" ? Math.min(3, sorted.length) : sorted.length;
    const shown = sorted.slice(0, maxShow);
    const moreCount = sorted.length - shown.length;

    // Deep: 2–3 column grid/cluster. Mid: single row (or 2-col if many).
    const cols =
      tier === "deep"
        ? Math.min(3, Math.max(2, Math.ceil(Math.sqrt(shown.length + (moreCount ? 1 : 0)))))
        : shown.length + (moreCount ? 1 : 0) <= 3
          ? shown.length + (moreCount ? 1 : 0)
          : 3;

    const slotCount = shown.length + (moreCount > 0 ? 1 : 0);
    const yAnchors = [
      belowY + (tier === "deep" ? size * 0.35 : 0),
      belowY + size * 1.2,
      belowY + size * 2.2,
      (lbl?.y ?? ay) - (lbl?.h ?? size) / 2 - gap - size,
    ];

    let placed: PlacedMini[] | null = null;

    for (const cy of yAnchors) {
      const slots = gridSlots(slotCount, cols, size, gap, baseX, cy);
      const trial: PlacedMini[] = [];
      const trialBoxes: Box[] = [];
      let ok = true;

      for (let i = 0; i < shown.length; i++) {
        const slot = slots[i]!;
        const box: Box = { x: slot.x, y: slot.y, w: size, h: size };
        if (
          occupied.some((o) => overlaps(box, o, gap * 0.45)) ||
          trialBoxes.some((o) => overlaps(box, o, gap * 0.3))
        ) {
          ok = false;
          break;
        }
        const mini = toMini(t.id, shown[i]!, slot.x, slot.y, size);
        if (!mini) continue;
        trialBoxes.push(box);
        trial.push(mini);
      }
      if (!ok || trial.length === 0) continue;

      if (moreCount > 0 && slots[shown.length]) {
        const slot = slots[shown.length]!;
        const moreSize = size * 0.85;
        const box: Box = { x: slot.x, y: slot.y, w: moreSize, h: moreSize };
        if (
          !occupied.some((o) => overlaps(box, o, gap * 0.45)) &&
          !trialBoxes.some((o) => overlaps(box, o, gap * 0.3))
        ) {
          trial.push({
            key: `${t.id}:more`,
            territoryId: t.id,
            buildingId: "_more",
            spriteId: "",
            spriteUrl: "",
            x: slot.x,
            y: slot.y,
            size: moreSize,
            constructing: false,
            progress: 1,
            more: moreCount,
          });
          trialBoxes.push(box);
        }
      }

      placed = trial;
      for (const box of trialBoxes) occupied.push(box);
      break;
    }

    if (placed) {
      out.push(...placed);
      continue;
    }

    // Mid/deep fallback: always show a compact marker when the cluster won't fit
    const compact = tryPlaceCompact(
      t,
      buildings,
      baseX,
      belowY,
      Math.max(size * 0.85, 1.6),
      gap,
      occupied,
    );
    if (compact) out.push(compact);
  }

  return out;
}

/** Stable fingerprint so React only reflows when buildings change. */
export function buildingsFingerprint(
  territoryState: Record<string, TerritoryState>,
): string {
  const parts: string[] = [];
  for (const id of Object.keys(territoryState).sort()) {
    const b = territoryState[id]?.buildings;
    if (!b?.length) continue;
    parts.push(
      `${id}:${b
        .map((x) => `${x.instanceId}:${x.buildingId}:${x.buildRemaining}`)
        .join(",")}`,
    );
  }
  return parts.join("|");
}
