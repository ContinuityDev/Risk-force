import { getBuilding, isTrainingBuilding } from "../data/buildings";
import { TERRITORIES } from "../data/map/territories";
import { activeMapId } from "../data/maps/activate";
import type { TerritoryDef } from "../data/types";
import type { PlacedBuilding, TerritoryState } from "../engine/state";
import { getSpriteUrl } from "../sprites/registry";
import {
  claimInteriorCluster,
  claimInteriorSlot,
  getTerritoryAnchors,
} from "./territoryAnchors";

/** Median territory area for the active map — used to scale plot-size gates. */
let medianCache: { mapId: string; med: number } | null = null;
export function mapMedianArea(): number {
  const id = activeMapId();
  if (medianCache?.mapId === id) return medianCache.med;
  const areas = TERRITORIES.map((t) => t.area).sort((a, b) => a - b);
  const med = areas[Math.floor(areas.length / 2)] ?? 0.01;
  medianCache = { mapId: id, med };
  return med;
}

/** True when a plot is small relative to the active map (not absolute Earth units). */
export function isSmallPlot(area: number, factor = 0.85): boolean {
  return area < mapMedianArea() * factor;
}

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
  // Building pads only appear once zoomed in further — mid was too noisy
  // over Europe / the US Northeast at regional framing.
  if (zoomScale >= 0.42) return "mid";
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
    tier === "deep" ? 0.058 : tier === "mid" ? 0.034 : 0.013;
  const raw = camW * frac;
  // Hard clamps in world units — slightly tighter so dense regions stay readable.
  const min = tier === "deep" ? 3.6 : tier === "mid" ? 1.8 : 1.2;
  const max = tier === "deep" ? 7.5 : tier === "mid" ? 5.0 : 2.6;
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
  size: number,
  gap: number,
  occupied: Box[],
): PlacedMini | null {
  const slot = claimInteriorSlot(t, size, occupied, gap * 0.5);
  if (!slot) return null;
  const b: Box = { x: slot.x, y: slot.y, w: size * 1.15, h: size * 1.15 };
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
    x: slot.x,
    y: slot.y,
    size,
    constructing: false,
    progress: 1,
    compact: true,
    count: buildings.length,
  };
}

/**
 * Place building thumbnails on interior land anchors (never on water).
 * Screen size grows with zoom-in; deep zoom uses a compact inland cluster.
 */
export function layoutBuildingMinis(
  territories: TerritoryDef[],
  territoryState: Record<string, TerritoryState>,
  zoomScale: number,
  cam: { x: number; y: number; w: number; h: number },
  labels: LabelBox[],
  /** When set, only emit chrome for focused territories (declutter). */
  showTerritory?: (t: TerritoryDef, ts: TerritoryState | undefined) => boolean,
): PlacedMini[] {
  const tier = miniZoomTier(zoomScale);
  const size = iconWorldSize(zoomScale, cam.w, tier);
  const gap = Math.max(0.8, size * 0.16);
  // Soft label avoid — prefer inland slots that don't cover glyphs.
  const occupied: Box[] = labels.map((l) => ({
    x: l.x,
    y: l.y,
    w: Math.max(l.w * 1.15, size * 1.8, 8),
    h: Math.max(l.h * 1.25, size * 0.8, 3.5),
  }));
  const out: PlacedMini[] = [];

  const ranked = [...territories].sort((a, b) => b.area - a.area);

  for (const t of ranked) {
    const ts = territoryState[t.id];
    if (showTerritory && !showTerritory(t, ts)) continue;
    const buildings = (ts?.buildings ?? []).filter((b) => b.hp > 0);
    if (!buildings.length) continue;

    const pole = getTerritoryAnchors(t).pole;
    if (
      pole.x < cam.x - 40 ||
      pole.x > cam.x + cam.w + 40 ||
      pole.y < cam.y - 40 ||
      pole.y > cam.y + cam.h + 40
    ) {
      continue;
    }

    if (tier === "world") {
      // World zoom: unit strength chips own the pole.
      continue;
    }

    const sorted = sortBuildings(buildings);
    if (tier === "mid" && isSmallPlot(t.area)) {
      const compact = tryPlaceCompact(
        t,
        buildings,
        Math.max(size * 0.8, 1.5),
        gap,
        occupied,
      );
      if (compact) out.push(compact);
      continue;
    }

    const maxShow = tier === "mid" ? Math.min(3, sorted.length) : sorted.length;
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
      const trial: PlacedMini[] = [];
      for (let i = 0; i < shown.length; i++) {
        const c = centers[i]!;
        const mini = toMini(t.id, shown[i]!, c.x, c.y, size);
        if (!mini) continue;
        occupied.push({ x: c.x, y: c.y, w: size, h: size });
        trial.push(mini);
      }
      if (moreCount > 0 && centers[shown.length]) {
        const c = centers[shown.length]!;
        const moreSize = size * 0.85;
        occupied.push({ x: c.x, y: c.y, w: moreSize, h: moreSize });
        trial.push({
          key: `${t.id}:more`,
          territoryId: t.id,
          buildingId: "_more",
          spriteId: "",
          spriteUrl: "",
          x: c.x,
          y: c.y,
          size: moreSize,
          constructing: false,
          progress: 1,
          more: moreCount,
        });
      }
      if (trial.length) {
        out.push(...trial);
        continue;
      }
    }

    const compact = tryPlaceCompact(
      t,
      buildings,
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
