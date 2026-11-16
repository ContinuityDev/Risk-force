import { useEffect, useMemo, useState } from "react";
import { TERRITORIES } from "../data/map/territories";
import { getUnit, UNIT_LIST } from "../data/units";
import type { GameAction } from "../engine/actions";
import {
  currentSquadLocation,
  listPlayerSquads,
  squadStrength,
  travelEtaLabel,
} from "../engine/squads";
import type { GameState, PlayerState, Squad, StrikeForceSlot } from "../engine/state";
import {
  formatUnitCount,
  territoryDisplayName,
  unitDisplayName,
} from "../ui/displayNames";
import { CounterStrip } from "./CounterStrip";
import { PickerList } from "./PickerList";
import { Sprite } from "./Sprite";

interface SquadsViewProps {
  state: GameState;
  activePlayer: PlayerState;
  dispatch: (action: GameAction) => void;
  canAct: boolean;
}

function garrisonTotal(g: Record<string, number>): number {
  return Object.values(g).reduce((a, b) => a + b, 0);
}

function compositionSummary(force: StrikeForceSlot[]): string {
  if (!force.length) return "Empty";
  const parts = force.slice(0, 4).map((f) => formatUnitCount(f.unitId, f.count));
  if (force.length > 4) parts.push(`+${force.length - 4} types`);
  return parts.join(", ");
}

function statusLabel(status: Squad["status"]): string {
  if (status === "idle") return "Idle";
  if (status === "marching") return "Marching";
  return "Engaged";
}

