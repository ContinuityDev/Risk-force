import { useMemo, useState } from "react";
import { getTerritory, TERRITORIES } from "../data/map/territories";
import { getUnit, UNIT_LIST } from "../data/units";
import type { GameAction } from "../engine/actions";
import { forceSupplyCost } from "../engine/economy";
import { isUnlocked } from "../engine/research";
import type { GameState, PlayerState, StrikeForceSlot } from "../engine/state";
import { Sprite } from "./Sprite";

interface InvadeViewProps {
  state: GameState;
  activePlayer: PlayerState;
  dispatch: (action: GameAction) => void;
  canAct: boolean;
}

export function InvadeView({
  state,
  activePlayer,
  dispatch,
  canAct,
}: InvadeViewProps) {
  const owned = useMemo(
    () =>
      TERRITORIES.filter(
        (t) => state.territories[t.id]?.owner === activePlayer.id,
      ),
    [state.territories, activePlayer.id],
  );

  const [fromId, setFromId] = useState(
    state.selectedTerritoryId &&
      state.territories[state.selectedTerritoryId]?.owner === activePlayer.id
      ? state.selectedTerritoryId
      : (owned[0]?.id ?? ""),
  );
  const [toId, setToId] = useState("");
  const [force, setForce] = useState<Record<string, number>>({});

  const fromDef = fromId ? getTerritory(fromId) : null;
  const targets = useMemo(() => {
    if (!fromDef) return [];
    return fromDef.neighbors.filter(
      (nid) => state.territories[nid]?.owner !== activePlayer.id,
    );
  }, [fromDef, state.territories, activePlayer.id]);

  const slots: StrikeForceSlot[] = Object.entries(force)
    .filter(([, c]) => c > 0)
    .map(([unitId, count]) => ({ unitId, count }));

  const supplyNeed = forceSupplyCost(
    slots,
    (id) => getUnit(id).supplyCost ?? 1,
  );

  const recruitable = UNIT_LIST.filter((u) => isUnlocked(activePlayer, u.id));

  function setCount(unitId: string, count: number) {
    const max = activePlayer.reserves[unitId] ?? 0;
    setForce((prev) => ({
      ...prev,
      [unitId]: Math.max(0, Math.min(max, count)),
    }));
  }

  return (
    <div className="rf-invade rf-fade-in">
      <header className="rf-view-header">
        <div>
          <span className="rf-label">Operations</span>
          <h2>Invasion Planning</h2>
        </div>
        <p className="rf-resource">
          <span className="rf-label">Supply</span>
          <strong>
            {Math.floor(activePlayer.resources.supply)} / need {supplyNeed}
          </strong>
        </p>
      </header>

      <div className="rf-invade__row">
        <label className="rf-field">
          <span className="rf-label">Launch from</span>
          <select
            value={fromId}
            onChange={(e) => {
              setFromId(e.target.value);
              setToId("");
            }}
          >
            {owned.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="rf-field">
          <span className="rf-label">Target (adjacent enemy)</span>
          <select value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">Select…</option>
            {targets.map((nid) => (
              <option key={nid} value={nid}>
                {getTerritory(nid).name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="rf-invade__force">
        <span className="rf-label">Assemble strike force from reserves</span>
        <ul>
          {recruitable.map((u) => {
            const reserve = activePlayer.reserves[u.id] ?? 0;
            return (
              <li key={u.id}>
                <Sprite id={u.sprite.id} size={32} anim="none" />
                <div>
                  <strong>{u.name}</strong>
                  <small>
                    Reserve {reserve} · Supply {u.supplyCost}/ea
                  </small>
                </div>
                <div className="rf-invade__stepper">
                  <button
                    type="button"
                    disabled={!canAct || (force[u.id] ?? 0) <= 0}
                    onClick={() => setCount(u.id, (force[u.id] ?? 0) - 1)}
                  >
                    −
                  </button>
                  <strong>{force[u.id] ?? 0}</strong>
                  <button
                    type="button"
                    disabled={!canAct || (force[u.id] ?? 0) >= reserve}
                    onClick={() => setCount(u.id, (force[u.id] ?? 0) + 1)}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="ghost"
                  disabled={!canAct || reserve < 1}
                  onClick={() =>
                    dispatch({
                      type: "RECRUIT",
                      payload: { unitId: u.id, count: 1 },
                    })
                  }
                  title={`Recruit (E${u.cost.energy}${u.cost.alloy ? ` A${u.cost.alloy}` : ""})`}
                >
                  Recruit
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="rf-invade__footer">
        <button
          type="button"
          className="primary"
          disabled={
            !canAct ||
            !fromId ||
            !toId ||
            slots.length === 0 ||
            activePlayer.resources.supply < supplyNeed
          }
          onClick={() =>
            dispatch({
              type: "START_INVASION",
              payload: { fromId, toId, force: slots },
            })
          }
        >
          Launch Invasion
        </button>
      </footer>
    </div>
  );
}
