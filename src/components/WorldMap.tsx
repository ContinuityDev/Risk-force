import { factionColor } from "../data/factions";
import { TERRITORIES } from "../data/map/territories";
import type { GameAction } from "../engine/actions";
import type { GameState } from "../engine/state";

interface WorldMapProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

export function WorldMap({ state, dispatch }: WorldMapProps) {
  return (
    <div className="rf-map rf-fade-in">
      <svg
        className="rf-map__svg"
        viewBox="0 0 1000 560"
        role="img"
        aria-label="Earth theater map"
      >
        <defs>
          <linearGradient id="rf-ocean" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0c1824" />
            <stop offset="45%" stopColor="#102030" />
            <stop offset="100%" stopColor="#0a1420" />
          </linearGradient>
          <radialGradient id="rf-ocean-glow" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#1a3348" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#0a1420" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="1000" height="560" fill="url(#rf-ocean)" />
        <rect width="1000" height="560" fill="url(#rf-ocean-glow)" />

        {/* subtle latitude lines */}
        {[120, 220, 320, 420].map((y) => (
          <line
            key={y}
            x1="20"
            y1={y}
            x2="980"
            y2={y}
            stroke="#1e2e40"
            strokeWidth="0.6"
            opacity="0.5"
          />
        ))}

        {TERRITORIES.map((t) => {
          const ts = state.territories[t.id];
          const owner = ts?.owner ?? t.startingOwner;
          const fill = factionColor(owner);
          const selected = state.selectedTerritoryId === t.id;
          return (
            <g key={t.id} className="rf-map__territory-group">
              <path
                d={t.path}
                className={`rf-map__territory${selected ? " is-selected" : ""}`}
                fill={fill}
                fillOpacity={selected ? 0.92 : 0.72}
                stroke={selected ? "#b6dce8" : "#243041"}
                strokeWidth={selected ? 2.2 : 1.1}
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
      </svg>

      {state.selectedTerritoryId && (
        <aside className="rf-map__detail">
          <span className="rf-label">Selected</span>
          <strong>
            {TERRITORIES.find((t) => t.id === state.selectedTerritoryId)?.name}
          </strong>
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
