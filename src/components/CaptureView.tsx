import { useMemo, useState } from "react";
import { GAME_LOOP, HELP } from "../data/gameLoop";
import { getTerritory } from "../data/map/territories";
import { getUnit } from "../data/units";
import type { GameAction } from "../engine/actions";
import type { GameState } from "../engine/state";

interface CaptureViewProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

export function CaptureView({ state, dispatch }: CaptureViewProps) {
  const pending = state.pendingCapture;
  const total = useMemo(
    () => pending?.survivors.reduce((s, x) => s + x.count, 0) ?? 0,
    [pending],
  );
  const [occupy, setOccupy] = useState(() =>
    Math.max(
      1,
      Math.round(total * GAME_LOOP.capture.defaultOccupyFraction),
    ),
  );

  if (!pending) {
    return (
      <div className="rf-empty rf-fade-in">
        <p>No capture pending.</p>
        <button
          type="button"
          className="primary"
          onClick={() =>
            dispatch({ type: "SET_SCREEN", payload: { screen: "map" } })
          }
        >
          Return to Map
        </button>
      </div>
    );
  }

  let name = pending.territoryId;
  try {
    name = getTerritory(pending.territoryId).name;
  } catch {
    /* */
  }

  return (
    <div className="rf-capture rf-fade-in">
      <header className="rf-view-header">
        <div>
          <span className="rf-label">Occupation</span>
          <h2>Secure {name}</h2>
          <p className="rf-text-dim" title={HELP.invasion}>
            Structures razed. Local population {pending.population}. Choose how
            many survivors garrison the new plot — the rest return home.
          </p>
        </div>
      </header>

      <div className="rf-capture__panel">
        <ul className="rf-capture__force">
          {pending.survivors.map((s) => {
            let label = s.unitId;
            try {
              label = getUnit(s.unitId).name;
            } catch {
              /* */
            }
            return (
              <li key={s.unitId}>
                {label} ×{s.count}
              </li>
            );
          })}
        </ul>

        <label className="rf-capture__slider">
          Occupy with <strong>{occupy}</strong> / {total}
          <input
            type="range"
            min={0}
            max={Math.max(0, total)}
            value={Math.min(occupy, total)}
            onChange={(e) => setOccupy(Number(e.target.value))}
          />
        </label>

        <button
          type="button"
          className="primary"
          onClick={() =>
            dispatch({
              type: "CONFIRM_CAPTURE",
              payload: { occupyCount: occupy },
            })
          }
        >
          Confirm Occupation
        </button>
      </div>
    </div>
  );
}
