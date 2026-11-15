import { useEffect, useMemo, useRef, useState } from "react";
import { factionColor } from "../data/factions";
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
  /** Display text (full name or abbrev). */
  text: string;
  x: number;
  y: number;
  /** Font size in SVG user units (already zoom-compensated). */
  size: number;
  w: number;
  h: number;
}

/** Preferred on-screen label height in px at full-world framing. */
const BASE_SCREEN_PX = 12;
const MIN_SCREEN_PX = 8;

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
  pad = 2.5,
): boolean {
  return !(
    a.x + a.w / 2 + pad < b.x - b.w / 2 ||
    a.x - a.w / 2 - pad > b.x + b.w / 2 ||
    a.y + a.h / 2 + pad < b.y - b.h / 2 ||
    a.y - a.h / 2 - pad > b.y + b.h / 2
  );
}

function parseViewBox(vb: string): { x: number; y: number; w: number; h: number } {
  const [x, y, w, h] = vb.trim().split(/[\s,]+/).map(Number);
  return {
    x: x || 0,
    y: y || 0,
    w: w || OCEAN_VIEW.w,
    h: h || OCEAN_VIEW.h,
  };
}

/**
 * Place every territory label at its polylabel. Never hide —
 * resolve collisions by shrinking then abbreviating. Sizes are in
 * SVG user units already compensated so on-screen px stays ~constant
 * under zoom (`userSize = screenPx * viewBoxW / worldW`).
 */
