import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CONTINENT_LIST } from "../data/continents";
import { factionColor } from "../data/factions";
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
import type { GameState } from "../engine/state";
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

const WORLD_W = OCEAN_VIEW.w;
const WORLD_H = OCEAN_VIEW.h;
const MIN_VIEW_W = 80;
/** At world framing (scale≈1) no labels. As scale drops (zoom in), larger territories unlock first. */
const LABEL_AREA_THRESHOLDS = [
  { maxScale: 0.72, minArea: 0.012 },
  { maxScale: 0.48, minArea: 0.004 },
  { maxScale: 0.32, minArea: 0.0012 },
  { maxScale: 0.2, minArea: 0.00035 },
  { maxScale: 0.12, minArea: 0 },
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
    w: w || WORLD_W,
    h: h || WORLD_H,
  };
}

function clampCamera(cam: Camera): Camera {
  let { x, y, w, h } = cam;
  w = Math.min(WORLD_W, Math.max(MIN_VIEW_W, w));
  h = w * (WORLD_H / WORLD_W);
  x = Math.min(WORLD_W - w, Math.max(0, x));
  y = Math.min(WORLD_H - h, Math.max(0, y));
  return { x, y, w, h };
}

function camToViewBox(cam: Camera): string {
  const c = clampCamera(cam);
  return `${c.x} ${c.y} ${c.w} ${c.h}`;
}

/**
 * Progressive labels: invisible at world zoom; as you zoom in, larger
 * territories unlock first. Collision → shrink / abbreviate; never hide
 * an unlocked label that fits. Hover/selection names live in the panel.
 */
