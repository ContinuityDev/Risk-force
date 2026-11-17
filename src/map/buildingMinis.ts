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
  groundedOccupancyBox,
  labelKeepOutBox,
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
  instanceId?: string;
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
 * Assumes ~540–700px map CSS width (drawer-safe). Deep/mid target ≥24px tall
 * on a typical 844×390 frame; caps keep inland clusters readable.
 */
export function iconWorldSize(
  zoomScale: number,
  camW: number,
  tier: MiniZoomTier,
): number {
  // Target ≥24px on mobile landscape focus frames. Map CSS is often
  // height-limited (≈844×300 under the HUD), so scale ≈ camH-limited
  // (~3.3px/wu at camW=180) — need ≥~7.5wu paint, not camW/width alone.
  const frac =
    tier === "deep" ? 0.055 : tier === "mid" ? 0.042 : 0.026;
  const raw = camW * frac;
  const min = tier === "deep" ? 8.2 : tier === "mid" ? 6.0 : 4.5;
  const max = tier === "deep" ? 11.5 : tier === "mid" ? 8.2 : 6.2;
  void zoomScale;
  return Math.min(max, Math.max(min, raw));
}

/** @deprecated kept for tests — approximate screen px from zoom. */
export function targetScreenPx(zoomScale: number): number {
  const tier = miniZoomTier(zoomScale);
  const camW = 1000 * zoomScale;
  const wu = iconWorldSize(zoomScale, camW, tier);
  // Assume ~540px map CSS width (844 landscape minus right dock)
  return Math.min(56, Math.max(10, (wu / camW) * 540));
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
    instanceId: b.instanceId,
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
  occupied.push(groundedOccupancyBox(slot.x, slot.y, size * 1.15));
  let spriteId = "building-nexus";
  try {
    spriteId = getBuilding(sortBuildings(buildings)[0]!.buildingId).sprite.id;
  } catch {
    /* */
  }
  const top = sortBuildings(buildings)[0]!;
  return {
    key: `${t.id}:compact`,
    territoryId: t.id,
    buildingId: top.buildingId,
    instanceId: top.instanceId,
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
  const gap = Math.max(1.1, size * 0.22);
  // Peer occupancy only — each territory adds its own label keep-out so
  // adjacent names (Indonesia / Malaysia) don't steal each other's slots.
  const occupied: Box[] = [];
  const out: PlacedMini[] = [];

  const ranked = [...territories].sort((a, b) => b.area - a.area);

  for (const t of ranked) {
    const ts = territoryState[t.id];
    if (showTerritory && !showTerritory(t, ts)) continue;
    const buildings = (ts?.buildings ?? []).filter((b) => b.hp > 0);
    if (!buildings.length) continue;

    const pole = getTerritoryAnchors(t).pole;
    const isPlayerBase = ts?.owner && ts.owner !== "neutral";
    // Always keep player bases; cull quiet neutrals that are far off-camera.
    if (
      !isPlayerBase &&
      (pole.x < cam.x - 40 ||
        pole.x > cam.x + cam.w + 40 ||
        pole.y < cam.y - 40 ||
        pole.y > cam.y + cam.h + 40)
    ) {
      continue;
    }

    // Own name is hard. Nearby foreign names get a glyph-tight keep-out
    // (not every label in the camera — that starved Indonesia under Thailand
    // / Vietnam padding).
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

    if (tier === "world") {
      // Player bases keep a compact building chip even at world zoom so the
      // map always shows something to tap; quiet neutrals stay bare.
      if (isPlayerBase) {
        const chip = Math.max(size * 1.35, 7.5);
        const compact =
          tryPlaceCompact(t, buildings, chip, gap, localOcc) ??
          forcePlayerCompact(t, buildings, chip, localOcc);
        if (compact) {
          occupied.push(groundedOccupancyBox(compact.x, compact.y, compact.size * 0.62));
          out.push(compact);
        }
      }
      continue;
    }

    const sorted = sortBuildings(buildings);
    if (tier === "mid" && isSmallPlot(t.area)) {
      const before = localOcc.length;
      const compact =
        tryPlaceCompact(
          t,
          buildings,
          Math.max(size * 0.85, 5.5),
          gap,
          localOcc,
        ) ??
        (isPlayerBase
          ? forcePlayerCompact(t, buildings, Math.max(size * 0.85, 5.5), localOcc)
          : null);
      if (compact) {
        for (let i = before; i < localOcc.length; i++) occupied.push(localOcc[i]!);
        out.push(compact);
      }
      continue;
    }

    const maxShow = tier === "mid" ? Math.min(3, sorted.length) : sorted.length;
    const shown = sorted.slice(0, maxShow);
    // Prefer a spread of readable icons (≥24px on 844 focus frames) over a
    // single oversized chip parked by the label.
    const paintSize = size;
    // ≥24px on height-limited 844×390 map ≈ 7.8wu at focus scale ~3.3px/wu.
    const minReadable = Math.max(7.8, paintSize * 0.78);
    const sizeTries =
      tier === "deep"
        ? [
            paintSize,
            paintSize * 0.92,
            paintSize * 0.85,
            minReadable,
            Math.max(6.6, paintSize * 0.7),
          ]
        : [paintSize, paintSize * 0.88, paintSize * 0.75, minReadable, Math.max(5.2, paintSize * 0.65)];
    let placed = false;
    let bestTrial: { minis: PlacedMini[]; occ: Box[]; score: number } | null =
      null;
    for (const trySize of sizeTries) {
      const want = shown.length + (sorted.length > shown.length ? 1 : 0);
      const centers = claimInteriorCluster(
        t,
        want,
        trySize,
        localOcc,
        Math.max(gap * 0.12, trySize * 0.04),
      );
      if (centers.length === 0) continue;

      const placeN = Math.min(shown.length, centers.length);
      const trial: PlacedMini[] = [];
      const trialOcc: Box[] = [];
      for (let i = 0; i < placeN; i++) {
        const c = centers[i]!;
        const mini = toMini(t.id, shown[i]!, c.x, c.y, trySize);
        if (!mini) continue;
        trialOcc.push(groundedOccupancyBox(c.x, c.y, trySize * 0.55));
        trial.push(mini);
      }
      const leftover = sorted.length - placeN;
      if (leftover > 0 && centers[placeN]) {
        const c = centers[placeN]!;
        const moreSize = trySize * 0.85;
        trialOcc.push(groundedOccupancyBox(c.x, c.y, moreSize * 0.55));
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
          more: leftover,
        });
      } else if (leftover > 0 && trial.length === 1) {
        trial[0] = { ...trial[0]!, compact: true, count: sorted.length };
      }
      if (!trial.length) continue;
      // Score: ≥~24px (5.0–5.5wu on focus frames) beats stuffing every
      // building at ~4wu; full sets still win when they stay readable.
      // Never let a full set of tiny chips beat a readable spread.
      const fullBonus =
        trial.length >= shown.length
          ? trySize >= minReadable
            ? 100
            : 20
          : 0;
      const readableBonus =
        trySize >= minReadable ? 220 : trySize >= 6.6 ? 50 : 0;
      const score = trial.length * 25 + fullBonus + readableBonus + trySize;
      // Full readable set — done.
      if (trial.length >= shown.length && trySize >= minReadable) {
        for (const box of trialOcc) occupied.push(box);
        out.push(...trial);
        placed = true;
        break;
      }
      if (!bestTrial || score > bestTrial.score) {
        bestTrial = { minis: trial, occ: trialOcc, score };
      }
    }
    if (!placed && bestTrial) {
      for (const box of bestTrial.occ) occupied.push(box);
      out.push(...bestTrial.minis);
      placed = true;
    }
    if (placed) continue;

    const before = localOcc.length;
    const compact = tryPlaceCompact(
      t,
      buildings,
      Math.max(size * 0.85, 5.5),
      gap,
      localOcc,
    );
    if (compact) {
      for (let i = before; i < localOcc.length; i++) occupied.push(localOcc[i]!);
      out.push(compact);
      continue;
    }

    // Player bases must stay visible — still clear the country label.
    if (isPlayerBase) {
      const forced = forcePlayerCompact(t, buildings, size, localOcc);
      if (forced) {
        occupied.push(groundedOccupancyBox(forced.x, forced.y, forced.size * 0.62));
        out.push(forced);
      }
    }
  }

  return out;
}

