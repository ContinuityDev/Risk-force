import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export function WorldMap({ state, dispatch, focusViewBox }: WorldMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: Camera;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const initialCam = useMemo(() => {
    if (focusViewBox) return parseViewBox(focusViewBox);
    return { x: 0, y: 0, w: WORLD_W, h: WORLD_H };
  }, [focusViewBox]);

  const [camera, setCamera] = useState<Camera>(initialCam);
  useEffect(() => {
    setCamera(initialCam);
  }, [initialCam]);

  const zoomScale = camera.w / WORLD_W;
  const viewBox = camToViewBox(camera);

  const labels = useMemo(
    () => layoutLabels(TERRITORIES, zoomScale, camera),
    [zoomScale, camera],
  );
  const labelById = useMemo(
    () => Object.fromEntries(labels.map((l) => [l.id, l])),
    [labels],
  );

  const clientToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const el = svgRef.current;
      if (!el) return { x: camera.x + camera.w / 2, y: camera.y + camera.h / 2 };
      const rect = el.getBoundingClientRect();
      const px = (clientX - rect.left) / Math.max(1, rect.width);
      const py = (clientY - rect.top) / Math.max(1, rect.height);
      return {
        x: camera.x + px * camera.w,
        y: camera.y + py * camera.h,
      };
    },
    [camera],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
      const pivot = clientToWorld(e.clientX, e.clientY);
      setCamera((prev) => {
        const nw = Math.min(WORLD_W, Math.max(MIN_VIEW_W, prev.w * factor));
        const nh = nw * (WORLD_H / WORLD_W);
        const nx = pivot.x - ((pivot.x - prev.x) / prev.w) * nw;
        const ny = pivot.y - ((pivot.y - prev.y) / prev.h) * nh;
        return clampCamera({ x: nx, y: ny, w: nw, h: nh });
      });
    },
    [clientToWorld],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Middle button or left-drag on ocean / empty — pan only.
      // Territory clicks still select via path onClick (no drag if click).
      if (e.button !== 0 && e.button !== 1) return;
      const target = e.target as Element;
      // Don't start pan on territory paths — those are clicks for selection
      if (target.closest?.(".rf-map__territory")) return;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origin: camera,
      };
      setDragging(true);
    },
    [camera],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const el = svgRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = ((e.clientX - d.startX) / rect.width) * d.origin.w;
      const dy = ((e.clientY - d.startY) / rect.height) * d.origin.h;
      setCamera(
        clampCamera({
          ...d.origin,
          x: d.origin.x - dx,
          y: d.origin.y - dy,
        }),
      );
    },
    [],
  );

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
  }, []);

  const selected = state.selectedTerritoryId
    ? TERRITORIES.find((t) => t.id === state.selectedTerritoryId)
    : null;
  const selectedTs = state.selectedTerritoryId
    ? state.territories[state.selectedTerritoryId]
    : null;
  const hovered = hoveredId
    ? TERRITORIES.find((t) => t.id === hoveredId)
    : null;

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
        aria-label="Earth theater strategic map — scroll to zoom, drag to pan"
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
          fill="#152838"
          fillOpacity="0.95"
          stroke="#4a7a8c"
          strokeWidth="0.7"
          filter="url(#rf-land-glow)"
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
                fill={hexToRgba(base, isSelected ? 0.72 : 0.55)}
                stroke={isSelected ? "#e8f4f8" : "#9fd4e4"}
                strokeWidth={isSelected ? 1.6 : 0.55}
                strokeLinejoin="round"
                strokeLinecap="round"
                filter={isSelected ? "url(#rf-select-glow)" : undefined}
                onClick={(ev) => {
                  ev.stopPropagation();
                  // Selection only — never opens base / battle (those are explicit actions).
                  dispatch({
                    type: "SELECT_TERRITORY",
                    payload: { territoryId: t.id },
                  });
                }}
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
      </svg>

      <div className="rf-map__hint rf-text-dim">
        Scroll to zoom · drag empty ocean to pan · click territory to select ·
        Open Base / Invade are explicit actions
      </div>

      <aside className="rf-map__legend" title={HELP.continents}>
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

      {(selected || hovered) && (
        <aside className="rf-map__detail">
          <span className="rf-label">{selected ? "Selected" : "Hover"}</span>
          <strong>{(selected ?? hovered)!.name}</strong>
          <span className="rf-text-dim">{(selected ?? hovered)!.continent}</span>
          {selected && selectedTs && (
            <span className="rf-text-dim">
              Pop {selectedTs.population} · Garrison{" "}
              {Object.values(selectedTs.garrison).reduce((a, b) => a + b, 0)}
            </span>
          )}
          {selected && (
            <>
              <button
                type="button"
                className="primary"
                onClick={() =>
                  dispatch({ type: "SET_SCREEN", payload: { screen: "base" } })
                }
              >
                Open Base
              </button>
              {marchTargets.length > 0 && (
                <div className="rf-map__march">
                  <span className="rf-label">March to</span>
                  {marchTargets.slice(0, 4).map((nid) => {
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
                      <button
                        key={nid}
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
                        → {nName}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </aside>
      )}
    </div>
  );
}
