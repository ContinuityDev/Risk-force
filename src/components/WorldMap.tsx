import { factionColor } from "../data/factions";
import {
  CONTINENT_SILHOUETTES,
  OCEAN_VIEW,
  SEA_ROUTES,
} from "../data/map/earthPaths";
import { TERRITORIES } from "../data/map/territories";
import type { GameAction } from "../engine/actions";
import type { GameState } from "../engine/state";

interface WorldMapProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

export function WorldMap({ state, dispatch }: WorldMapProps) {
  const { w, h } = OCEAN_VIEW;

  return (
    <div className="rf-map rf-fade-in">
      <svg
        className="rf-map__svg"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Earth theater holographic map"
      >
        <defs>
          <radialGradient id="rf-ocean" cx="50%" cy="42%" r="65%">
            <stop offset="0%" stopColor="#163048" />
            <stop offset="55%" stopColor="#0e1c2c" />
            <stop offset="100%" stopColor="#081018" />
          </radialGradient>
          <linearGradient id="rf-holo-sheen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7eb6c9" stopOpacity="0.07" />
            <stop offset="50%" stopColor="#7eb6c9" stopOpacity="0" />
            <stop offset="100%" stopColor="#c4a574" stopOpacity="0.05" />
          </linearGradient>
          <pattern
            id="rf-holo-grid"
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 28 0 L 0 0 0 28"
              fill="none"
              stroke="#7eb6c9"
              strokeWidth="0.4"
              opacity="0.12"
            />
          </pattern>
          <filter id="rf-land-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="rf-select-glow">
            <feGaussianBlur stdDeviation="1.8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ocean + ambience */}
        <rect width={w} height={h} fill="url(#rf-ocean)" />
        <rect width={w} height={h} fill="url(#rf-holo-grid)" />
        <rect width={w} height={h} fill="url(#rf-holo-sheen)" />

        {/* Latitude / longitude hairlines */}
        {[90, 160, 230, 300, 370, 440].map((y) => (
          <line
            key={`lat-${y}`}
            x1="20"
            y1={y}
            x2={w - 20}
            y2={y}
            stroke="#7eb6c9"
            strokeWidth="0.35"
            opacity="0.08"
          />
        ))}
        {[120, 250, 400, 550, 700, 850].map((x) => (
          <line
            key={`lon-${x}`}
            x1={x}
            y1="20"
            x2={x}
            y2={h - 20}
            stroke="#7eb6c9"
            strokeWidth="0.35"
            opacity="0.06"
          />
        ))}

        {/* Continent underlays — readable Earth landmasses */}
        <g className="rf-map__continents" filter="url(#rf-land-glow)">
          {CONTINENT_SILHOUETTES.map((c) => (
            <path
              key={c.id}
              d={c.d}
              fill="#1e3a48"
              fillOpacity="0.92"
              stroke="#5a8a9a"
              strokeWidth="1.6"
            />
          ))}
          {CONTINENT_SILHOUETTES.map((c) => (
            <path
              key={`${c.id}-rim`}
              d={c.d}
              fill="none"
              stroke="#7eb6c9"
              strokeWidth="0.6"
              opacity="0.35"
            />
          ))}
        </g>

        {/* Sea routes */}
        <g className="rf-map__routes" fill="none">
          {SEA_ROUTES.map((r, i) => (
            <path
              key={i}
              d={r.d}
              stroke="#7eb6c9"
              strokeWidth="1"
              strokeDasharray="3 7"
              opacity="0.28"
              className="rf-map__route"
            />
          ))}
        </g>

        {/* Territories */}
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
                fill={hexToRgba(base, selected ? 0.9 : 0.78)}
                stroke={selected ? "#d4eaf2" : "#081018"}
                strokeWidth={selected ? 2.2 : 1.1}
                strokeLinejoin="round"
                filter={selected ? "url(#rf-select-glow)" : undefined}
                onClick={() =>
                  dispatch({
                    type: "SELECT_TERRITORY",
                    payload: { territoryId: t.id },
                  })
                }
              />
              {/* subtle inner edge for depth */}
              <path
                d={t.path}
                fill="none"
                stroke="#0a1018"
                strokeWidth="0.5"
                opacity="0.35"
                pointerEvents="none"
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

        {/* Scanline overlay */}
        <rect
          width={w}
          height={h}
          fill="url(#rf-holo-grid)"
          opacity="0.35"
          pointerEvents="none"
          className="rf-map__scan"
        />

        {/* Frame chrome */}
        <rect
          x="4"
          y="4"
          width={w - 8}
          height={h - 8}
          fill="none"
          stroke="#2c3a4d"
          strokeWidth="1"
          opacity="0.7"
          pointerEvents="none"
        />
        <text x="16" y="22" className="rf-map__chrome-label">
          EARTH THEATER · HOLO-PROJECTION
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
