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
  /** Overflow badge after the visible row (+N). */
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
  // Prefer pricier / tougher structures as a tiebreak
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

function iconScreenPx(tier: MiniZoomTier): number {
  if (tier === "world") return 11;
  if (tier === "mid") return 15;
  return 18;
}

/**
 * Place building thumbnails near each territory's label pole.
 * Sizes are counter-scaled with zoom so they stay roughly constant on screen.
 */
export function layoutBuildingMinis(
  territories: TerritoryDef[],
  territoryState: Record<string, TerritoryState>,
  zoomScale: number,
  cam: { x: number; y: number; w: number; h: number },
  labels: LabelBox[],
): PlacedMini[] {
  const tier = miniZoomTier(zoomScale);
  const screenPx = iconScreenPx(tier);
  const size = Math.max(1.2, screenPx * zoomScale);
  const gap = Math.max(0.6, 2.2 * zoomScale);
  const labelById = Object.fromEntries(labels.map((l) => [l.id, l]));
  const occupied: Box[] = labels.map((l) => ({
    x: l.x,
    y: l.y,
    w: l.w,
    h: l.h,
  }));
  const out: PlacedMini[] = [];

  // Prefer larger territories first so important bases win collisions
  const ranked = [...territories].sort((a, b) => b.area - a.area);

  for (const t of ranked) {
    const ts = territoryState[t.id];
    const buildings = ts?.buildings ?? [];
    if (!buildings.length) continue;

    // Cull off-camera (with margin)
    const ax = t.label.x;
    const ay = t.label.y;
    if (
      ax < cam.x - 30 ||
      ax > cam.x + cam.w + 30 ||
      ay < cam.y - 30 ||
      ay > cam.y + cam.h + 30
    ) {
      continue;
    }

    const lbl = labelById[t.id];
    const baseY = lbl
      ? lbl.y + lbl.h / 2 + gap + size / 2
      : ay + size * 0.85;
    const baseX = lbl?.x ?? ax;

    if (tier === "world") {
      // Compact: one base marker + count (cap noise at full world)
      if (zoomScale >= 0.98 && t.area < 0.004) continue;
      const box: Box = { x: baseX, y: baseY, w: size * 1.15, h: size * 1.15 };
      if (occupied.some((o) => overlaps(box, o, gap))) continue;
      occupied.push(box);
      let spriteId = "building-nexus";
      try {
        const head = sortBuildings(buildings)[0]!;
        spriteId = getBuilding(head.buildingId).sprite.id;
      } catch {
        /* */
      }
      out.push({
        key: `${t.id}:compact`,
        territoryId: t.id,
        buildingId: "command_nexus",
        spriteId,
        spriteUrl: getSpriteUrl(spriteId),
        x: baseX,
        y: baseY,
        size,
        constructing: false,
        progress: 1,
        compact: true,
        count: buildings.length,
      });
      continue;
    }

    const sorted = sortBuildings(buildings);
    const maxShow = tier === "mid" ? 3 : sorted.length;
    const shown = sorted.slice(0, maxShow);
    const more = sorted.length - shown.length;
    const rowW =
      shown.length * size + Math.max(0, shown.length - 1) * gap +
      (more > 0 ? size * 0.85 + gap : 0);
    let rowX0 = baseX - rowW / 2 + size / 2;

    // Nudge row vertically if it collides with labels; try a few offsets
    const yCandidates = [baseY, baseY + size + gap, baseY - (lbl ? lbl.h + size : size * 1.6)];
    let placedRow: PlacedMini[] | null = null;

    for (const y of yCandidates) {
      const trial: PlacedMini[] = [];
      const trialBoxes: Box[] = [];
      let x = rowX0;
      let failed = false;
      for (const b of shown) {
        let def;
        try {
          def = getBuilding(b.buildingId);
        } catch {
          continue;
        }
        const box: Box = { x, y, w: size, h: size };
        if (
          occupied.some((o) => overlaps(box, o, gap * 0.6)) ||
          trialBoxes.some((o) => overlaps(box, o, gap * 0.4))
        ) {
          failed = true;
          break;
        }
        const buildTime = Math.max(1, def.buildTime);
        const constructing = b.buildRemaining > 0;
        trialBoxes.push(box);
        trial.push({
          key: `${t.id}:${b.instanceId}`,
          territoryId: t.id,
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
        });
        x += size + gap;
      }
      if (failed) continue;

      if (more > 0) {
        const box: Box = { x, y, w: size * 0.85, h: size * 0.85 };
        if (
          !occupied.some((o) => overlaps(box, o, gap * 0.6)) &&
          !trialBoxes.some((o) => overlaps(box, o, gap * 0.4))
        ) {
          trial.push({
            key: `${t.id}:more`,
            territoryId: t.id,
            buildingId: "_more",
            spriteId: "",
            spriteUrl: "",
            x,
            y,
            size: size * 0.85,
            constructing: false,
            progress: 1,
            more,
          });
          trialBoxes.push(box);
        }
      }

      placedRow = trial;
      for (const box of trialBoxes) occupied.push(box);
      break;
    }

    if (placedRow) out.push(...placedRow);
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
