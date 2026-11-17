import { useState } from "react";
import { getTerritory } from "../data/map/territories";
import { UNIT_LIST } from "../data/units";
import type { GameAction } from "../engine/actions";
import type { GameState, StrikeForceSlot } from "../engine/state";
import { territoryDisplayName } from "../ui/displayNames";
import { CounterStrip } from "./CounterStrip";
import { Sprite } from "./Sprite";

interface CreateSquadPanelProps {
  state: GameState;
  territoryId: string;
  dispatch: (action: GameAction) => void;
  onClose: () => void;
  /** Compact layout for the short-landscape map sheet. */
  compact?: boolean;
}

export function CreateSquadPanel({
  state,
  territoryId,
  dispatch,
  onClose,
  compact = false,
}: CreateSquadPanelProps) {
  const ts = state.territories[territoryId];
  const garrison = ts?.garrison ?? {};
  const garrisonUnits = UNIT_LIST.filter((u) => (garrison[u.id] ?? 0) > 0);
  const [force, setForce] = useState<Record<string, number>>({});
  const [name, setName] = useState("");

  const slots: StrikeForceSlot[] = Object.entries(force)
    .filter(([, c]) => c > 0)
    .map(([unitId, count]) => ({ unitId, count }));

  function setCount(unitId: string, count: number) {
    const max = garrison[unitId] ?? 0;
    setForce((prev) => ({
      ...prev,
      [unitId]: Math.max(0, Math.min(max, count)),
    }));
  }

  const tdef = getTerritory(territoryId);
  const activeId = state.playerOrder[state.activePlayerIndex];
  const owned = ts?.owner === activeId;

  return (
    <div
      className={`rf-squads__create-panel${compact ? " rf-squads__create-panel--compact" : ""}`}
      data-testid="create-squad-panel"
    >
      <header className="rf-squads__create-head">
        <div>
          <span className="rf-label">New squad</span>
          <h3>{territoryDisplayName(territoryId)}</h3>
          <p className="rf-hint">
            {tdef.continent} · Pull units from the local garrison.
          </p>
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </header>

      <label className="rf-squads__rename">
        <span className="rf-label">Name (optional)</span>
        <input
          type="text"
          maxLength={28}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Squad name"
        />
      </label>

      <section className="rf-squads__force rf-invade__force">
        <span className="rf-label">Units from garrison</span>
        {garrisonUnits.length === 0 && (
          <p className="rf-hint">No units stationed here.</p>
        )}
        <ul>
          {garrisonUnits.map((u) => {
            const reserve = garrison[u.id] ?? 0;
            return (
              <li key={u.id}>
                <Sprite id={u.sprite.id} size={32} anim="none" />
                <div>
                  <strong>{u.name}</strong>
                  <small>
                    Garrison {reserve} · Supply {u.supplyCost}/ea
                  </small>
                  <CounterStrip unitId={u.id} />
                </div>
                <div className="rf-invade__stepper">
                  <button
                    type="button"
                    disabled={(force[u.id] ?? 0) <= 0}
                    onClick={() => setCount(u.id, (force[u.id] ?? 0) - 1)}
                  >
                    −
                  </button>
                  <strong>{force[u.id] ?? 0}</strong>
                  <button
                    type="button"
                    disabled={(force[u.id] ?? 0) >= reserve}
                    onClick={() => setCount(u.id, (force[u.id] ?? 0) + 1)}
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="rf-squads__create-footer">
        <button
          type="button"
          className="primary"
          disabled={!owned || slots.length === 0}
          onClick={() => {
            dispatch({
              type: "CREATE_SQUAD",
              payload: {
                territoryId,
                force: slots,
                name: name.trim() || undefined,
              },
            });
            onClose();
          }}
        >
          Create squad
          {slots.length > 0
            ? ` · ${slots.reduce((s, x) => s + x.count, 0)} units`
            : ""}
        </button>
      </footer>
    </div>
  );
}