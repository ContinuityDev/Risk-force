import { useMemo, useState } from "react";
import { factionColor } from "../data/factions";
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
  name: string;
  x: number;
  y: number;
  size: number;
  hidden: boolean;
  w: number;
  h: number;
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function approxTextWidth(name: string, size: number): number {
  // Slightly generous — accounts for bold weight + label halo
  return name.length * size * 0.58 + 6;
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  pad = 5,
): boolean {
  return !(
    a.x + a.w / 2 + pad < b.x - b.w / 2 ||
    a.x - a.w / 2 - pad > b.x + b.w / 2 ||
    a.y + a.h / 2 + pad < b.y - b.h / 2 ||
    a.y - a.h / 2 - pad > b.y + b.h / 2
  );
}

/** Place labels largest-first; nudge then hide on unresolved collisions. */
function layoutLabels(territories: TerritoryDef[]): PlacedLabel[] {
  const ranked = [...territories].sort((a, b) => b.area - a.area);
  const placed: PlacedLabel[] = [];
  const nudges = [
    [0, 0],
    [0, -10],
    [0, 10],
    [-12, 0],
    [12, 0],
    [-10, -8],
    [10, -8],
    [-10, 8],
    [10, 8],
    [0, -18],
    [0, 18],
    [-18, 0],
    [18, 0],
    [-14, -14],
    [14, -14],
    [-14, 14],
    [14, 14],
    [0, -26],
    [0, 26],
    [-8, -20],
    [8, -20],
    [-8, 20],
    [8, 20],
  ];

  for (const t of ranked) {
    const size = t.labelSize ?? 12;
    const w = approxTextWidth(t.name, size);
    const h = size + 4;
    let chosen: PlacedLabel | null = null;
    for (const [dx, dy] of nudges) {
      const cand = {
        id: t.id,
        name: t.name,
        x: t.label.x + dx,
        y: t.label.y + dy,
        size,
        hidden: false,
        w,
        h,
      };
      if (!placed.some((p) => !p.hidden && overlaps(cand, p))) {
        chosen = cand;
        break;
      }
    }
    placed.push(
      chosen ?? {
        id: t.id,
        name: t.name,
        x: t.label.x,
        y: t.label.y,
        size,
        hidden: true,
        w,
        h,
      },
    );
  }
  return placed;
}

export function WorldMap({ state, dispatch, focusViewBox }: WorldMapProps) {
  const { w, h } = OCEAN_VIEW;
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const viewBox = useMemo(() => {
    if (focusViewBox) return focusViewBox;
    return `0 0 ${w} ${h}`;
  }, [focusViewBox, w, h]);

  const labels = useMemo(() => layoutLabels(TERRITORIES), []);
  const labelById = useMemo(
    () => Object.fromEntries(labels.map((l) => [l.id, l])),
    [labels],
  );

  return (
    <div className="rf-map rf-fade-in">
      <svg
        className="rf-map__svg"
        viewBox={viewBox}
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
          <filter id="rf-label-halo" x="-30%" y="-40%" width="160%" height="180%">
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="1.1"
              floodColor="#040a10"
              floodOpacity="0.95"
            />
          </filter>
        </defs>

        <rect width={w} height={h} fill="url(#rf-ocean)" />
        <rect width={w} height={h} fill="url(#rf-holo-grid)" />
        <rect width={w} height={h} fill="url(#rf-holo-sheen)" />

        {[41.7, 83.3, 125, 166.7, 208.3, 250, 291.7, 333.3, 375, 416.7, 458.3].map(
          (y) => (
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
          ),
        )}
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

        {TERRITORIES.map((t) => {
          const ts = state.territories[t.id];
          const owner = ts?.owner ?? t.startingOwner;
          const base = factionColor(owner);
          const selected = state.selectedTerritoryId === t.id;
          const lbl = labelById[t.id];
          const showLabel =
            lbl && (!lbl.hidden || hoveredId === t.id || selected);
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
              {showLabel && (
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
                  {t.name}
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
