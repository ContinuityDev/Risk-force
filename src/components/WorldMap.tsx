import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { biomeLabel } from "../data/biomes";
import { CONTINENT_LIST } from "../data/continents";
import { getDoctrine } from "../data/doctrines";
import { factionColor, factionName } from "../data/factions";
import { HELP } from "../data/gameLoop";
import { territoryAbbrev } from "../data/map/abbreviations";
import {
  LAND_PATH,
  OCEAN_VIEW,
  SEA_ROUTES,
} from "../data/map/earthPaths";
import { TERRITORIES } from "../data/map/territories";
import type { TerritoryDef } from "../data/types";
import type { GameAction } from "../engine/actions";
import { commandersOnTerritory } from "../engine/commanders";
import { travelTurns } from "../engine/movement";
import {
  approximateGarrison,
  formatGarrisonIntel,
  isTerritoryRevealed,
} from "../engine/recon";
import type { GameState, StrikeKind } from "../engine/state";
import {
  playerHasStrikeAsset,
  STRIKE_DEFS,
  strikeCooldownLeft,
} from "../engine/strikes";
import {
  factionDisplayName,
  formatUnitRange,
  territoryDisplayName,
  unitDisplayName,
} from "../ui/displayNames";
import {
  buildingsFingerprint,
  layoutBuildingMinis,
} from "../map/buildingMinis";
import {
  garrisonFingerprint,
  layoutTransitUnitMinis,
  layoutUnitMinis,
  transitFingerprint,
} from "../map/unitMinis";
import { Drawer } from "./Drawer";
import {
  InvadeFromPanel,
  type InvadeOriginPlan,
} from "./InvadeFromPanel";

interface WorldMapProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
  /** Optional viewBox override for focused screenshots / regional zoom. */
  focusViewBox?: string;
}

interface PlacedLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  w: number;
  h: number;
}

