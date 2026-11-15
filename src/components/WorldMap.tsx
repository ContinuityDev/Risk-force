import { useMemo } from "react";
import { factionColor } from "../data/factions";
import {
  LAND_PATH,
  OCEAN_VIEW,
  SEA_ROUTES,
} from "../data/map/earthPaths";
import { TERRITORIES } from "../data/map/territories";
import type { GameAction } from "../engine/actions";
import type { GameState } from "../engine/state";

interface WorldMapProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
  /** Optional viewBox override for focused screenshots / regional zoom. */
  focusViewBox?: string;
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

export function WorldMap({ state, dispatch, focusViewBox }: WorldMapProps) {
  const { w, h } = OCEAN_VIEW;

  const viewBox = useMemo(() => {
    if (focusViewBox) return focusViewBox;
    return `0 0 ${w} ${h}`;
  }, [focusViewBox, w, h]);

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
        </defs>

        <rect width={w} height={h} fill="url(#rf-ocean)" />
        <rect width={w} height={h} fill="url(#rf-holo-grid)" />
        <rect width={w} height={h} fill="url(#rf-holo-sheen)" />

        {/* Latitude lines (approx every 30°) */}
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
        {/* Longitude lines (approx every 30°) */}
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

        {/* Land underlay — true coastlines */}
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

        {/* Sea invasion arcs */}
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

        {/* Faction territories — real country borders */}
        {TERRITORIES.map((t) => {
          const ts = state.territories[t.id];
          const owner = ts?.owner ?? t.startingOwner;
          const base = factionColor(owner);
          const selected = state.selectedTerritoryId === t.id;
          return (
            <g key={t.id} className="rf-map__territory-group">
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
              <text
                x={t.label.x}
                y={t.label.y}
                className="rf-map__label"
                textAnchor="middle"
                dominantBaseline="middle"
                pointerEvents="none"
              >
                {t.name}
              </text>
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