function layoutLabels(
  territories: TerritoryDef[],
  zoomScale: number,
): PlacedLabel[] {
  // zoomScale = viewBoxW / worldW  (≤ 1 when zoomed in)
  const ranked = [...territories].sort((a, b) => b.area - a.area);
  const placed: PlacedLabel[] = [];

  for (const t of ranked) {
    const full = t.name;
    const short = territoryAbbrev(t.id, t.name);
    // Prefer slightly larger text for bigger territories at full zoom
    const preferScreen = Math.min(
      14,
      Math.max(BASE_SCREEN_PX, 10 + Math.sqrt(t.area) * 8),
    );
    const candidates: Array<{ text: string; screenPx: number }> = [
      { text: full, screenPx: preferScreen },
      { text: full, screenPx: BASE_SCREEN_PX },
      { text: full, screenPx: 10 },
      { text: full, screenPx: MIN_SCREEN_PX },
      { text: short, screenPx: BASE_SCREEN_PX },
      { text: short, screenPx: 10 },
      { text: short, screenPx: MIN_SCREEN_PX },
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
    // Last resort: always show abbreviated at min size (may slightly overlap)
    if (!chosen) {
      const size = MIN_SCREEN_PX * zoomScale;
      chosen = {
        id: t.id,
        text: short,
        x: t.label.x,
        y: t.label.y,
        size,
        w: approxTextWidth(short, size),
        h: size + 2 * zoomScale,
      };
    }
    placed.push(chosen);
  }
  return placed;
}

export function WorldMap({ state, dispatch, focusViewBox }: WorldMapProps) {
  const { w, h } = OCEAN_VIEW;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const propViewBox = useMemo(() => {
    if (focusViewBox) return focusViewBox;
    return `0 0 ${w} ${h}`;
  }, [focusViewBox, w, h]);

  // Track live viewBox so zoom (incl. screenshot DOM tweaks) counter-scales labels
  const [liveViewBox, setLiveViewBox] = useState(propViewBox);
  useEffect(() => {
    setLiveViewBox(propViewBox);
  }, [propViewBox]);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const sync = () => {
      const v = el.getAttribute("viewBox");
      if (v) setLiveViewBox(v);
    };
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["viewBox"] });
    return () => obs.disconnect();
  }, []);

  const vb = useMemo(() => parseViewBox(liveViewBox), [liveViewBox]);
  const zoomScale = vb.w / w;

  const labels = useMemo(
    () => layoutLabels(TERRITORIES, zoomScale),
    [zoomScale],
  );
  const labelById = useMemo(
    () => Object.fromEntries(labels.map((l) => [l.id, l])),
    [labels],
  );

  return (
    <div className="rf-map rf-fade-in">
      <svg
        ref={svgRef}
        className="rf-map__svg"
        viewBox={propViewBox}
        role="img"
        aria-label="Earth theater holographic map"
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
          <filter id="rf-select-glow">
            <feGaussianBlur stdDeviation="1.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Soft contrast halo — no stroke-outline ghosting */}
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
        </defs>

        <rect width={w} height={h} fill="url(#rf-ocean)" />
        <rect width={w} height={h} fill="url(#rf-holo-sheen)" pointerEvents="none" />

        {[83.3, 166.7, 250, 333.3, 416.7, 500].map((y) => (
          <line
            key={`lat-${y}`}
            x1="0"
            y1={y}
            x2={w}
            y2={y}
            stroke="#7eb6c9"
            strokeWidth="0.3"
            opacity="0.07"
          />
        ))}
        {[83.3, 166.7, 250, 333.3, 416.7, 500, 583.3, 666.7, 750, 833.3, 916.7].map(
          (x) => (
            <line
              key={`lon-${x}`}
              x1={x}
              y1="0"
              x2={x}
              y2={h}
              stroke="#7eb6c9"
              strokeWidth="0.3"
              opacity="0.06"
            />
          ),
        )}

        <path
          d={LAND_PATH}
          fill="#152838"
          fillOpacity="0.95"
          stroke="#4a7a8c"
          strokeWidth="0.7"
          filter="url(#rf-land-glow)"
          pointerEvents="none"
        />
        <path
          d={LAND_PATH}
          fill="none"
          stroke="#7eb6c9"
          strokeWidth="0.35"
          opacity="0.4"
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

        {/* AI multi-front attack plan arrows */}
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

        {TERRITORIES.map((t) => {
          const ts = state.territories[t.id];
          const owner = ts?.owner ?? t.startingOwner;
          const base = factionColor(owner);
          const selected = state.selectedTerritoryId === t.id;
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
                className={`rf-map__territory${selected ? " is-selected" : ""}`}
                fill={hexToRgba(base, selected ? 0.72 : 0.55)}
                stroke={selected ? "#e8f4f8" : "#9fd4e4"}
                strokeWidth={selected ? 1.6 : 0.55}
                strokeLinejoin="round"
                strokeLinecap="round"
                filter={selected ? "url(#rf-select-glow)" : undefined}
                onClick={() =>
                  dispatch({
                    type: "SELECT_TERRITORY",
                    payload: { territoryId: t.id },
                  })
                }
              />
              {lbl && (
                <text
                  x={lbl.x}
                  y={lbl.y}
                  className={`rf-map__label${
                    hoveredId === t.id || selected ? " is-hot" : ""
                  }`}
                  fontSize={lbl.size}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  pointerEvents="none"
                  filter="url(#rf-label-halo)"
                >
                  {hoveredId === t.id || selected ? t.name : lbl.text}
                </text>
              )}
            </g>
          );
        })}

        <rect
          width={w}
          height={h}
          fill="url(#rf-holo-grid)"
          opacity="0.22"
          pointerEvents="none"
        />

        <rect
          x="3"
          y="3"
          width={w - 6}
          height={h - 6}
          fill="none"
          stroke="#2c3a4d"
          strokeWidth="1"
          opacity="0.65"
          pointerEvents="none"
        />
        <text x="14" y="18" className="rf-map__chrome-label">
          EARTH THEATER · NATURAL EARTH / EQUIRECTANGULAR
        </text>
      </svg>

      {state.selectedTerritoryId && (
        <aside className="rf-map__detail">
          <span className="rf-label">Selected</span>
          <strong>
            {TERRITORIES.find((t) => t.id === state.selectedTerritoryId)?.name}
          </strong>
          <span className="rf-text-dim">
            {
              TERRITORIES.find((t) => t.id === state.selectedTerritoryId)
                ?.continent
            }
          </span>
          <button
            type="button"
            className="primary"
            onClick={() =>
              dispatch({ type: "SET_SCREEN", payload: { screen: "base" } })
            }
          >
            Open Base
          </button>
        </aside>
      )}
    </div>
  );
}
