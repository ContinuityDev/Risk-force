import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  BUILDING_LIST,
  getBuilding,
  isTrainingBuilding,
} from "../data/buildings";
import { buildingBlurb } from "../data/buildings/blurb";
import { factionColor } from "../data/factions";
import { GAME_LOOP, HELP } from "../data/gameLoop";
import { getTerritory } from "../data/map/territories";
import { RESEARCH_LIST } from "../data/research";
import { getUnit } from "../data/units";
import type { GameAction } from "../engine/actions";
import { costShortfalls } from "../engine/economy";
import { canPlaceBuilding } from "../engine/placement";
import { isUnlocked } from "../engine/research";
import type { GameState, PlayerState } from "../engine/state";
import {
  canQueueUnit,
  canQueueWorker,
  unitTrainTurns,
  workerCapForBuilding,
} from "../engine/training";
import { pulseResources } from "../ui/resourcePulse";
import { CostLabel } from "./CostLabel";
import { Drawer } from "./Drawer";
import { Sprite } from "./Sprite";

interface BaseViewProps {
  state: GameState;
  activePlayer: PlayerState;
  dispatch: (action: GameAction) => void;
  canAct: boolean;
}

const CELL_DESKTOP = 84;
const CELL_MOBILE = 52;

function useBaseCellSize(): number {
  const [cell, setCell] = useState(CELL_DESKTOP);
  useEffect(() => {
    const mq = window.matchMedia(
      "(orientation: landscape) and (max-height: 500px)",
    );
    const sync = () => setCell(mq.matches ? CELL_MOBILE : CELL_DESKTOP);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return cell;
}

export function BaseView({
  state,
  activePlayer,
  dispatch,
  canAct,
}: BaseViewProps) {
  const CELL = useBaseCellSize();
  const tid = state.selectedTerritoryId;
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );
  const [demolishId, setDemolishId] = useState<string | null>(null);
  /** Desktop hover preview cell. */
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  /**
   * Touch / click-to-preview placement (green/red ghost) — confirm with the
   * Place button instead of relying on hover.
   */
  const [pendingPlace, setPendingPlace] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** When a placed building is selected: actions menu or train list. */
  const [panelMode, setPanelMode] = useState<"actions" | "train">("actions");
  const [shortLandscape, setShortLandscape] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(
      "(orientation: landscape) and (max-height: 500px)",
    );
    const sync = () => setShortLandscape(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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
  const selectedInst =
    ts.buildings.find((b) => b.instanceId === selectedInstanceId) ?? null;
  const selectedDef = selectedInst
    ? getBuilding(selectedInst.buildingId)
    : null;
  const trainingJobsForSelected = selectedInst
    ? ts.trainingQueue.filter((j) => {
        if (j.kind === "worker") return !!selectedDef?.producesWorkers;
        if (!j.unitId || !selectedDef?.produces) return false;
        return selectedDef.produces.includes(j.unitId);
      })
    : [];

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

  const previewCell = pendingPlace ?? hover;

  const ghost = useMemo(() => {
    if (!selectedBuilding || !previewCell || !tid) return null;
    const def = getBuilding(selectedBuilding);
    const check = canPlaceBuilding(
      ts,
      tid,
      selectedBuilding,
      previewCell.x,
      previewCell.y,
      activePlayer,
    );
    return {
      ...previewCell,
      w: def.size.w,
      h: def.size.h,
      def,
      valid: check.ok,
      reason: check.ok ? null : check.reason,
    };
  }, [selectedBuilding, previewCell, tid, ts, activePlayer]);

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
    setPendingPlace(null);
  }

  function confirmPendingPlace() {
    if (!pendingPlace) return;
    placeAt(pendingPlace.x, pendingPlace.y);
  }

  const gridW = tdef.grid.cols * CELL;
  const gridH = tdef.grid.rows * CELL;

  return (
    <div className="rf-base rf-fade-in">
      {tooltip && (
        <div
          className="rf-touch-tooltip"
          role="tooltip"
          onClick={() => setTooltip(null)}
        >
          {tooltip}
        </div>
      )}
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
                  onMouseEnter={() => {
                    if (!pendingPlace) setHover({ x, y });
                  }}
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
                      setSelectedInstanceId(inst.instanceId);
                      setDemolishId(inst.instanceId);
                      setPendingPlace(null);
                      setSelectedBuilding(null);
                      setPanelMode("actions");
                      if (shortLandscape) setDrawerOpen(true);
                      return;
                    }
                    setSelectedInstanceId(null);
                    setDemolishId(null);
                    setPanelMode("actions");
                    if (!selectedBuilding) return;
                    // Touch: tap-to-preview + Confirm. Mouse: place immediately (desktop unchanged).
                    const touch =
                      typeof window !== "undefined" &&
                      window.matchMedia("(hover: none) and (pointer: coarse)")
                        .matches;
                    if (touch) {
                      setPendingPlace({ x, y });
                      setHover({ x, y });
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
          {pendingPlace && owned && selectedBuilding && (
            <div className="rf-base__place-confirm">
              <span>
                {ghost?.valid
                  ? `Place ${getBuilding(selectedBuilding).name}`
                  : ghost?.reason ?? "Invalid cell"}
              </span>
              <button
                type="button"
                className="primary"
                disabled={!canAct || !ghost?.valid}
                onClick={confirmPendingPlace}
              >
                Confirm place
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setPendingPlace(null)}
              >
                Cancel
              </button>
            </div>
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
            const tip = buildingBlurb(def);
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
                title={tip}
                onPointerDown={(e) => {
                  if (e.pointerType === "mouse") return;
                  const t = window.setTimeout(() => setTooltip(tip), 480);
                  const clear = () => {
                    window.clearTimeout(t);
                    window.removeEventListener("pointerup", clear);
                    window.removeEventListener("pointercancel", clear);
                  };
                  window.addEventListener("pointerup", clear, { once: true });
                  window.addEventListener("pointercancel", clear, {
                    once: true,
                  });
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
                  <span
                    className={`rf-base__staff-badge${
                      selectedInstanceId === inst.instanceId ? " is-active" : ""
                    }`}
                    title="Select building to assign staff"
                  >
                    {inst.workers ?? 0}/{workerCapForBuilding(inst.buildingId)}
                  </span>
                )}
                {(() => {
                  const queued = ts.trainingQueue.filter((j) => {
                    if (j.kind === "worker") return !!def.producesWorkers;
                    return !!(
                      j.unitId &&
                      def.produces?.includes(j.unitId)
                    );
                  });
                  if (!queued.length) return null;
                  const head = queued[0]!;
                  return (
                    <span className="rf-base__train-badge" title="Training queue">
                      Q{queued.length} · T-{head.turnsRemaining}
                    </span>
                  );
                })()}
                <span className="rf-base__hp">
                  {Math.ceil(inst.hp)}/{def.maxHp}
                </span>
                <span className="rf-base__name">{def.name}</span>
              </div>
            );
          })}
        </div>

        {shortLandscape && (
          <button
            type="button"
            className="ghost rf-base__drawer-toggle"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            Build · Staff · Train
          </button>
        )}
        <Drawer
          open={shortLandscape ? drawerOpen : true}
          onClose={() => setDrawerOpen(false)}
          side="right"
          inline={!shortLandscape}
          className="rf-base__catalog"
          tutorialId="base-panels"
        >
        <div className="rf-base__catalog-inner">
          {owned && selectedInst && (
            <section
              className="rf-base__staff-panel"
              title={HELP.workers}
              data-tutorial="base-desc"
            >
              <span className="rf-label">Staffing</span>
              <p>
                <strong>{getBuilding(selectedInst.buildingId).name}</strong>
              </p>
              <p className="rf-base__blurb">
                {buildingBlurb(getBuilding(selectedInst.buildingId))}
              </p>
              <p className="rf-hint">
                Free workers: {freeWorkers}. Output scales with assigned staff.
              </p>
              {(() => {
                const cap = workerCapForBuilding(selectedInst.buildingId);
                const cur = selectedInst.workers ?? 0;
                const locked =
                  !canAct || selectedInst.buildRemaining > 0;
                const setWorkers = (next: number) =>
                  dispatch({
                    type: "ASSIGN_WORKERS",
                    payload: {
                      territoryId: tid,
                      instanceId: selectedInst.instanceId,
                      workers: Math.max(0, Math.min(cap, next)),
                    },
                  });
                return (
                  <div className="rf-base__staff-control">
                    <span className="rf-label">Workers</span>
                    <div className="rf-base__stepper" role="group">
                      <button
                        type="button"
                        className="rf-base__stepper-btn"
                        disabled={locked || cur <= 0}
                        aria-label="Decrease workers"
                        onClick={() => setWorkers(cur - 1)}
                      >
                        −
                      </button>
                      <strong className="rf-base__stepper-value">
                        {cur}
                        <span className="rf-text-dim">/{cap}</span>
                      </strong>
                      <button
                        type="button"
                        className="rf-base__stepper-btn"
                        disabled={locked || cur >= cap || freeWorkers <= 0}
                        aria-label="Increase workers"
                        onClick={() => setWorkers(cur + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })()}
            </section>
          )}
          {owned && selectedInst && selectedDef && panelMode === "actions" && (
            <section className="rf-base__actions" data-tutorial="base-train">
              <span className="rf-label">Building menu</span>
              <p>
                <strong>{selectedDef.name}</strong>
                <span className="rf-text-dim">
                  {" "}
                  · Pop {ts.population} untrained
                </span>
              </p>
              <div className="rf-base__action-list">
                {isTrainingBuilding(selectedDef) &&
                  selectedInst.buildRemaining <= 0 && (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => setPanelMode("train")}
                    >
                      Train unit
                    </button>
                  )}
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    /* staffing panel already above when selected */
                  }}
                >
                  Staff / info (see above)
                </button>
                {selectedDef.id !== "command_nexus" && (
                  <button
                    type="button"
                    className="ghost"
                    disabled={!canAct}
                    onClick={() => {
                      if (demolishId === selectedInst.instanceId) {
                        dispatch({
                          type: "DEMOLISH_BUILDING",
                          payload: {
                            territoryId: tid,
                            instanceId: selectedInst.instanceId,
                          },
                        });
                        setSelectedInstanceId(null);
                        setDemolishId(null);
                      } else {
                        setDemolishId(selectedInst.instanceId);
                      }
                    }}
                  >
                    {demolishId === selectedInst.instanceId
                      ? "Confirm demolish"
                      : "Demolish"}
                  </button>
                )}
              </div>
              {trainingJobsForSelected.length > 0 && (
                <div className="rf-base__queue">
                  <span className="rf-label">Queue at this building</span>
                  <ul>
                    {trainingJobsForSelected.map((j) => {
                      let label =
                        j.kind === "worker" ? "Worker" : (j.unitId ?? "Unit");
                      if (j.unitId) {
                        try {
                          label = getUnit(j.unitId).name;
                        } catch {
                          /* */
                        }
                      }
                      return (
                        <li key={j.id}>
                          {label}×{j.count}{" "}
                          <span className="rf-text-dim">
                            T-{j.turnsRemaining}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          )}

          {owned && selectedInst && selectedDef && panelMode === "train" && (
            <section
              className="rf-base__pop"
              title={HELP.training}
              data-tutorial="base-train"
            >
              <div className="rf-base__train-head">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setPanelMode("actions")}
                >
                  ← Back
                </button>
                <span className="rf-label">Train at {selectedDef.name}</span>
              </div>
              <p className="rf-hint">
                Untrained pop: <strong>{ts.population}</strong>. Locked units
                show their research gate.
              </p>
              {selectedDef.producesWorkers && (
                <div className="rf-base__train-row">
                  {(() => {
                    const cost = {
                      energy: GAME_LOOP.training.worker.energy,
                      alloy: GAME_LOOP.training.worker.alloy,
                    };
                    const short = costShortfalls(activePlayer, cost);
                    const check = canQueueWorker(activePlayer, ts, 1);
                    const hardBlock =
                      !canAct || (check.ok === false && short.length === 0);
                    return (
                      <button
                        type="button"
                        className={`ghost${short.length ? " is-unaffordable" : ""}`}
                        disabled={hardBlock}
                        aria-disabled={!canAct || !check.ok}
                        onClick={() => {
                          if (short.length) {
                            pulseResources(short.map((s) => s.resource));
                            return;
                          }
                          if (!check.ok) return;
                          dispatch({
                            type: "TRAIN_WORKER",
                            payload: { territoryId: tid, count: 1 },
                          });
                        }}
                      >
                        <strong>Worker</strong>
                        <CostLabel
                          cost={cost}
                          shortfalls={short}
                          showNeed={short.length > 0}
                        />
                        <small>T-{GAME_LOOP.training.worker.turns}</small>
                        {hardBlock && !check.ok && (
                          <span className="rf-cost__need">{check.reason}</span>
                        )}
                      </button>
                    );
                  })()}
                </div>
              )}
              <ul className="rf-base__train-list">
                {(selectedDef.produces ?? []).map((unitId) => {
                  let u;
                  try {
                    u = getUnit(unitId);
                  } catch {
                    return null;
                  }
                  const energy = Math.ceil(
                    u.cost.energy * GAME_LOOP.training.unit.energyMult,
                  );
                  const alloy = Math.ceil(
                    (u.cost.alloy ?? 0) * GAME_LOOP.training.unit.alloyMult,
                  );
                  const cost = { energy, alloy };
                  const short = costShortfalls(activePlayer, cost);
                  const unlocked =
                    unitId === GAME_LOOP.training.basicUnitId ||
                    isUnlocked(activePlayer, unitId);
                  const check = canQueueUnit(activePlayer, ts, unitId, 1);
                  const turns = unitTrainTurns(unitId);
                  const gated = RESEARCH_LIST.find((n) =>
                    n.unlocks.includes(unitId),
                  );
                  const hardBlock =
                    !canAct ||
                    !unlocked ||
                    (check.ok === false && short.length === 0);
                  return (
                    <li key={unitId}>
                      <button
                        type="button"
                        className={short.length && unlocked ? "is-unaffordable" : undefined}
                        disabled={hardBlock}
                        aria-disabled={!canAct || !unlocked || !check.ok}
                        title={`${u.name} · HP ${u.maxHp} · Dmg ${u.damage}`}
                        onClick={() => {
                          if (!unlocked) return;
                          if (short.length) {
                            pulseResources(short.map((s) => s.resource));
                            return;
                          }
                          if (!check.ok) return;
                          dispatch({
                            type: "TRAIN_UNIT",
                            payload: {
                              territoryId: tid,
                              unitId,
                              count: 1,
                            },
                          });
                        }}
                      >
                        <Sprite id={u.sprite.id} size={32} anim="idle" />
                        <span>
                          <strong>{u.name}</strong>
                          <CostLabel
                            cost={cost}
                            shortfalls={unlocked ? short : []}
                            showNeed={unlocked && short.length > 0}
                          />
                          <small>
                            T-{turns}
                            {u.supplyCost ? ` · upkeep S${u.supplyCost}` : ""}
                            {!unlocked && gated
                              ? ` · locked: ${gated.name}`
                              : ""}
                          </small>
                          {unlocked &&
                            short.length === 0 &&
                            !check.ok && (
                              <span className="rf-cost__need">
                                {check.reason}
                              </span>
                            )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {trainingJobsForSelected.length > 0 && (
                <div className="rf-base__queue">
                  <span className="rf-label">Queue</span>
                  <ul>
                    {trainingJobsForSelected.map((j) => {
                      let label =
                        j.kind === "worker" ? "Worker" : (j.unitId ?? "Unit");
                      if (j.unitId) {
                        try {
                          label = getUnit(j.unitId).name;
                        } catch {
                          /* */
                        }
                      }
                      return (
                        <li key={j.id}>
                          {label}×{j.count}{" "}
                          <span className="rf-text-dim">
                            T-{j.turnsRemaining}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          )}

          {owned && !selectedInst && (
            <section className="rf-base__pop" data-tutorial="base-train">
              <span className="rf-label">Training</span>
              <p className="rf-hint">
                Tap a Barracks, Vehicle Factory, Airfield, Drydock, or Command
                Nexus on the grid, then choose <strong>Train unit</strong>.
                Untrained pop: <strong>{ts.population}</strong>.
              </p>
              {ts.trainingQueue.length > 0 && (
                <div className="rf-base__queue">
                  <span className="rf-label">Territory queue</span>
                  <ul>
                    {ts.trainingQueue.map((j) => {
                      let label =
                        j.kind === "worker" ? "Worker" : (j.unitId ?? "Unit");
                      if (j.unitId) {
                        try {
                          label = getUnit(j.unitId).name;
                        } catch {
                          /* */
                        }
                      }
                      return (
                        <li key={j.id}>
                          {label}×{j.count}{" "}
                          <span className="rf-text-dim">
                            T-{j.turnsRemaining}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          )}
          <span className="rf-label">Structures</span>
          {selectedBuilding && (() => {
            const def = getBuilding(selectedBuilding);
            return (
              <div className="rf-base__detail" data-tutorial="base-build-menu">
                <header>
                  <Sprite id={def.sprite.id} size={40} anim="idle" />
                  <div>
                    <strong>{def.name}</strong>
                    <small>
                      {def.size.w}×{def.size.h} · E{def.cost.energy}
                      {def.cost.alloy ? ` · A${def.cost.alloy}` : ""}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="ghost rf-base__detail-close"
                    aria-label="Close dossier"
                    onClick={() => setSelectedBuilding(null)}
                  >
                    ×
                  </button>
                </header>
                <p className="rf-base__blurb">{buildingBlurb(def)}</p>
              </div>
            );
          })()}
          <ul data-tutorial={selectedBuilding ? undefined : "base-build-menu"}>
            {catalog.map((b) => {
              const unlocked = isUnlocked(activePlayer, b.id);
              const short = costShortfalls(activePlayer, b.cost);
              const coastalBlocked =
                (b.category === "naval" || b.id.includes("coastal")) &&
                !tdef.coastal;
              const hardBlock =
                !canAct || !owned || !unlocked || coastalBlocked;
              const selected = selectedBuilding === b.id;
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    className={`${selected ? "primary" : ""}${
                      short.length && unlocked ? " is-unaffordable" : ""
                    }`.trim()}
                    disabled={hardBlock}
                    title={buildingBlurb(b)}
                    onClick={() => {
                      if (short.length) {
                        pulseResources(short.map((s) => s.resource));
                      }
                      setSelectedInstanceId(null);
                      setPanelMode("actions");
                      setSelectedBuilding((cur) =>
                        cur === b.id ? null : b.id,
                      );
                    }}
                  >
                    <Sprite id={b.sprite.id} size={36} anim="idle" />
                    <span>
                      <strong>{b.name}</strong>
                      <CostLabel
                        cost={b.cost}
                        shortfalls={unlocked ? short : []}
                        showNeed={unlocked && short.length > 0}
                      />
                      <small>
                        {b.size.w}×{b.size.h}
                        {!unlocked
                          ? " · locked"
                          : coastalBlocked
                            ? " · coastal"
                            : isTrainingBuilding(b)
                              ? " · trains"
                              : ""}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="rf-hint">
            Select a structure, then click an empty pad (on phones: tap to
            preview, then Confirm). Click a building twice to demolish (HQ
            excluded). Long-press a building for stats.
          </p>
        </div>
        </Drawer>
      </div>
    </div>
  );
}
