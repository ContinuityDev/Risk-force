import { useMemo, useState } from "react";
import { GAME_LOOP, HELP } from "../data/gameLoop";
import { getTerritory } from "../data/map/territories";
import { getUnit } from "../data/units";
import type { GameAction } from "../engine/actions";
import type { CaptureDisposition } from "../engine/occupation";
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
  const [disposition, setDisposition] = useState<CaptureDisposition>("keep");

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

  const buildingCount = pending.buildings?.length ?? 0;

  return (
    <div
      className="rf-capture rf-capture--sheet rf-fade-in"
      data-testid="capture-sheet"
      data-territory-id={pending.territoryId}
    >
      <header className="rf-view-header">
        <div>
          <span className="rf-label">Occupation</span>
          <h2 data-testid="capture-territory-name">Secure {name}</h2>
          <p className="rf-text-dim" title={HELP.invasion}>
            Captured land is occupied (reduced output) until stabilized. Choose
            Raze or Keep, then how many survivors garrison — the rest return
            home.
          </p>
        </div>
      </header>

      <div className="rf-capture__panel">
        <div className="rf-capture__disposition" role="group" aria-label="Disposition">
          <button
            type="button"
            className={disposition === "raze" ? "primary" : undefined}
            onClick={() => setDisposition("raze")}
          >
            Raze
            <small>
              +{GAME_LOOP.occupation.razeEnergyBonus} energy · wipe buildings ·
              pop penalty
            </small>
          </button>
          <button
            type="button"
            className={disposition === "keep" ? "primary" : undefined}
            onClick={() => setDisposition("keep")}
          >
            Keep
            <small>
              {buildingCount === 0
                ? "No structures left — occupy the empty site"
                : `${buildingCount} structure${buildingCount === 1 ? "" : "s"} retained at ${Math.round(GAME_LOOP.occupation.keepBuildingHpMult * 100)}% HP`}
            </small>
          </button>
        </div>

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
          <span className="rf-capture__slider-label">
            Occupy with <strong>{occupy}</strong>
            <span className="rf-text-dim"> / {total}</span>
          </span>
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
              payload: { occupyCount: occupy, disposition },
            })
          }
        >
          Confirm {disposition === "raze" ? "Raze" : "Keep"}
        </button>
      </div>
    </div>
  );
}