function layoutLabels(
  territories: TerritoryDef[],
  zoomScale: number,
  cam: Camera,
): PlacedLabel[] {
  if (zoomScale >= 0.95) return [];

  let minArea = Infinity;
  for (const t of LABEL_AREA_THRESHOLDS) {
    if (zoomScale <= t.maxScale) minArea = t.minArea;
  }
  if (!Number.isFinite(minArea)) return [];

  const visible = territories.filter((t) => {
    if (t.area < minArea) return false;
    // Only label if anchor is roughly in the current camera
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
    // Prefer short names that don't wrap / split mid-word
    const preferScreen = Math.min(
      13,
      Math.max(9, 9 + Math.sqrt(t.area) * 10),
    );
    const candidates: Array<{ text: string; screenPx: number }> = [
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
      if (!placed.some((p) => overlaps(cand, p))) {
        chosen = cand;
        break;
      }
    }
    // If nothing fits without collision, skip (zoom further will free space)
    if (chosen) placed.push(chosen);
  }
  return placed;
}

const PAN_SELECT_SLOP_PX = 10;

export function WorldMap({ state, dispatch, focusViewBox }: WorldMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  /** Continent bonuses drawer — collapsed by default on short landscape. */
  const [legendOpen, setLegendOpen] = useState(false);
  /** Selected-territory right sheet (always used on short landscape). */
  const [detailOpen, setDetailOpen] = useState(false);
  const [shortLandscape, setShortLandscape] = useState(false);
  const [invadeOpen, setInvadeOpen] = useState(false);
  const [invadePlans, setInvadePlans] = useState<InvadeOriginPlan[]>([]);
  const onInvadePlans = useCallback((plans: InvadeOriginPlan[]) => {
    setInvadePlans(plans);
  }, []);
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
    origin: { x: 0, y: 0, w: WORLD_W, h: WORLD_H },
    startDist: 0,
    startMid: { x: 0, y: 0 },
    moved: false,
    pendingTerritoryId: null,
  });
  const cameraRef = useRef<Camera>({ x: 0, y: 0, w: WORLD_W, h: WORLD_H });
  const rafRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const initialCam = useMemo(() => {
    if (focusViewBox) return parseViewBox(focusViewBox);
    return { x: 0, y: 0, w: WORLD_W, h: WORLD_H };
  }, [focusViewBox]);

  const [camera, setCamera] = useState<Camera>(initialCam);
  useEffect(() => {
    setCamera(initialCam);
    cameraRef.current = initialCam;
  }, [initialCam]);

  useEffect(() => {
    const id = state.selectedTerritoryId;
    if (!id) return;
    setDetailOpen(true);
    const t = TERRITORIES.find((x) => x.id === id);
    if (!t) return;
    // Frame selection in the left ~58% so the right drawer does not cover it.
    const focusW = Math.min(WORLD_W, Math.max(MIN_VIEW_W * 1.6, WORLD_W * 0.32));
    const focusH = focusW * (WORLD_H / WORLD_W);
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

  const zoomScale = camera.w / WORLD_W;
  const viewBox = camToViewBox(camera);

  // Defer label layout during continuous gestures for mid-range phones.
  const deferredCam = useDeferredValue(camera);
  const labels = useMemo(
    () =>
      layoutLabels(
        TERRITORIES,
        deferredCam.w / WORLD_W,
        deferredCam,
      ),
    [deferredCam],
  );
  const labelById = useMemo(
    () => Object.fromEntries(labels.map((l) => [l.id, l])),
    [labels],
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
        deferredCam.w / WORLD_W,
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
      deferredCam.w / WORLD_W,
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
        deferredCam.w / WORLD_W,
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
      const nw = Math.min(WORLD_W, Math.max(MIN_VIEW_W, prev.w * factor));
      const nh = nw * (WORLD_H / WORLD_W);
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
          WORLD_W,
          Math.max(MIN_VIEW_W, g.origin.w * factor),
        );
        const nh = nw * (WORLD_H / WORLD_W);
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

        <rect width={WORLD_W} height={WORLD_H} fill="url(#rf-ocean)" />
        <rect
          width={WORLD_W}
          height={WORLD_H}
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
          const base = factionColor(owner);
          const isSelected = state.selectedTerritoryId === t.id;
          const lbl = labelById[t.id];
          return (
            <g
              key={t.id}
              className="rf-map__territory-group"
              onMouseEnter={() => setHoveredId(t.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <path
                d={t.path}
                className={`rf-map__territory${isSelected ? " is-selected" : ""}`}
                data-territory-id={t.id}
                fill={hexToRgba(base, isSelected ? 0.9 : 0.82)}
                stroke={isSelected ? "#e8f4f8" : "#7eb6c9"}
                // Counter-scale: strokeWidth in user units × zoomScale ≈ constant screen px.
                strokeWidth={(isSelected ? 1.4 : 1.05) * zoomScale}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {lbl && (
                <text
                  x={lbl.x}
                  y={lbl.y}
                  className="rf-map__label"
                  fontSize={lbl.size}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  pointerEvents="none"
                  filter="url(#rf-label-halo)"
                >
                  {lbl.text}
                </text>
              )}
            </g>
          );
        })}

        <rect
          width={WORLD_W}
          height={WORLD_H}
          fill="url(#rf-holo-grid)"
          opacity="0.22"
          pointerEvents="none"
        />

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
                <p className="rf-text-dim">
                  {selected.continent}
                  {selectedTs
                    ? ` · Pop ${selectedTs.population} · Garrison ${Object.values(selectedTs.garrison).reduce((a, b) => a + b, 0)}`
                    : ""}
                </p>
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
                <div className="rf-map__sheet-actions">
                  {!selectedIsEnemy && (
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
                  )}
                  {selectedIsEnemy ? (
                    <button
                      type="button"
                      className="primary"
                      data-tutorial="invade-btn"
                      onClick={() => setInvadeOpen(true)}
                    >
                      Invade
                    </button>
                  ) : (
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
                  )}
                </div>

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

                {selectedIsEnemy && (
                  <p className="rf-hint">
                    Enemy territory — tap Invade to plan a multi-front strike
                    using the march system.
                  </p>
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

      {/* Desktop-only static legend (short landscape uses Drawer) */}
      <aside className="rf-map__legend rf-map__legend--desktop" title={HELP.continents}>
        <span className="rf-label">Continent bonuses</span>
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
      </aside>
    </div>
  );
}