export function SquadsView({
  state,
  activePlayer,
  dispatch,
  canAct,
}: SquadsViewProps) {
  const squads = useMemo(
    () => listPlayerSquads(state, activePlayer.id),
    [state.squads, activePlayer.id],
  );

  const selectedId =
    state.selectedSquadId &&
    squads.some((s) => s.id === state.selectedSquadId)
      ? state.selectedSquadId
      : (squads[0]?.id ?? null);

  const selected = selectedId
    ? (squads.find((s) => s.id === selectedId) ?? null)
    : null;

  const pendingJoiners = useMemo(() => {
    return (state.armiesInTransit ?? []).filter(
      (a) => a.owner === activePlayer.id && a.joiningSquadId,
    );
  }, [state.armiesInTransit, activePlayer.id]);

  const ownedTerritories = useMemo(
    () =>
      TERRITORIES.filter(
        (t) => state.territories[t.id]?.owner === activePlayer.id,
      ),
    [state.territories, activePlayer.id],
  );

  const [rename, setRename] = useState("");
  const [mergeFromId, setMergeFromId] = useState("");
  const [addFromId, setAddFromId] = useState("");
  const [addForce, setAddForce] = useState<Record<string, number>>({});
  const [departForce, setDepartForce] = useState<Record<string, number>>({});
  const [departMode, setDepartMode] = useState<"garrison" | "new_squad">(
    "garrison",
  );
  const [departName, setDepartName] = useState("");
  const [detailTab, setDetailTab] = useState<
    "overview" | "add" | "depart"
  >("overview");

  useEffect(() => {
    if (selected) setRename(selected.name);
    else setRename("");
    setMergeFromId("");
    setAddForce({});
    setDepartForce({});
    setDetailTab("overview");
  }, [selected?.id, selected?.name]);

  const mergeCandidates = useMemo(() => {
    if (!selected || selected.status !== "idle") return [];
    return squads.filter(
      (s) =>
        s.id !== selected.id &&
        s.status === "idle" &&
        s.territoryId === selected.territoryId,
    );
  }, [squads, selected]);

  const addTerritoriesByContinent = useMemo(() => {
    const map = new Map<string, typeof ownedTerritories>();
    for (const t of ownedTerritories) {
      const g = state.territories[t.id]?.garrison ?? {};
      if (garrisonTotal(g) <= 0) continue;
      const key = t.continent;
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [ownedTerritories, state.territories]);

  const addGarrison = addFromId
    ? (state.territories[addFromId]?.garrison ?? {})
    : {};
  const addUnits = UNIT_LIST.filter((u) => (addGarrison[u.id] ?? 0) > 0);

  const addSlots: StrikeForceSlot[] = Object.entries(addForce)
    .filter(([, c]) => c > 0)
    .map(([unitId, count]) => ({ unitId, count }));

  const departSlots: StrikeForceSlot[] = useMemo(() => {
    if (!selected) return [];
    return Object.entries(departForce)
      .filter(([, c]) => c > 0)
      .map(([unitId, count]) => ({ unitId, count }));
  }, [departForce, selected]);

  function selectSquad(squadId: string) {
    dispatch({ type: "SELECT_SQUAD", payload: { squadId } });
  }

  function setAddCount(unitId: string, count: number) {
    const max = addGarrison[unitId] ?? 0;
    setAddForce((prev) => ({
      ...prev,
      [unitId]: Math.max(0, Math.min(max, count)),
    }));
  }

  function setDepartCount(unitId: string, count: number) {
    const inSquad =
      selected?.force.find((f) => f.unitId === unitId)?.count ?? 0;
    setDepartForce((prev) => ({
      ...prev,
      [unitId]: Math.max(0, Math.min(inSquad, count)),
    }));
  }

  const addEta =
    selected && addFromId && addSlots.length
      ? travelEtaLabel(addFromId, currentSquadLocation(state, selected), addSlots, state.territories)
      : null;

  return (
    <div className="rf-squads rf-fade-in" data-tutorial="squads-view">
      <header className="rf-view-header">
        <div>
          <span className="rf-label">Forces</span>
          <h2>Squads</h2>
          <p className="rf-hint">
            Named standing armies on your territories. Reinforcements march to
            join squads; use the map to order attacks and relocations.
          </p>
        </div>
        <p className="rf-resource">
          <span className="rf-label">Active</span>
          <strong>
            {squads.length} squad{squads.length === 1 ? "" : "s"}
          </strong>
        </p>
      </header>

      {pendingJoiners.length > 0 && (
        <section className="rf-squads__joiners">
          <span className="rf-label">Reinforcements en route</span>
          <ul>
            {pendingJoiners.map((army) => {
              const squad = squads.find((s) => s.id === army.joiningSquadId);
              const destId = squad
                ? currentSquadLocation(state, squad)
                : army.toId;
              return (
                <li key={army.id}>
                  <div>
                    <strong>
                      {compositionSummary(army.force)} →{" "}
                      {squad?.name ?? "Squad"}
                    </strong>
                    <small>
                      {territoryDisplayName(army.fromId)} →{" "}
                      {territoryDisplayName(destId)} · {army.turnsRemaining}{" "}
                      turn{army.turnsRemaining === 1 ? "" : "s"} · joining
                    </small>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="rf-squads__layout">
        <section className="rf-squads__list">
          <span className="rf-label">Your squads</span>
          {squads.length === 0 && (
            <p className="rf-hint">
              No squads yet — form one from a garrison on the map or in Base.
            </p>
          )}
          <ul>
            {squads.map((squad) => {
              const locId = currentSquadLocation(state, squad);
              const active = squad.id === selectedId;
              return (
                <li key={squad.id} className={active ? "is-active" : undefined}>
                  <button
                    type="button"
                    className={active ? "primary" : "ghost"}
                    onClick={() => selectSquad(squad.id)}
                  >
                    <strong>{squad.name}</strong>
                    <small>
                      {territoryDisplayName(locId)} ·{" "}
                      {compositionSummary(squad.force)} · Str{" "}
                      {squadStrength(squad.force)} · {statusLabel(squad.status)}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {selected && (
          <aside className="rf-squads__detail">
            <header className="rf-squads__detail-head">
              <div>
                <h3>{selected.name}</h3>
                <p className="rf-hint">
                  {territoryDisplayName(currentSquadLocation(state, selected))}{" "}
                  · {statusLabel(selected.status)} · Str{" "}
                  {squadStrength(selected.force)}
                </p>
              </div>
              <div className="rf-squads__detail-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    dispatch({ type: "SET_SCREEN", payload: { screen: "map" } })
                  }
                >
                  Map
                </button>
              </div>
            </header>

            <ul className="rf-squads__comp">
              {selected.force.map((slot) => {
                const u = getUnit(slot.unitId);
                return (
                  <li key={slot.unitId}>
                    <Sprite id={u.sprite.id} size={28} anim="none" />
                    <span>
                      {unitDisplayName(slot.unitId)}×{slot.count}
                    </span>
                    <CounterStrip unitId={slot.unitId} />
                  </li>
                );
              })}
            </ul>

            <div className="rf-squads__tabs">
              <button
                type="button"
                className={detailTab === "overview" ? "primary" : "ghost"}
                onClick={() => setDetailTab("overview")}
              >
                Manage
              </button>
              <button
                type="button"
                className={detailTab === "add" ? "primary" : "ghost"}
                disabled={selected.status === "engaged"}
                onClick={() => setDetailTab("add")}
              >
                Add units
              </button>
              <button
                type="button"
                className={detailTab === "depart" ? "primary" : "ghost"}
                disabled={selected.status !== "idle"}
                onClick={() => setDetailTab("depart")}
              >
                Depart
              </button>
            </div>

            {detailTab === "overview" && (
              <div className="rf-squads__section">
                <label className="rf-squads__rename">
                  <span className="rf-label">Rename</span>
                  <div className="rf-squads__rename-row">
                    <input
                      type="text"
                      maxLength={28}
                      value={rename}
                      onChange={(e) => setRename(e.target.value)}
                    />
                    <button
                      type="button"
                      className="ghost"
                      disabled={!canAct || !rename.trim()}
                      onClick={() =>
                        dispatch({
                          type: "RENAME_SQUAD",
                          payload: { squadId: selected.id, name: rename },
                        })
                      }
                    >
                      Save
                    </button>
                  </div>
                </label>

                {mergeCandidates.length > 0 && selected.status === "idle" && (
                  <div className="rf-squads__merge">
                    <PickerList
                      label="Merge another idle squad here"
                      value={mergeFromId}
                      onChange={setMergeFromId}
                      emptyText="No other idle squads in this territory"
                      options={mergeCandidates.map((s) => ({
                        id: s.id,
                        label: s.name,
                        meta: compositionSummary(s.force),
                      }))}
                    />
                    <button
                      type="button"
                      className="ghost"
                      disabled={!canAct || !mergeFromId}
                      onClick={() => {
                        dispatch({
                          type: "MERGE_SQUADS",
                          payload: {
                            intoId: selected.id,
                            fromId: mergeFromId,
                          },
                        });
                        setMergeFromId("");
                      }}
                    >
                      Merge selected
                    </button>
                  </div>
                )}

                <footer className="rf-squads__danger">
                  <button
                    type="button"
                    className="ghost"
                    disabled={
                      !canAct ||
                      selected.status === "marching" ||
                      selected.status === "engaged"
                    }
                    onClick={() => {
                      dispatch({
                        type: "DISBAND_SQUAD",
                        payload: { squadId: selected.id },
                      });
                    }}
                  >
                    Disband into local garrison
                  </button>
                </footer>
              </div>
            )}

            {detailTab === "add" && (
              <div className="rf-squads__section">
                {addTerritoriesByContinent.map(([continent, terrs]) => (
                  <div key={continent} className="rf-squads__add-group">
                    <span className="rf-label">{continent}</span>
                    <ul className="rf-picker__list">
                      {terrs.map((t) => {
                        const g = state.territories[t.id]?.garrison ?? {};
                        const total = garrisonTotal(g);
                        return (
                          <li key={t.id}>
                            <button
                              type="button"
                              className={
                                addFromId === t.id ? "primary" : "ghost"
                              }
                              onClick={() => {
                                setAddFromId(t.id);
                                setAddForce({});
                              }}
                            >
                              <strong>{t.name}</strong>
                              <small>Garrison {total}</small>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}

                {addFromId && (
                  <section className="rf-squads__force rf-invade__force">
                    <span className="rf-label">Units to send</span>
                    {addEta != null && addSlots.length > 0 && (
                      <p className="rf-hint">
                        Travel ~{addEta} turn{addEta === 1 ? "" : "s"}
                      </p>
                    )}
                    <ul>
                      {addUnits.map((u) => {
                        const reserve = addGarrison[u.id] ?? 0;
                        return (
                          <li key={u.id}>
                            <Sprite id={u.sprite.id} size={32} anim="none" />
                            <div>
                              <strong>{u.name}</strong>
                              <small>Avail {reserve}</small>
                              <CounterStrip unitId={u.id} />
                            </div>
                            <div className="rf-invade__stepper">
                              <button
                                type="button"
                                disabled={
                                  !canAct || (addForce[u.id] ?? 0) <= 0
                                }
                                onClick={() =>
                                  setAddCount(u.id, (addForce[u.id] ?? 0) - 1)
                                }
                              >
                                −
                              </button>
                              <strong>{addForce[u.id] ?? 0}</strong>
                              <button
                                type="button"
                                disabled={
                                  !canAct ||
                                  (addForce[u.id] ?? 0) >= reserve
                                }
                                onClick={() =>
                                  setAddCount(u.id, (addForce[u.id] ?? 0) + 1)
                                }
                              >
                                +
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      type="button"
                      className="primary"
                      disabled={!canAct || addSlots.length === 0}
                      onClick={() => {
                        dispatch({
                          type: "ADD_TO_SQUAD",
                          payload: {
                            squadId: selected.id,
                            fromId: addFromId,
                            force: addSlots,
                          },
                        });
                        setAddForce({});
                      }}
                    >
                      Dispatch reinforcements
                    </button>
                  </section>
                )}
              </div>
            )}

            {detailTab === "depart" && (
              <div className="rf-squads__section">
                <div className="rf-squads__modes">
                  <button
                    type="button"
                    className={
                      departMode === "garrison" ? "primary" : "ghost"
                    }
                    onClick={() => setDepartMode("garrison")}
                  >
                    To garrison
                  </button>
                  <button
                    type="button"
                    className={
                      departMode === "new_squad" ? "primary" : "ghost"
                    }
                    onClick={() => setDepartMode("new_squad")}
                  >
                    New squad
                  </button>
                </div>

                {departMode === "new_squad" && (
                  <label className="rf-squads__rename">
                    <span className="rf-label">New squad name</span>
                    <input
                      type="text"
                      maxLength={28}
                      value={departName}
                      onChange={(e) => setDepartName(e.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                )}

                <section className="rf-squads__force rf-invade__force">
                  <span className="rf-label">Units to depart</span>
                  <ul>
                    {selected.force.map((slot) => {
                      const u = getUnit(slot.unitId);
                      return (
                        <li key={slot.unitId}>
                          <Sprite id={u.sprite.id} size={32} anim="none" />
                          <div>
                            <strong>{u.name}</strong>
                            <small>In squad {slot.count}</small>
                            <CounterStrip unitId={slot.unitId} />
                          </div>
                          <div className="rf-invade__stepper">
                            <button
                              type="button"
                              disabled={
                                !canAct ||
                                (departForce[slot.unitId] ?? 0) <= 0
                              }
                              onClick={() =>
                                setDepartCount(
                                  slot.unitId,
                                  (departForce[slot.unitId] ?? 0) - 1,
                                )
                              }
                            >
                              −
                            </button>
                            <strong>{departForce[slot.unitId] ?? 0}</strong>
                            <button
                              type="button"
                              disabled={
                                !canAct ||
                                (departForce[slot.unitId] ?? 0) >= slot.count
                              }
                              onClick={() =>
                                setDepartCount(
                                  slot.unitId,
                                  (departForce[slot.unitId] ?? 0) + 1,
                                )
                              }
                            >
                              +
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    className="primary"
                    disabled={!canAct || departSlots.length === 0}
                    onClick={() => {
                      dispatch({
                        type: "DEPART_SQUAD",
                        payload: {
                          squadId: selected.id,
                          force: departSlots,
                          mode: departMode,
                          name:
                            departMode === "new_squad"
                              ? departName.trim() || undefined
                              : undefined,
                        },
                      });
                      setDepartForce({});
                    }}
                  >
                    Depart units
                  </button>
                </section>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}