interface Camera {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_VIEW_W = 80;
/** At world framing (scale≈1) no labels. As scale drops (zoom in), larger territories unlock first. */
/** Relative to map median area so Civil War NE states unlock like Earth nations. */
const LABEL_REL_THRESHOLDS = [
  { maxScale: 0.72, minRel: 1.0 },
  { maxScale: 0.48, minRel: 0.25 },
  { maxScale: 0.35, minRel: 0.04 },
  { maxScale: 0.25, minRel: 0.01 },
  { maxScale: 0.16, minRel: 0 },
];

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function approxTextWidth(text: string, size: number): number {
  return text.length * size * 0.56 + 4;
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  pad = 3,
): boolean {
  return !(
    a.x + a.w / 2 + pad < b.x - b.w / 2 ||
    a.x - a.w / 2 - pad > b.x + b.w / 2 ||
    a.y + a.h / 2 + pad < b.y - b.h / 2 ||
    a.y - a.h / 2 - pad > b.y + b.h / 2
  );
}

function parseViewBox(vb: string): Camera {
  const [x, y, w, h] = vb.trim().split(/[\s,]+/).map(Number);
  return {
    x: x || 0,
    y: y || 0,
    w: w || OCEAN_VIEW.w,
    h: h || OCEAN_VIEW.h,
  };
}

function clampCamera(cam: Camera): Camera {
  let { x, y, w, h } = cam;
  w = Math.min(OCEAN_VIEW.w, Math.max(MIN_VIEW_W, w));
  h = w * (OCEAN_VIEW.h / OCEAN_VIEW.w);
  x = Math.min(OCEAN_VIEW.w - w, Math.max(0, x));
  y = Math.min(OCEAN_VIEW.h - h, Math.max(0, y));
  return { x, y, w, h };
}

function camToViewBox(cam: Camera): string {
  const c = clampCamera(cam);
  return `${c.x} ${c.y} ${c.w} ${c.h}`;
}

/**
 * Progressive labels:
 * - World zoom: 2-letter / short abbreviations for every plot that fits.
 * - Mid/deep: larger territories unlock first; prefer full names, fall back
 *   to abbreviations. Collision → shrink / abbreviate; never hide an unlocked
 *   label that fits. Hover/selection names live in the panel.
 */
function layoutLabels(
  territories: TerritoryDef[],
  zoomScale: number,
  cam: Camera,
): PlacedLabel[] {
  const worldZoom = zoomScale >= 0.85;

  const areas = territories.map((t) => t.area).sort((a, b) => a - b);
  const median = areas[Math.floor(areas.length / 2)] ?? 0.01;
  let minRel = 0;
  if (!worldZoom) {
    minRel = Infinity;
    for (const t of LABEL_REL_THRESHOLDS) {
      if (zoomScale <= t.maxScale) minRel = t.minRel;
    }
    if (!Number.isFinite(minRel)) return [];
  }
  const minArea = median * minRel;

  const visible = territories.filter((t) => {
    if (!worldZoom && t.area < minArea) return false;
    return (
      t.label.x >= cam.x - 20 &&
      t.label.x <= cam.x + cam.w + 20 &&
      t.label.y >= cam.y - 20 &&
      t.label.y <= cam.y + cam.h + 20
    );
  });

  const ranked = [...visible].sort((a, b) => b.area - a.area);
  const placed: PlacedLabel[] = [];

  for (const t of ranked) {
    const full = t.name;
    const short = territoryAbbrev(t.id, t.name);
    const preferScreen = Math.min(
      13,
      Math.max(9, 9 + Math.sqrt(t.area) * 10),
    );
    // World zoom: abbreviations only (TX / CA / Britain), so the full USA
    // frame stays readable without drowning in full state names.
    const candidates: Array<{ text: string; screenPx: number }> = worldZoom
      ? [
          { text: short, screenPx: short.length <= 3 ? 9 : 8 },
          { text: short, screenPx: 7.5 },
          { text: short, screenPx: 6.5 },
        ]
      : [
          { text: full, screenPx: preferScreen },
          { text: full, screenPx: 10 },
          { text: short, screenPx: preferScreen },
          { text: short, screenPx: 9 },
          { text: short, screenPx: 8 },
        ];

    let chosen: PlacedLabel | null = null;
    for (const c of candidates) {
      const size = c.screenPx * zoomScale;
      const cand: PlacedLabel = {
        id: t.id,
        text: c.text,
        x: t.label.x,
        y: t.label.y,
        size,
        w: approxTextWidth(c.text, size),
        h: size + 2 * zoomScale,
      };
      const pad = worldZoom ? 1.2 : 3;
      if (!placed.some((p) => overlaps(cand, p, pad))) {
        chosen = cand;
        break;
      }
    }
    if (chosen) placed.push(chosen);
  }
  return placed;
}

const PAN_SELECT_SLOP_PX = 10;

export function WorldMap({ state, dispatch, focusViewBox }: WorldMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  /** Continent bonuses — open on large desktops; collapsed elsewhere / toggle. */
  const [legendOpen, setLegendOpen] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 1280px) and (min-height: 800px)").matches,
  );
  /** Selected-territory right sheet (always used on short landscape). */
  const [detailOpen, setDetailOpen] = useState(false);
  const [shortLandscape, setShortLandscape] = useState(false);
  const [invadeOpen, setInvadeOpen] = useState(false);
  /** Compact ops strip on enemy sheets: strike picker or recon picker. */
  const [opsMode, setOpsMode] = useState<null | "strike" | "recon">(null);
  const [strikePick, setStrikePick] = useState<StrikeKind>("cruise");
  const [invadePlans, setInvadePlans] = useState<InvadeOriginPlan[]>([]);
  const onInvadePlans = useCallback((plans: InvadeOriginPlan[]) => {
    setInvadePlans(plans);
  }, []);
  useEffect(() => {
    setOpsMode(null);
    setInvadeOpen(false);
  }, [state.selectedTerritoryId]);
  useEffect(() => {
    const mq = window.matchMedia(
      "(orientation: landscape) and (max-height: 500px)",
    );
    const sync = () => setShortLandscape(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const svgRef = useRef<SVGSVGElement>(null);
  /** Active pointers for one-finger pan + two-finger pinch. */
  const pointersRef = useRef<
    Map<number, { x: number; y: number; onTerritory: boolean }>
  >(new Map());
  const gestureRef = useRef<{
    mode: "none" | "pan" | "pinch";
    origin: Camera;
    startDist: number;
    startMid: { x: number; y: number };
    moved: boolean;
    pendingTerritoryId: string | null;
  }>({
    mode: "none",
    origin: { x: 0, y: 0, w: OCEAN_VIEW.w, h: OCEAN_VIEW.h },
    startDist: 0,
    startMid: { x: 0, y: 0 },
    moved: false,
    pendingTerritoryId: null,
  });
  const cameraRef = useRef<Camera>({ x: 0, y: 0, w: OCEAN_VIEW.w, h: OCEAN_VIEW.h });
  const rafRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const initialCam = useMemo(() => {
    if (focusViewBox) return parseViewBox(focusViewBox);
    return { x: 0, y: 0, w: OCEAN_VIEW.w, h: OCEAN_VIEW.h };
  }, [focusViewBox]);

  const [camera, setCamera] = useState<Camera>(initialCam);
  useEffect(() => {
    setCamera(initialCam);
    cameraRef.current = initialCam;
  }, [initialCam]);

  // Theater swap (World War ↔ Civil War) resets framing to the live viewBox.
  useEffect(() => {
    if (focusViewBox) return;
    const next = { x: 0, y: 0, w: OCEAN_VIEW.w, h: OCEAN_VIEW.h };
    setCamera(next);
    cameraRef.current = next;
  }, [state.mapId, focusViewBox]);

  useEffect(() => {
    const id = state.selectedTerritoryId;
    if (!id) return;
    setDetailOpen(true);
    const t = TERRITORIES.find((x) => x.id === id);
    if (!t) return;
    // Frame selection in the left ~58% so the right drawer does not cover it.
    const focusW = Math.min(OCEAN_VIEW.w, Math.max(MIN_VIEW_W * 1.6, OCEAN_VIEW.w * 0.32));
    const focusH = focusW * (OCEAN_VIEW.h / OCEAN_VIEW.w);
    const cx = t.label.x + focusW * 0.14;
    const cy = t.label.y;
    const next = clampCamera({
      x: cx - focusW / 2,
      y: cy - focusH / 2,
      w: focusW,
      h: focusH,
    });
    cameraRef.current = next;
    setCamera(next);
  }, [state.selectedTerritoryId]);

  const humanId = useMemo(
    () => Object.values(state.players).find((p) => p.kind === "human")?.id,
    [state.players],
  );
  const ownedTerritories = useMemo(
    () =>
      TERRITORIES.filter(
        (t) => humanId && state.territories[t.id]?.owner === humanId,
      ),
    [state.territories, humanId],
  );

  const zoomScale = camera.w / OCEAN_VIEW.w;
  const viewBox = camToViewBox(camera);

  // Defer label layout during continuous gestures for mid-range phones.
  const deferredCam = useDeferredValue(camera);
  const labels = useMemo(
    () =>
      layoutLabels(
        TERRITORIES,
        deferredCam.w / OCEAN_VIEW.w,
        deferredCam,
      ),
    [deferredCam],
  );

  const bldgFp = useMemo(
    () => buildingsFingerprint(state.territories),
    [state.territories],
  );
  const buildingMinis = useMemo(
    () =>
      layoutBuildingMinis(
        TERRITORIES,
        state.territories,
        deferredCam.w / OCEAN_VIEW.w,
        deferredCam,
        labels,
      ),
    // bldgFp tracks building mutations without deep-comparing territory state
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deferredCam, labels, bldgFp],
  );

  const garFp = useMemo(
    () => garrisonFingerprint(state.territories),
    [state.territories],
  );
  const transitFp = useMemo(
    () => transitFingerprint(state.armiesInTransit),
    [state.armiesInTransit],
  );
  const unitMinis = useMemo(() => {
    const occupied = buildingMinis.map((m) => ({
      x: m.x,
      y: m.y,
      w: m.size,
      h: m.size,
    }));
    return layoutUnitMinis(
      TERRITORIES,
      state.territories,
      deferredCam.w / OCEAN_VIEW.w,
      deferredCam,
      labels,
      occupied,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredCam, labels, buildingMinis, garFp]);
  const transitMinis = useMemo(
    () =>
      layoutTransitUnitMinis(
        state.armiesInTransit ?? [],
        TERRITORIES,
        deferredCam.w / OCEAN_VIEW.w,
        deferredCam,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deferredCam, transitFp],
  );

  const scheduleCamera = useCallback((next: Camera) => {
    cameraRef.current = next;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setCamera(cameraRef.current);
    });
  }, []);

  const clientToWorldAt = useCallback(
    (clientX: number, clientY: number, cam: Camera) => {
      const el = svgRef.current;
      if (!el) return { x: cam.x + cam.w / 2, y: cam.y + cam.h / 2 };
      const rect = el.getBoundingClientRect();
      const px = (clientX - rect.left) / Math.max(1, rect.width);
      const py = (clientY - rect.top) / Math.max(1, rect.height);
      return {
        x: cam.x + px * cam.w,
        y: cam.y + py * cam.h,
      };
    },
    [],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
      const prev = cameraRef.current;
      const pivot = clientToWorldAt(e.clientX, e.clientY, prev);
      const nw = Math.min(OCEAN_VIEW.w, Math.max(MIN_VIEW_W, prev.w * factor));
      const nh = nw * (OCEAN_VIEW.h / OCEAN_VIEW.w);
      const nx = pivot.x - ((pivot.x - prev.x) / prev.w) * nw;
      const ny = pivot.y - ((pivot.y - prev.y) / prev.h) * nh;
      scheduleCamera(clampCamera({ x: nx, y: ny, w: nw, h: nh }));
    },
    [clientToWorldAt, scheduleCamera],
  );

  const pointerDistance = () => {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return 0;
    const a = pts[0]!;
    const b = pts[1]!;
    return Math.hypot(b.x - a.x, b.y - a.y);
  };

  const pointerMid = () => {
    const pts = [...pointersRef.current.values()];
    if (pts.length === 0) return { x: 0, y: 0 };
    if (pts.length === 1) return { x: pts[0]!.x, y: pts[0]!.y };
    return {
      x: (pts[0]!.x + pts[1]!.x) / 2,
      y: (pts[0]!.y + pts[1]!.y) / 2,
    };
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      const target = e.target as Element;
      const onTerritory = Boolean(
        target.closest?.(
          ".rf-map__territory, .rf-map__bldg-hit, .rf-map__unit-hit",
        ),
      );
      const territoryId =
        target
          .closest?.("[data-territory-id]")
          ?.getAttribute("data-territory-id") ?? null;

      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      pointersRef.current.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        onTerritory,
      });

      const g = gestureRef.current;
      g.origin = { ...cameraRef.current };
      g.moved = false;

      if (pointersRef.current.size >= 2) {
        g.mode = "pinch";
        g.startDist = Math.max(1, pointerDistance());
        g.startMid = pointerMid();
        g.pendingTerritoryId = null;
        setDragging(true);
        return;
      }

      // One finger: allow pan from anywhere; suppress select if we drag.
      g.mode = "pan";
      g.pendingTerritoryId = onTerritory ? territoryId : null;
      g.startMid = { x: e.clientX, y: e.clientY };
      setDragging(true);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, {
        ...(pointersRef.current.get(e.pointerId) ?? {
          onTerritory: false,
        }),
        x: e.clientX,
        y: e.clientY,
      });

      const g = gestureRef.current;
      const el = svgRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();

      if (pointersRef.current.size >= 2) {
        if (g.mode !== "pinch") {
          g.mode = "pinch";
          g.origin = { ...cameraRef.current };
          g.startDist = Math.max(1, pointerDistance());
          g.startMid = pointerMid();
          g.pendingTerritoryId = null;
        }
        const dist = Math.max(1, pointerDistance());
        const mid = pointerMid();
        const factor = g.startDist / dist;
        const nw = Math.min(
          OCEAN_VIEW.w,
          Math.max(MIN_VIEW_W, g.origin.w * factor),
        );
        const nh = nw * (OCEAN_VIEW.h / OCEAN_VIEW.w);
        const pivot = clientToWorldAt(mid.x, mid.y, g.origin);
        const nx = pivot.x - ((pivot.x - g.origin.x) / g.origin.w) * nw;
        const ny = pivot.y - ((pivot.y - g.origin.y) / g.origin.h) * nh;
        g.moved = true;
        scheduleCamera(clampCamera({ x: nx, y: ny, w: nw, h: nh }));
        return;
      }

      if (g.mode !== "pan") return;
      const dxPx = e.clientX - g.startMid.x;
      const dyPx = e.clientY - g.startMid.y;
      if (
        !g.moved &&
        Math.hypot(dxPx, dyPx) >= PAN_SELECT_SLOP_PX
      ) {
        g.moved = true;
        g.pendingTerritoryId = null;
      }
      if (!g.moved && g.pendingTerritoryId) {
        // Still a potential tap — don't pan yet.
        return;
      }
      const dx = (dxPx / rect.width) * g.origin.w;
      const dy = (dyPx / rect.height) * g.origin.h;
      scheduleCamera(
        clampCamera({
          ...g.origin,
          x: g.origin.x - dx,
          y: g.origin.y - dy,
        }),
      );
    },
    [clientToWorldAt, scheduleCamera],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.delete(e.pointerId);
      const g = gestureRef.current;

      if (pointersRef.current.size === 0) {
        if (
          g.mode === "pan" &&
          !g.moved &&
          g.pendingTerritoryId
        ) {
          dispatch({
            type: "SELECT_TERRITORY",
            payload: { territoryId: g.pendingTerritoryId },
          });
        }
        g.mode = "none";
        g.pendingTerritoryId = null;
        g.moved = false;
        setDragging(false);
        // Commit any pending camera frame
        setCamera(cameraRef.current);
        return;
      }

      if (pointersRef.current.size === 1) {
        // Drop from pinch to pan
        g.mode = "pan";
        g.origin = { ...cameraRef.current };
        const rem = [...pointersRef.current.values()][0]!;
        g.startMid = { x: rem.x, y: rem.y };
        g.pendingTerritoryId = null;
        g.moved = true;
      }
    },
    [dispatch],
  );

  const selected = state.selectedTerritoryId
    ? TERRITORIES.find((t) => t.id === state.selectedTerritoryId)
    : null;
  const selectedTs = state.selectedTerritoryId
    ? state.territories[state.selectedTerritoryId]
    : null;
  const selectedIsEnemy = Boolean(
    selected &&
      selectedTs &&
      humanId &&
      selectedTs.owner !== humanId,
  );
  const hovered = hoveredId
    ? TERRITORIES.find((t) => t.id === hoveredId)
    : null;

  useEffect(() => {
    setInvadeOpen(false);
    setInvadePlans([]);
  }, [state.selectedTerritoryId]);

  // Friendly neighbors for march UI
  const marchTargets = useMemo(() => {
    if (!selected || !selectedTs) return [];
    const pid = Object.values(state.players).find((p) => p.kind === "human")?.id;
    if (!pid || selectedTs.owner !== pid) return [];
    return selected.neighbors.filter(
      (n) => state.territories[n]?.owner === pid,
    );
  }, [selected, selectedTs, state.players, state.territories]);

  return (
    <div className="rf-map rf-fade-in">
      <svg
        ref={svgRef}
        className={`rf-map__svg${dragging ? " is-dragging" : ""}`}
        viewBox={viewBox}
        role="img"
        data-tutorial="map-svg"
        aria-label="Earth theater strategic map — scroll or pinch to zoom, drag to pan, tap to select"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <defs>
          <radialGradient id="rf-ocean" cx="50%" cy="42%" r="70%">
            <stop offset="0%" stopColor="#1a3a52" />
            <stop offset="45%" stopColor="#0f2438" />
            <stop offset="100%" stopColor="#070e18" />
          </radialGradient>
          <linearGradient id="rf-holo-sheen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7eb6c9" stopOpacity="0.06" />
            <stop offset="50%" stopColor="#7eb6c9" stopOpacity="0" />
            <stop offset="100%" stopColor="#c4a574" stopOpacity="0.04" />
          </linearGradient>
          <pattern
            id="rf-holo-grid"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 24 0 L 0 0 0 24"
              fill="none"
              stroke="#7eb6c9"
              strokeWidth="0.35"
              opacity="0.1"
            />
          </pattern>
          <filter id="rf-land-glow" x="-8%" y="-8%" width="116%" height="116%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="rf-select-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="rf-label-halo" x="-40%" y="-50%" width="180%" height="200%">
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation={Math.max(0.35, 0.9 * zoomScale)}
              floodColor="#040a10"
              floodOpacity="0.92"
            />
          </filter>
          <marker
            id="rf-ai-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#e8b060" />
          </marker>
          <marker
            id="rf-march-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#9fd4e4" />
          </marker>
          <marker
            id="rf-invade-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5.5"
            markerHeight="5.5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#e07060" />
          </marker>
        </defs>

        <rect width={OCEAN_VIEW.w} height={OCEAN_VIEW.h} fill="url(#rf-ocean)" />
        <rect
          width={OCEAN_VIEW.w}
          height={OCEAN_VIEW.h}
          fill="url(#rf-holo-sheen)"
          pointerEvents="none"
        />

        <path
          d={LAND_PATH}
          fill="#0c1824"
          fillOpacity="0.55"
          stroke="#3a5a6a"
          strokeWidth={0.55 * zoomScale}
          pointerEvents="none"
        />

        <g className="rf-map__routes" fill="none">
          {SEA_ROUTES.map((r, i) => (
            <path
              key={i}
              d={r.d}
              stroke="#7eb6c9"
              strokeWidth="0.9"
              strokeDasharray="2.5 5"
              opacity="0.32"
              className="rf-map__route"
            />
          ))}
        </g>

        {state.aiAttackPlans.length > 0 && (
          <g className="rf-map__ai-plans" pointerEvents="none">
            {state.aiAttackPlans.map((plan, i) => {
              const from = TERRITORIES.find((t) => t.id === plan.fromId);
              const to = TERRITORIES.find((t) => t.id === plan.toId);
              if (!from || !to) return null;
              const x1 = from.label.x;
              const y1 = from.label.y;
              const x2 = to.label.x;
              const y2 = to.label.y;
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2 - 8;
              return (
                <g key={`${plan.fromId}-${plan.toId}-${i}`}>
                  <path
                    d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`}
                    fill="none"
                    stroke="#e8b060"
                    strokeWidth={Math.max(1.2, 2.2 * zoomScale)}
                    strokeDasharray="4 3"
                    opacity="0.9"
                    markerEnd="url(#rf-ai-arrow)"
                  />
                </g>
              );
            })}
          </g>
        )}

        {invadeOpen && invadePlans.length > 0 && selected && (
          <g className="rf-map__invade-plans" pointerEvents="none">
            {invadePlans.map((plan) => {
              const from = TERRITORIES.find((t) => t.id === plan.fromId);
              if (!from) return null;
              const x1 = from.label.x;
              const y1 = from.label.y;
              const x2 = selected.label.x;
              const y2 = selected.label.y;
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2 - 10;
              return (
                <g key={`invade-${plan.fromId}`}>
                  <path
                    d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`}
                    fill="none"
                    stroke="#e07060"
                    strokeWidth={Math.max(1.4, 2.4 * zoomScale)}
                    strokeDasharray="6 4"
                    opacity="0.95"
                    markerEnd="url(#rf-invade-arrow)"
                  />
                </g>
              );
            })}
          </g>
        )}

        {(state.armiesInTransit ?? []).length > 0 && (
          <g className="rf-map__marches" pointerEvents="none">
            {state.armiesInTransit.map((army) => {
              const from = TERRITORIES.find((t) => t.id === army.fromId);
              const to = TERRITORIES.find((t) => t.id === army.toId);
              if (!from || !to) return null;
              const progress =
                1 - army.turnsRemaining / Math.max(1, army.totalTurns);
              const x1 = from.label.x;
              const y1 = from.label.y;
              const x2 = to.label.x;
              const y2 = to.label.y;
              const mx = x1 + (x2 - x1) * Math.min(0.85, 0.15 + progress * 0.7);
              const my =
                y1 + (y2 - y1) * Math.min(0.85, 0.15 + progress * 0.7) - 6;
              const col = factionColor(army.owner);
              const headCount = army.force.reduce((s, f) => s + f.count, 0);
              return (
                <g key={army.id}>
                  <path
                    d={`M ${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 - 10} ${x2} ${y2}`}
                    fill="none"
                    stroke={col}
                    strokeWidth={Math.max(1.1, 2 * zoomScale)}
                    strokeDasharray="5 4"
                    opacity="0.85"
                    markerEnd="url(#rf-march-arrow)"
                  />
                  <circle cx={mx} cy={my} r={5 * zoomScale} fill={col} />
                  <text
                    x={mx}
                    y={my - 7 * zoomScale}
                    textAnchor="middle"
                    className="rf-map__eta"
                    fontSize={Math.max(7, 9 * zoomScale)}
                    fill="#e8eef4"
                  >
                    ETA {army.turnsRemaining} · {headCount}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {TERRITORIES.map((t) => {
          const ts = state.territories[t.id];
          const owner = ts?.owner ?? t.startingOwner;
          const isNeutral = owner === "neutral";
          const base = factionColor(owner);
          const isSelected = state.selectedTerritoryId === t.id;
          return (
            <g
              key={t.id}
              className="rf-map__territory-group"
              onMouseEnter={() => setHoveredId(t.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <path
                d={t.path}
                className={`rf-map__territory${isSelected ? " is-selected" : ""}${isNeutral ? " is-neutral" : ""}`}
                data-territory-id={t.id}
                data-owner={owner}
                fill={hexToRgba(base, isNeutral ? (isSelected ? 0.72 : 0.55) : isSelected ? 0.9 : 0.82)}
                stroke={
                  isSelected ? "#e8f4f8" : isNeutral ? "#9aa3ad" : "#7eb6c9"
                }
                strokeDasharray={isNeutral ? `${2.2 * zoomScale} ${1.6 * zoomScale}` : undefined}
                // Counter-scale: strokeWidth in user units × zoomScale ≈ constant screen px.
                strokeWidth={(isSelected ? 1.4 : isNeutral ? 0.95 : 1.05) * zoomScale}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          );
        })}

        <rect
          width={OCEAN_VIEW.w}
          height={OCEAN_VIEW.h}
          fill="url(#rf-holo-grid)"
          opacity="0.22"
          pointerEvents="none"
        />

        {(state.strikeFx?.length ?? 0) > 0 && (
          <g className="rf-map__strike-fx" pointerEvents="none">
            {state.strikeFx!.map((fx) => {
              const t = TERRITORIES.find((x) => x.id === fx.territoryId);
              if (!t) return null;
              const x = t.label.x;
              const y = t.label.y;
              // Keep FX roughly constant on screen; floor so mid-zoom Asia
              // still reads as a big impact (not a hairline ring).
              const z = Math.max(0.55, zoomScale * 1.15);
              // Peak-frame base stays visible; SMIL never zeros key layers.
              if (fx.kind === "cruise") {
                const trail = 42 * z;
                return (
                  <g
                    key={fx.id}
                    className="rf-strike-fx rf-strike-fx--cruise"
                  >
                    <path
                      d={`M ${x - trail} ${y - 26 * z} Q ${x - trail * 0.45} ${y - 34 * z} ${x - 3 * z} ${y - 3 * z}`}
                      fill="none"
                      stroke="#f4a060"
                      strokeWidth={Math.max(2.8, 3.6 * z)}
                      strokeLinecap="round"
                      opacity="0.95"
                    />
                    <path
                      d={`M ${x - trail * 0.85} ${y - 22 * z} Q ${x - trail * 0.4} ${y - 28 * z} ${x - 2 * z} ${y - 2 * z}`}
                      fill="none"
                      stroke="#ffe0b8"
                      strokeWidth={Math.max(1.2, 1.6 * z)}
                      strokeLinecap="round"
                      opacity="0.85"
                    />
                    <circle
                      cx={x - 10 * z}
                      cy={y - 12 * z}
                      r={Math.max(2.2, 2.8 * z)}
                      fill="#fff0d0"
                    >
                      <animateMotion
                        path={`M ${-28 * z} ${-14 * z} Q ${-10 * z} ${-20 * z} ${10 * z} ${8 * z}`}
                        dur="0.9s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle
                      cx={x}
                      cy={y}
                      r={16 * z}
                      fill="#c05020"
                      opacity="0.55"
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={11 * z}
                      fill="#e87838"
                      opacity="0.78"
                    >
                      <animate
                        attributeName="r"
                        values={`${9 * z};${14 * z};${17 * z};${10 * z}`}
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.9;0.7;0.55;0.85"
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle
                      cx={x}
                      cy={y}
                      r={5.5 * z}
                      fill="#fff6e8"
                      opacity="0.95"
                    />
                    {[
                      [x - 9 * z, y - 6 * z],
                      [x + 8 * z, y - 10 * z],
                      [x + 3 * z, y + 5 * z],
                      [x - 5 * z, y + 7 * z],
                      [x + 11 * z, y + 2 * z],
                    ].map(([px, py], i) => (
                      <circle
                        key={`sm-${i}`}
                        cx={px}
                        cy={py}
                        r={(3.5 + i * 0.7) * z}
                        fill={i % 2 === 0 ? "#7a6a60" : "#a87848"}
                        opacity={0.55 - i * 0.06}
                      >
                        <animate
                          attributeName="cy"
                          values={`${py};${py - 10 * z}`}
                          dur="1.5s"
                          begin={`${i * 0.1}s`}
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="opacity"
                          values="0.55;0.28;0.55"
                          dur="1.5s"
                          begin={`${i * 0.1}s`}
                          repeatCount="indefinite"
                        />
                      </circle>
                    ))}
                    <circle
                      cx={x}
                      cy={y}
                      r={20 * z}
                      fill="none"
                      stroke="#f0a070"
                      strokeWidth={Math.max(2.2, 2.8 * z)}
                      opacity="0.8"
                    >
                      <animate
                        attributeName="r"
                        values={`${12 * z};${24 * z};${30 * z};${14 * z}`}
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.9;0.55;0.35;0.8"
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle
                      cx={x}
                      cy={y}
                      r={28 * z}
                      fill="none"
                      stroke="#d87840"
                      strokeWidth={Math.max(1.2, 1.6 * z)}
                      opacity="0.45"
                    />
                  </g>
                );
              }
              if (fx.kind === "orbital") {
                const beam = 56 * z;
                return (
                  <g
                    key={fx.id}
                    className="rf-strike-fx rf-strike-fx--orbital"
                  >
                    <line
                      x1={x}
                      y1={y - beam}
                      x2={x}
                      y2={y - 2 * z}
                      stroke="#7ad0f0"
                      strokeWidth={Math.max(4, 5.2 * z)}
                      strokeLinecap="round"
                      opacity="0.55"
                    />
                    <line
                      x1={x}
                      y1={y - beam}
                      x2={x}
                      y2={y - 2 * z}
                      stroke="#d8f8ff"
                      strokeWidth={Math.max(2.4, 3.2 * z)}
                      strokeLinecap="round"
                      opacity="0.95"
                    >
                      <animate
                        attributeName="opacity"
                        values="0.7;1;0.85;0.7"
                        dur="1.4s"
                        repeatCount="indefinite"
                      />
                    </line>
                    <line
                      x1={x}
                      y1={y - beam}
                      x2={x}
                      y2={y - 2 * z}
                      stroke="#ffffff"
                      strokeWidth={Math.max(1, 1.3 * z)}
                      opacity="0.9"
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={12 * z}
                      fill="#e8fbff"
                      opacity="0.9"
                    >
                      <animate
                        attributeName="r"
                        values={`${8 * z};${15 * z};${11 * z};${9 * z}`}
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle
                      cx={x}
                      cy={y}
                      r={8 * z}
                      fill="#ffffff"
                      opacity="0.85"
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={22 * z}
                      fill="none"
                      stroke="#8ed8f0"
                      strokeWidth={Math.max(2.4, 3 * z)}
                      opacity="0.85"
                    >
                      <animate
                        attributeName="r"
                        values={`${12 * z};${26 * z};${34 * z};${14 * z}`}
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.9;0.55;0.35;0.8"
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle
                      cx={x}
                      cy={y}
                      r={30 * z}
                      fill="none"
                      stroke="#c8f0ff"
                      strokeWidth={Math.max(1.4, 1.8 * z)}
                      opacity="0.55"
                    >
                      <animate
                        attributeName="r"
                        values={`${16 * z};${32 * z};${40 * z};${18 * z}`}
                        dur="1.5s"
                        begin="0.12s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <ellipse
                      cx={x}
                      cy={y + 3 * z}
                      rx={16 * z}
                      ry={6 * z}
                      fill="#2a4858"
                      opacity="0.6"
                    />
                  </g>
                );
              }
              // kinetic — tungsten rod + EMP arcs / embers
              const rod = 60 * z;
              return (
                <g
                  key={fx.id}
                  className="rf-strike-fx rf-strike-fx--kinetic"
                >
                  <line
                    x1={x + 10 * z}
                    y1={y - rod}
                    x2={x}
                    y2={y}
                    stroke="#c89840"
                    strokeWidth={Math.max(5, 6.2 * z)}
                    strokeLinecap="round"
                    opacity="0.55"
                  />
                  <line
                    x1={x + 10 * z}
                    y1={y - rod}
                    x2={x}
                    y2={y}
                    stroke="#ffe090"
                    strokeWidth={Math.max(3.2, 4.2 * z)}
                    strokeLinecap="round"
                    opacity="0.95"
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={16 * z}
                    fill="#fff2c0"
                    opacity="0.8"
                  >
                    <animate
                      attributeName="r"
                      values={`${10 * z};${18 * z};${22 * z};${12 * z}`}
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  </circle>
                  <circle
                    cx={x}
                    cy={y}
                    r={7 * z}
                    fill="#ffffff"
                    opacity="0.9"
                  />
                  {[
                    `M ${x} ${y} q ${-18 * z} ${-12 * z} ${-24 * z} ${6 * z}`,
                    `M ${x} ${y} q ${20 * z} ${-10 * z} ${26 * z} ${8 * z}`,
                    `M ${x} ${y} q ${-8 * z} ${18 * z} ${12 * z} ${22 * z}`,
                    `M ${x} ${y} q ${16 * z} ${14 * z} ${-6 * z} ${24 * z}`,
                    `M ${x} ${y} q ${-22 * z} ${8 * z} ${-16 * z} ${20 * z}`,
                  ].map((d, i) => (
                    <path
                      key={`arc-${i}`}
                      d={d}
                      fill="none"
                      stroke="#a8e8ff"
                      strokeWidth={Math.max(1.4, 1.8 * z)}
                      opacity={0.9 - i * 0.08}
                    >
                      <animate
                        attributeName="opacity"
                        values="0.45;1;0.45"
                        dur="0.85s"
                        begin={`${i * 0.07}s`}
                        repeatCount="indefinite"
                      />
                    </path>
                  ))}
                  {[
                    [x - 10 * z, y - 3 * z],
                    [x + 11 * z, y - 7 * z],
                    [x - 3 * z, y + 8 * z],
                    [x + 7 * z, y + 5 * z],
                    [x - 14 * z, y + 4 * z],
                    [x + 4 * z, y - 12 * z],
                  ].map(([ex, ey], i) => (
                    <circle
                      key={`em-${i}`}
                      cx={ex}
                      cy={ey}
                      r={Math.max(1.5, 2 * z)}
                      fill={i % 2 === 0 ? "#f0c060" : "#ffe8a0"}
                      opacity="0.95"
                    >
                      <animate
                        attributeName="cy"
                        values={`${ey};${ey - (12 + i) * z}`}
                        dur="1.1s"
                        begin={`${i * 0.05}s`}
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="1;0.35;1"
                        dur="1.1s"
                        begin={`${i * 0.05}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  ))}
                  <circle
                    cx={x}
                    cy={y}
                    r={24 * z}
                    fill="none"
                    stroke="#f0c860"
                    strokeWidth={Math.max(2.4, 3 * z)}
                    opacity="0.85"
                  >
                    <animate
                      attributeName="r"
                      values={`${12 * z};${28 * z};${36 * z};${14 * z}`}
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.9;0.55;0.35;0.8"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </g>
              );
            })}
          </g>
        )}

        {(unitMinis.length > 0 || transitMinis.length > 0) && (
          <g className="rf-map__units">
            {[...unitMinis, ...transitMinis].map((m) => {
              const col = factionColor((m.owner ?? "neutral") as import("../data/types").FactionId);
              const half = m.size / 2;
              const strokeW = Math.max(0.35, 0.85 * zoomScale);
              if (m.more != null) {
                if (m.more <= 0) return null;
                return (
                  <g
                    key={m.key}
                    className="rf-map__unit-more"
                    transform={`translate(${m.x}, ${m.y})`}
                  >
                    <circle
                      className="rf-map__unit-hit"
                      data-territory-id={m.territoryId}
                      r={half}
                      fill="rgba(8,14,20,0.82)"
                      stroke={col}
                      strokeWidth={strokeW}
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={Math.max(3.5, m.size * 0.45)}
                      fill="#e8eef4"
                      pointerEvents="none"
                    >
                      +{m.more}
                    </text>
                  </g>
                );
              }
              // Circular chrome so troop markers never read as empty building pads.
              const r = half;
              return (
                <g
                  key={m.key}
                  className={`rf-map__unit${m.compact ? " is-compact" : ""}${
                    m.transit ? " is-transit" : ""
                  }`}
                  transform={`translate(${m.x}, ${m.y})`}
                  opacity={m.transit ? 0.92 : 1}
                >
                  <circle
                    className="rf-map__unit-hit"
                    data-territory-id={m.territoryId}
                    r={r + strokeW}
                    fill="transparent"
                  />
                  <circle
                    r={r}
                    fill={
                      m.compact
                        ? "rgba(10,16,24,0.94)"
                        : "rgba(6,10,16,0.8)"
                    }
                    stroke={col}
                    strokeWidth={
                      m.compact
                        ? Math.max(strokeW * 1.3, 1.25 * zoomScale)
                        : Math.max(strokeW, 1.05 * zoomScale)
                    }
                    strokeDasharray={m.transit ? "2 1.5" : undefined}
                    pointerEvents="none"
                  />
                  <circle
                    r={Math.max(0.4, r * (m.compact ? 0.16 : 0.1))}
                    cx={-r * 0.62}
                    cy={-r * 0.62}
                    fill={col}
                    opacity={0.95}
                    pointerEvents="none"
                  />
                  {m.spriteUrl ? (
                    <image
                      href={m.spriteUrl}
                      x={-half * 0.82}
                      y={-half * (m.compact ? 0.72 : 0.78)}
                      width={m.size * 0.82}
                      height={m.size * (m.compact ? 0.78 : 0.88)}
                      preserveAspectRatio="xMidYMid meet"
                      pointerEvents="none"
                    />
                  ) : null}
                  {m.count > 0 && (
                    <g className="rf-map__unit-badge" pointerEvents="none">
                      <circle
                        cx={half * 0.68}
                        cy={half * 0.68}
                        r={
                          m.compact
                            ? Math.max(0.95, m.size * 0.14)
                            : Math.max(0.55, m.size * 0.085)
                        }
                        fill={col}
                        stroke="#f2f7fa"
                        strokeWidth={Math.max(0.15, 0.3 * zoomScale)}
                      />
                      <text
                        x={half * 0.68}
                        y={half * 0.68}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={
                          m.compact
                            ? Math.max(1.9, m.size * 0.15)
                            : Math.max(1.45, m.size * 0.1)
                        }
                        fill="#0a1218"
                        fontWeight="700"
                      >
                        {m.count > 9 ? "9+" : m.count}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {buildingMinis.length > 0 && (
          <g className="rf-map__bldgs">
            {buildingMinis.map((m) => {
              // Belt-and-suspenders: never paint empty compact / +0 leftovers.
              if (m.compact && (m.count == null || m.count <= 0)) return null;
              if (m.more != null && m.more <= 0) return null;
              const owner =
                state.territories[m.territoryId]?.owner ?? "neutral";
              const col = factionColor(owner);
              const half = m.size / 2;
              const strokeW = Math.max(0.35, 0.9 * zoomScale);
              if (m.more != null) {
                return (
                  <g
                    key={m.key}
                    className="rf-map__bldg-more"
                    transform={`translate(${m.x}, ${m.y})`}
                  >
                    <rect
                      className="rf-map__bldg-hit"
                      data-territory-id={m.territoryId}
                      x={-half}
                      y={-half}
                      width={m.size}
                      height={m.size}
                      rx={Math.max(0.4, 1.2 * zoomScale)}
                      fill="rgba(8,14,20,0.82)"
                      stroke={col}
                      strokeWidth={strokeW}
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="rf-map__bldg-more-txt"
                      fontSize={Math.max(4, m.size * 0.48)}
                      fill="#e8eef4"
                      pointerEvents="none"
                    >
                      +{m.more}
                    </text>
                  </g>
                );
              }
              const r = half + strokeW;
              const circ = 2 * Math.PI * r;
              const dash = Math.max(0.01, m.progress) * circ;
              return (
                <g
                  key={m.key}
                  className={`rf-map__bldg${m.constructing ? " is-building" : ""}${
                    m.compact ? " is-compact" : ""
                  }`}
                  transform={`translate(${m.x}, ${m.y})`}
                  opacity={m.constructing ? 0.62 : 1}
                >
                  <rect
                    className="rf-map__bldg-hit"
                    data-territory-id={m.territoryId}
                    x={-half - strokeW}
                    y={-half - strokeW}
                    width={m.size + strokeW * 2}
                    height={m.size + strokeW * 2}
                    fill="transparent"
                  />
                  <rect
                    x={-half}
                    y={-half}
                    width={m.size}
                    height={m.size}
                    rx={Math.max(0.35, 1.1 * zoomScale)}
                    fill={
                      m.compact ? "rgba(10,16,24,0.94)" : "rgba(6,10,16,0.82)"
                    }
                    stroke={col}
                    strokeWidth={
                      m.compact
                        ? Math.max(strokeW * 1.35, 1.4 * zoomScale)
                        : Math.max(strokeW, 1.15 * zoomScale)
                    }
                    pointerEvents="none"
                  />
                  <rect
                    x={-half}
                    y={-half}
                    width={m.size}
                    height={Math.max(0.55, m.size * (m.compact ? 0.2 : 0.12))}
                    rx={Math.max(0.35, 1.1 * zoomScale)}
                    fill={col}
                    opacity={m.compact ? 1 : 0.9}
                    pointerEvents="none"
                  />
                  {m.spriteUrl ? (
                    <image
                      href={m.spriteUrl}
                      x={-half * 0.9}
                      y={-half * (m.compact ? 0.72 : 0.78)}
                      width={m.size * 0.9}
                      height={m.size * (m.compact ? 0.72 : 0.82)}
                      preserveAspectRatio="xMidYMid meet"
                      pointerEvents="none"
                    />
                  ) : null}
                  {m.constructing && (
                    <circle
                      className="rf-map__bldg-ring"
                      r={r}
                      fill="none"
                      stroke={col}
                      strokeWidth={Math.max(0.45, 1.2 * zoomScale)}
                      strokeDasharray={`${dash} ${circ}`}
                      strokeLinecap="round"
                      transform="rotate(-90)"
                      pointerEvents="none"
                      opacity="0.95"
                    />
                  )}
                  {m.compact && m.count != null && m.count > 0 && (
                    <g pointerEvents="none">
                      <circle
                        cx={half * 0.78}
                        cy={-half * 0.78}
                        r={Math.max(2.6, m.size * 0.36)}
                        fill={col}
                        stroke="#f2f7fa"
                        strokeWidth={Math.max(0.35, 0.7 * zoomScale)}
                      />
                      <text
                        x={half * 0.78}
                        y={-half * 0.78}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={Math.max(4, m.size * 0.38)}
                        fill="#0a1218"
                        fontWeight="700"
                      >
                        {m.count > 9 ? "9+" : m.count}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {/* Planned multi-hop route — paint above territory fills/minis */}
        {(state.plannedRoute?.length ?? 0) > 1 && (
          <g className="rf-map__planned-route" pointerEvents="none">
            {state.plannedRoute!.slice(0, -1).map((id, i) => {
              const from = TERRITORIES.find((t) => t.id === id);
              const to = TERRITORIES.find(
                (t) => t.id === state.plannedRoute![i + 1],
              );
              if (!from || !to) return null;
              return (
                <path
                  key={`route-${id}-${to.id}`}
                  d={`M ${from.label.x} ${from.label.y} L ${to.label.x} ${to.label.y}`}
                  fill="none"
                  stroke="#b8f0ff"
                  strokeWidth={Math.max(4, 6.5 * zoomScale)}
                  strokeDasharray="8 4"
                  strokeLinecap="round"
                  opacity="1"
                  className="rf-map__planned-seg"
                />
              );
            })}
            {(() => {
              const path = state.plannedRoute!;
              const mid = path[Math.floor(path.length / 2)]!;
              const midT = TERRITORIES.find((t) => t.id === mid);
              if (!midT) return null;
              let total = 0;
              for (let i = 0; i < path.length - 1; i++) {
                total += travelTurns(path[i]!, path[i + 1]!, [
                  { unitId: "trooper", count: 1 },
                ]);
              }
              const hops = path.length - 1;
              return (
                <g transform={`translate(${midT.label.x}, ${midT.label.y - 12})`}>
                  <rect
                    x={-38}
                    y={-12}
                    width={76}
                    height={18}
                    rx={2}
                    fill="rgba(8,16,24,0.94)"
                    stroke="#9fdfff"
                    strokeWidth={0.9}
                  />
                  <text
                    textAnchor="middle"
                    y={2}
                    className="rf-map__route-eta"
                    fill="#e8f7ff"
                    fontSize={8}
                    fontWeight={700}
                  >
                    {hops} hop{hops === 1 ? "" : "s"} · {total}t
                  </text>
                </g>
              );
            })()}
          </g>
        )}

        {/* Labels last so chips/buildings/routes never cover territory names. */}
        <g className="rf-map__labels" pointerEvents="none">
          {labels.map((lbl) => (
            <text
              key={`label-${lbl.id}`}
              x={lbl.x}
              y={lbl.y}
              className="rf-map__label"
              fontSize={lbl.size}
              textAnchor="middle"
              dominantBaseline="middle"
              filter="url(#rf-label-halo)"
            >
              {lbl.text}
            </text>
          ))}
        </g>
      </svg>

      <div className="rf-map__hint rf-text-dim">
        Scroll or pinch to zoom · drag to pan · tap to select · Open Base /
        Invade are explicit actions
      </div>

      <button
        type="button"
        className="ghost rf-map__sheet-toggle rf-map__continents-btn"
        data-tutorial="map-continents"
        aria-expanded={legendOpen}
        onClick={() => setLegendOpen(true)}
      >
        Continents
      </button>

      <Drawer
        open={legendOpen}
        onClose={() => setLegendOpen(false)}
        side="left"
        className="rf-map__legend-drawer"
        tutorialId="map-continents-panel"
      >
        <span className="rf-label">Continent bonuses</span>
        <ul className="rf-map__legend-list" title={HELP.continents}>
          {CONTINENT_LIST.map((c) => (
            <li key={c.id}>
              <i style={{ background: c.color }} />
              <span>
                {c.name}
                <small>
                  +E{c.energy} A{c.alloy} Pop{c.population}
                </small>
              </span>
            </li>
          ))}
        </ul>
      </Drawer>

      {/* Desktop hover chip (hidden on short landscape via CSS) */}
      {hovered && !selected && (
        <aside className="rf-map__hover-chip">
          <strong>{hovered.name}</strong>
          <span className="rf-text-dim">{hovered.continent}</span>
        </aside>
      )}

      <Drawer
        open={Boolean(selected) && (shortLandscape ? detailOpen : true)}
        onClose={() => {
          setDetailOpen(false);
          if (!shortLandscape) {
            dispatch({
              type: "SELECT_TERRITORY",
              payload: { territoryId: null },
            });
          }
        }}
        side="right"
        inline={!shortLandscape}
        className="rf-map__territory-drawer"
        tutorialId="territory-sheet"
      >
        {selected && (
          <>
            {!(invadeOpen && selectedIsEnemy) && (
              <>
                <span className="rf-label">Selected</span>
                <h3 className="rf-map__sheet-title">{selected.name}</h3>
                {/* Ops row sits under the title so Invade/Strike/Recon stay above the fold at 844×390. */}
                {selectedIsEnemy && humanId && (
                  <div className="rf-map__ops" data-tutorial="enemy-ops">
                    <div className="rf-map__ops-row">
                      <button
                        type="button"
                        className="primary"
                        data-tutorial="invade-btn"
                        onClick={() => {
                          setOpsMode(null);
                          setInvadeOpen(true);
                        }}
                      >
                        Invade
                      </button>
                      <button
                        type="button"
                        className={opsMode === "strike" ? "primary" : "ghost"}
                        onClick={() =>
                          setOpsMode((m) => (m === "strike" ? null : "strike"))
                        }
                      >
                        Strike
                      </button>
                      <button
                        type="button"
                        className={opsMode === "recon" ? "primary" : "ghost"}
                        onClick={() =>
                          setOpsMode((m) => (m === "recon" ? null : "recon"))
                        }
                      >
                        Recon
                      </button>
                    </div>
                  </div>
                )}
                <p className="rf-text-dim rf-map__sheet-meta">
                  {selected.continent} · {biomeLabel(selected.id)}
                  {selectedTs
                    ? ` · ${selectedTs.control} · Pop ${selectedTs.population}`
                    : ""}
                </p>
                {selectedTs && (
                  <p
                    className={`rf-map__sheet-owner${selectedTs.owner === "neutral" ? " is-neutral" : ""}`}
                    data-testid="territory-owner-label"
                  >
                    {selectedTs.owner === "neutral"
                      ? "Neutral"
                      : factionName(selectedTs.owner)}
                    {selectedTs.owner === "neutral" && (
                      <span className="rf-text-dim"> · static garrison</span>
                    )}
                    {state.players[selectedTs.owner]?.doctrineId && (
                      <>
                        {" "}
                        ·{" "}
                        <span
                          style={{
                            color: getDoctrine(
                              state.players[selectedTs.owner]!.doctrineId,
                            ).accent,
                          }}
                        >
                          {
                            getDoctrine(
                              state.players[selectedTs.owner]!.doctrineId,
                            ).name
                          }
                        </span>
                      </>
                    )}
                  </p>
                )}
                {selectedTs && humanId && (
                  <p className="rf-map__sheet-garrison" title={HELP.recon}>
                    <span className="rf-label">Garrison</span>{" "}
                    {isTerritoryRevealed(state, humanId, selected.id)
                      ? formatGarrisonIntel(state, humanId, selected.id)
                      : approximateGarrison(selectedTs.garrison)
                          .map((g) => formatUnitRange(g.unitId, g.lo, g.hi))
                          .join(", ") || "Empty"}
                    {!isTerritoryRevealed(state, humanId, selected.id) &&
                      selectedTs.owner !== humanId && (
                        <em className="rf-text-dim"> · approx</em>
                      )}
                  </p>
                )}
                {selectedTs &&
                  humanId &&
                  selectedTs.owner === humanId &&
                  commandersOnTerritory(
                    state.players[humanId]!,
                    selected.id,
                  ).length > 0 && (
                    <p className="rf-map__sheet-cmd">
                      Officers:{" "}
                      {commandersOnTerritory(
                        state.players[humanId]!,
                        selected.id,
                      )
                        .map((c) => `${c.name} (${c.role})`)
                        .join(", ")}
                    </p>
                  )}
                {selectedTs?.control === "occupied" && humanId && selectedTs.owner === humanId && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      dispatch({
                        type: "STABILIZE_TERRITORY",
                        payload: { territoryId: selected.id },
                      })
                    }
                  >
                    Stabilize (35E / 10A)
                  </button>
                )}
              </>
            )}

            {invadeOpen && selectedIsEnemy && humanId ? (
              <InvadeFromPanel
                state={state}
                activePlayer={state.players[humanId]!}
                targetId={selected.id}
                canAct={
                  state.phase === "play" &&
                  state.players[state.playerOrder[state.activePlayerIndex]!]
                    ?.kind === "human"
                }
                dispatch={dispatch}
                onCancel={() => {
                  setInvadeOpen(false);
                  setInvadePlans([]);
                }}
                onPlansChange={onInvadePlans}
              />
            ) : (
              <>
                {!selectedIsEnemy && (
                  <div className="rf-map__sheet-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() =>
                        dispatch({
                          type: "SET_SCREEN",
                          payload: { screen: "base" },
                        })
                      }
                    >
                      Open Base
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: "SET_SCREEN",
                          payload: { screen: "invade" },
                        })
                      }
                    >
                      Army
                    </button>
                  </div>
                )}

                {selectedIsEnemy && humanId && opsMode === "strike" && (
                  <div className="rf-map__strike-panel">
                    <span className="rf-label">Strike targeting</span>
                    {(
                      ["cruise", "orbital", "kinetic"] as StrikeKind[]
                    ).map((kind) => {
                      const def = STRIKE_DEFS[kind];
                      const cd = strikeCooldownLeft(state, humanId, kind);
                      const has = playerHasStrikeAsset(state, humanId, kind);
                      const selectedStrike = strikePick === kind;
                      return (
                        <button
                          key={kind}
                          type="button"
                          className={selectedStrike ? "primary" : "ghost"}
                          disabled={!has || cd > 0}
                          onClick={() => setStrikePick(kind)}
                        >
                          <strong>{def.label}</strong>
                          <small>
                            {def.cost.energy}E · {def.cost.alloy}A ·{" "}
                            {def.cost.supply}S
                            {cd > 0
                              ? ` · CD ${cd}t`
                              : ` · CD ${def.cooldown}t`}
                            {!has ? " · no asset" : ""}
                          </small>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="primary"
                      disabled={
                        !playerHasStrikeAsset(state, humanId, strikePick) ||
                        strikeCooldownLeft(state, humanId, strikePick) > 0
                      }
                      onClick={() =>
                        dispatch({
                          type: "LAUNCH_STRIKE",
                          payload: {
                            kind: strikePick,
                            targetId: selected.id,
                          },
                        })
                      }
                    >
                      Confirm {STRIKE_DEFS[strikePick].label}
                    </button>
                  </div>
                )}

                {selectedIsEnemy && humanId && opsMode === "recon" && (
                  <div className="rf-map__strike-panel">
                    <span className="rf-label">Recon</span>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        dispatch({
                          type: "LAUNCH_RECON",
                          payload: {
                            targetId: selected.id,
                            mode: "drone",
                          },
                        })
                      }
                    >
                      Stealth drone · 40E
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        dispatch({
                          type: "LAUNCH_RECON",
                          payload: {
                            targetId: selected.id,
                            mode: "satellite",
                          },
                        })
                      }
                    >
                      Satellite relay · 55E
                    </button>
                  </div>
                )}

                {selectedIsEnemy &&
                  humanId &&
                  isTerritoryRevealed(state, humanId, selected.id) && (
                    <div className="rf-map__incoming">
                      <span className="rf-label">Incoming marches</span>
                      <ul>
                        {(state.armiesInTransit ?? [])
                          .filter(
                            (a) =>
                              a.toId === selected.id ||
                              a.fromId === selected.id,
                          )
                          .map((a) => (
                            <li key={a.id}>
                              {factionDisplayName(a.owner)} →{" "}
                              {territoryDisplayName(a.toId)} · ETA{" "}
                              {a.turnsRemaining}t ·{" "}
                              {a.force
                                .map(
                                  (s) =>
                                    `${unitDisplayName(s.unitId)}×${s.count}`,
                                )
                                .join(", ") || "empty"}
                            </li>
                          ))}
                        {(state.armiesInTransit ?? []).filter(
                          (a) =>
                            a.toId === selected.id ||
                            a.fromId === selected.id,
                        ).length === 0 && (
                          <li className="rf-text-dim">None detected</li>
                        )}
                      </ul>
                    </div>
                  )}

                {!selectedIsEnemy && (
                  <>
                    <span className="rf-label">Your territories</span>
                    <ul className="rf-picker__list rf-map__owned-list">
                      {ownedTerritories.map((t) => {
                        const ts = state.territories[t.id]!;
                        const g = Object.values(ts.garrison).reduce(
                          (a, b) => a + b,
                          0,
                        );
                        return (
                          <li key={t.id}>
                            <button
                              type="button"
                              className={
                                t.id === selected.id ? "primary" : "ghost"
                              }
                              onClick={() =>
                                dispatch({
                                  type: "SELECT_TERRITORY",
                                  payload: { territoryId: t.id },
                                })
                              }
                            >
                              <strong>{t.name}</strong>
                              <small>
                                {t.continent} · Gar {g}
                              </small>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}

                {marchTargets.length > 0 && (
                  <div className="rf-map__march">
                    <span className="rf-label">March to (friendly)</span>
                    <ul className="rf-picker__list">
                      {marchTargets.map((nid) => {
                        const nName =
                          TERRITORIES.find((t) => t.id === nid)?.name ?? nid;
                        const g = selectedTs?.garrison ?? {};
                        const force = Object.entries(g)
                          .filter(([, c]) => c > 0)
                          .map(([unitId, count]) => ({
                            unitId,
                            count: Math.max(1, Math.floor(count / 2)),
                          }));
                        return (
                          <li key={nid}>
                            <button
                              type="button"
                              className="ghost"
                              disabled={!force.length}
                              onClick={() =>
                                dispatch({
                                  type: "ORDER_MOVE",
                                  payload: {
                                    fromId: selected.id,
                                    toId: nid,
                                    force,
                                  },
                                })
                              }
                            >
                              <strong>→ {nName}</strong>
                              <small>Half garrison marches</small>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Drawer>

      {/* Desktop collapsible legend (short landscape uses Drawer + Continents btn) */}
      <aside
        className={`rf-map__legend rf-map__legend--desktop${legendOpen ? " is-open" : " is-collapsed"}`}
        title={HELP.continents}
        data-testid="continent-legend"
      >
        <button
          type="button"
          className="rf-map__legend-toggle"
          aria-expanded={legendOpen}
          data-testid="continent-legend-toggle"
          onClick={() => setLegendOpen((v) => !v)}
        >
          <span className="rf-label">Continent bonuses</span>
          <span className="rf-map__legend-chevron" aria-hidden>
            {legendOpen ? "▾" : "▸"}
          </span>
        </button>
        {legendOpen && (
          <ul>
            {CONTINENT_LIST.map((c) => (
              <li key={c.id}>
                <i style={{ background: c.color }} />
                <span>
                  {c.name}
                  <small>
                    +E{c.energy} A{c.alloy} Pop{c.population}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