/** Last-resort chip for owned bases — inland + label keep-out respected. */
function forcePlayerCompact(
  t: TerritoryDef,
  buildings: PlacedBuilding[],
  size: number,
  occupied: Box[],
): PlacedMini | null {
  let placeSize = Math.max(size, 6.5);
  let slot: { x: number; y: number } | null = null;
  for (const trySize of [placeSize, placeSize * 0.85, placeSize * 0.7, 5.0, 3.8]) {
    slot = claimInteriorSlot(t, trySize, occupied, trySize * 0.18);
    if (slot) {
      placeSize = trySize;
      break;
    }
  }
  if (!slot) return null;
  occupied.push(groundedOccupancyBox(slot.x, slot.y, placeSize * 1.1));
  let spriteId = "building-nexus";
  try {
    spriteId = getBuilding(sortBuildings(buildings)[0]!.buildingId).sprite.id;
  } catch {
    /* */
  }
  const top = sortBuildings(buildings)[0]!;
  return {
    key: `${t.id}:compact`,
    territoryId: t.id,
    buildingId: top.buildingId,
    instanceId: top.instanceId,
    spriteId,
    spriteUrl: getSpriteUrl(spriteId),
    x: slot.x,
    y: slot.y,
    size: placeSize,
    constructing: false,
    progress: 1,
    compact: true,
    count: buildings.length,
  };
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
