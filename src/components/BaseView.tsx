import { useMemo, useState, type CSSProperties } from "react";
import { BUILDING_LIST, getBuilding } from "../data/buildings";
import { factionColor } from "../data/factions";
import { GAME_LOOP, HELP } from "../data/gameLoop";
import { getTerritory } from "../data/map/territories";
import { UNIT_LIST } from "../data/units";
import type { GameAction } from "../engine/actions";
import { canAfford } from "../engine/economy";
import { canPlaceBuilding } from "../engine/placement";
import { isUnlocked } from "../engine/research";
import type { GameState, PlayerState } from "../engine/state";
import { workerCapForBuilding } from "../engine/training";
import { Sprite } from "./Sprite";

interface BaseViewProps {
  state: GameState;
  activePlayer: PlayerState;
  dispatch: (action: GameAction) => void;
  canAct: boolean;
}

const CELL = 84;

export function BaseView({
  state,
  activePlayer,
  dispatch,
  canAct,
}: BaseViewProps) {
  const tid = state.selectedTerritoryId;
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [demolishId, setDemolishId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  if (!tid) {
    return (
      <div className="rf-empty rf-fade-in">
        <p>Select a territory on the map to manage its base.</p>
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

  const tdef = getTerritory(tid);
  const ts = state.territories[tid]!;
  const owned = ts.owner === activePlayer.id;
  const accent = factionColor(ts.owner);
  const hasNexus = ts.buildings.some((b) => b.buildingId === "command_nexus");
  const catalog = BUILDING_LIST.filter(
    (b) => b.id !== "command_nexus" || !hasNexus,
  );
  const assignedWorkers = ts.buildings.reduce(
    (s, b) => s + (b.workers ?? 0),
    0,
  );
  const freeWorkers = Math.max(0, (ts.workers ?? 0) - assignedWorkers);
  const trainables = UNIT_LIST.filter(
    (u) =>
      u.id === GAME_LOOP.training.basicUnitId ||
      isUnlocked(activePlayer, u.id),
  ).slice(0, 8);

  const occupied = useMemo(() => {
    const cells = new Set<string>();
    for (const b of ts.buildings) {
      const def = getBuilding(b.buildingId);
      for (let dy = 0; dy < def.size.h; dy++) {
        for (let dx = 0; dx < def.size.w; dx++) {
          cells.add(`${b.x + dx},${b.y + dy}`);
        }
      }
    }
    return cells;
  }, [ts.buildings]);

  const ghost = useMemo(() => {
    if (!selectedBuilding || !hover || !tid) return null;
    const def = getBuilding(selectedBuilding);
    const check = canPlaceBuilding(
      ts,
      tid,
      selectedBuilding,
      hover.x,
      hover.y,
      activePlayer,
    );
    return {
      ...hover,
      w: def.size.w,
      h: def.size.h,
      def,
      valid: check.ok,
      reason: check.ok ? null : check.reason,
    };
  }, [selectedBuilding, hover, tid, ts, activePlayer]);

  function placeAt(x: number, y: number) {
    if (!canAct || !owned || !selectedBuilding || !tid) return;
    const check = canPlaceBuilding(
      ts,
      tid,
      selectedBuilding,
      x,
      y,
      activePlayer,
    );
    if (!check.ok) return;
    dispatch({
      type: "PLACE_BUILDING",
      payload: { territoryId: tid, buildingId: selectedBuilding, x, y },
    });
  }

  const gridW = tdef.grid.cols * CELL;
  const gridH = tdef.grid.rows * CELL;

  return (
    <div className="rf-base rf-fade-in">
      <header className="rf-view-header">
        <div>
          <span className="rf-label">{tdef.continent}</span>
          <h2>{tdef.name} Base</h2>
          {!owned && <p className="rf-text-dim">Enemy-controlled sector</p>}
        </div>
        <p className="rf-text-dim" title={HELP.population}>
          Pop {ts.population} · Workers {ts.workers} ({freeWorkers} free) ·
          Supply {Math.floor(ts.supplyStock)} · Garrison{" "}
          {Object.values(ts.garrison).reduce((a, b) => a + b, 0)}
        </p>
      </header>

      <div className="rf-base__layout">
        <div
          className="rf-base__yard"
          style={
            {
              "--rf-base-accent": accent,
              width: gridW,
              height: gridH,
            } as CSSProperties
          }
          onMouseLeave={() => setHover(null)}
        >
          {/* Terrain layers */}
          <div className="rf-base__terrain" />
          <div className="rf-base__gridlines">
            {Array.from({ length: tdef.grid.rows * tdef.grid.cols }, (_, i) => {
              const x = i % tdef.grid.cols;
              const y = Math.floor(i / tdef.grid.cols);
              return (
                <button
                  key={`${x}-${y}`}
                  type="button"
                  className={`rf-base__pad${occupied.has(`${x},${y}`) ? " is-filled" : ""}`}
                  style={{
                    left: x * CELL,
                    top: y * CELL,
                    width: CELL,
                    height: CELL,
                  }}
                  disabled={!canAct || !owned}
                  onMouseEnter={() => setHover({ x, y })}
                  onClick={() => {
                    const inst = ts.buildings.find((b) => {
                      const def = getBuilding(b.buildingId);
                      return (
                        x >= b.x &&
                        x < b.x + def.size.w &&
                        y >= b.y &&
                        y < b.y + def.size.h
                      );
                    });
                    if (inst && demolishId === inst.instanceId) {
                      if (inst.buildingId !== "command_nexus") {
                        dispatch({
                          type: "DEMOLISH_BUILDING",
                          payload: {
                            territoryId: tid,
                            instanceId: inst.instanceId,
                          },
                        });
                      }
                      setDemolishId(null);
                      return;
                    }
                    if (inst) {
                      setDemolishId(inst.instanceId);
                      return;
                    }
                    placeAt(x, y);
                  }}
                />
              );
            })}
          </div>

          {/* Ghost placement preview — green valid / red invalid */}
          {ghost && owned && (
            <div
              className={`rf-base__ghost ${
                ghost.valid ? "is-valid" : "is-invalid"
              }`}
              style={{
                left: ghost.x * CELL,
                top: ghost.y * CELL,
                width: ghost.w * CELL,
                height: ghost.h * CELL,
              }}
              title={ghost.reason ?? "Place here"}
            />
          )}

          {/* Buildings */}
          {ts.buildings.map((inst) => {
            const def = getBuilding(inst.buildingId);
            const constructing = inst.buildRemaining > 0;
            const anim =
              constructing
                ? "working"
                : def.damage
                  ? "idle"
                  : def.output
                    ? "working"
                    : "idle";
            return (
              <div
                key={inst.instanceId}
                className={`rf-base__structure${
                  demolishId === inst.instanceId ? " is-target" : ""
                }${constructing ? " is-building" : ""}`}
                style={{
                  left: inst.x * CELL,
                  top: inst.y * CELL,
                  width: def.size.w * CELL,
                  height: def.size.h * CELL,
                }}
              >
                <Sprite
                  id={def.sprite.id}
                  anim={anim}
                  className={`rf-base__sprite rf-base__sprite--${def.category}`}
                  size={Math.min(def.size.w, def.size.h) * CELL - 8}
                />
                {/* faction accent strip */}
                <span
                  className="rf-base__accent"
                  style={{ background: accent }}
                />
                {constructing && (
                  <span className="rf-base__progress">
                    Constructing · T-{Math.ceil(inst.buildRemaining)}
                  </span>
                )}
                {!constructing && owned && (
                  <label className="rf-base__staff" title={HELP.workers}>
                    Staff
                    <input
                      type="number"
                      min={0}
                      max={workerCapForBuilding(inst.buildingId)}
                      value={inst.workers ?? 0}
                      disabled={!canAct}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        dispatch({
                          type: "ASSIGN_WORKERS",
                          payload: {
                            territoryId: tid,
                            instanceId: inst.instanceId,
                            workers: Number(e.target.value),
                          },
                        })
                      }
                    />
                    /{workerCapForBuilding(inst.buildingId)}
                  </label>
                )}
                <span className="rf-base__hp">
                  {Math.ceil(inst.hp)}/{def.maxHp}
                </span>
                <span className="rf-base__name">{def.name}</span>
              </div>
            );
          })}
        </div>

        <aside className="rf-base__catalog">
          {owned && (
            <section className="rf-base__pop" title={HELP.training}>
              <span className="rf-label">Population & Training</span>
              <p className="rf-hint">
                Untrained pop: <strong>{ts.population}</strong>. Train locally —
                advanced units need research.
              </p>
              <div className="rf-base__train-row">
                <button
                  type="button"
                  className="ghost"
                  disabled={!canAct || ts.population < 1}
                  onClick={() =>
                    dispatch({
                      type: "TRAIN_WORKER",
                      payload: { territoryId: tid, count: 1 },
                    })
                  }
                >
                  +Worker (E{GAME_LOOP.training.worker.energy})
                </button>
              </div>
              <ul className="rf-base__train-list">
                {trainables.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      disabled={!canAct || ts.population < 1}
                      onClick={() =>
                        dispatch({
                          type: "TRAIN_UNIT",
                          payload: {
                            territoryId: tid,
                            unitId: u.id,
                            count: 1,
                          },
                        })
                      }
                    >
                      Train {u.name}
                    </button>
                  </li>
                ))}
              </ul>
              {ts.trainingQueue.length > 0 && (
                <p className="rf-hint">
                  Queue:{" "}
                  {ts.trainingQueue
                    .map(
                      (j) =>
                        `${j.kind}${j.unitId ? `:${j.unitId}` : ""}×${j.count} (T-${j.turnsRemaining})`,
                    )
                    .join(", ")}
                </p>
              )}
            </section>
          )}
          <span className="rf-label">Structures</span>
          <ul>
            {catalog.map((b) => {
              const unlocked = isUnlocked(activePlayer, b.id);
              const affordable = canAfford(activePlayer, b.cost);
              const coastalBlocked =
                (b.category === "naval" || b.id.includes("coastal")) &&
                !tdef.coastal;
              const disabled =
                !canAct ||
                !owned ||
                !unlocked ||
                !affordable ||
                coastalBlocked;
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    className={
                      selectedBuilding === b.id ? "primary" : undefined
                    }
                    disabled={disabled}
                    onClick={() =>
                      setSelectedBuilding((cur) =>
                        cur === b.id ? null : b.id,
                      )
                    }
                  >
                    <Sprite id={b.sprite.id} size={36} anim="idle" />
                    <span>
                      <strong>{b.name}</strong>
                      <small>
                        {b.size.w}×{b.size.h} · E{b.cost.energy}
                        {b.cost.alloy ? ` · A${b.cost.alloy}` : ""}
                        {!unlocked
                          ? " · locked"
                          : coastalBlocked
                            ? " · coastal"
                            : ""}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="rf-hint">
            Select a structure, then click an empty pad. Click a building twice
            to demolish (HQ excluded).
          </p>
        </aside>
      </div>
    </div>
  );
}
