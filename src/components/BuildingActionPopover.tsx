import { type ReactNode, forwardRef } from "react";
import { getBuilding, isTrainingBuilding } from "../data/buildings";
import { GAME_LOOP } from "../data/gameLoop";
import { getUnit } from "../data/units";
import type { GameAction } from "../engine/actions";
import { costShortfalls } from "../engine/economy";
import type { GameState, PlacedBuilding, PlayerState } from "../engine/state";
import { canQueueWorker, workerCapForBuilding } from "../engine/training";
import { workerEffectForBuilding } from "../engine/workerEffects";
import { CostLabel } from "./CostLabel";

export type BuildingPopoverMode = "menu" | "train" | "workers" | "info" | "delete";

interface BuildingActionPopoverProps {
  state: GameState;
  activePlayer: PlayerState;
  territoryId: string;
  instance: PlacedBuilding;
  canAct: boolean;
  /** Viewport-fixed anchor (px). */
  left: number;
  top: number;
  mode: BuildingPopoverMode;
  onMode: (mode: BuildingPopoverMode) => void;
  onClose: () => void;
  dispatch: (action: GameAction) => void;
  /** When true, hide until anchored. */
  hidden?: boolean;
  /** Extra menu rows (e.g. War College commissions), inserted before Delete. */
  menuExtras?: ReactNode;
  /** Flow inside a sheet instead of a fixed floating popover. */
  embedded?: boolean;
}

function Icon({ name }: { name: "train" | "workers" | "info" | "delete" }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    "aria-hidden": true as const,
  };
  if (name === "train") {
    return (
      <svg {...common}>
        <path d="M3 11V5.5A2.5 2.5 0 0 1 5.5 3h5A2.5 2.5 0 0 1 13 5.5V11" />
        <path d="M2 11h12M5 13h6M6.5 8h3" />
      </svg>
    );
  }
  if (name === "workers") {
    return (
      <svg {...common}>
        <circle cx="8" cy="5" r="2.2" />
        <path d="M3.5 13c.6-2.2 2.2-3.4 4.5-3.4S11.9 10.8 12.5 13" />
      </svg>
    );
  }
  if (name === "info") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 7v4M8 5.2h.01" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3 5h10M6 5V3.8A.8.8 0 0 1 6.8 3h2.4a.8.8 0 0 1 .8.8V5M5.2 5l.5 8h4.6l.5-8" />
    </svg>
  );
}

/**
 * Styled building action popover used from the map and the territory yard.
 * Delete is always last and red, with an explicit confirm step.
 */
export const BuildingActionPopover = forwardRef<
  HTMLDivElement,
  BuildingActionPopoverProps
>(function BuildingActionPopover(
  {
    state,
    activePlayer,
    territoryId,
    instance,
    canAct,
    left,
    top,
    mode,
    onMode,
    onClose,
    dispatch,
    hidden,
    menuExtras,
    embedded = false,
  },
  ref,
) {
  let def;
  try {
    def = getBuilding(instance.buildingId);
  } catch {
    return null;
  }
  const ts = state.territories[territoryId];
  if (!ts) return null;

  const cap = workerCapForBuilding(instance.buildingId);
  const effect = workerEffectForBuilding(
    instance.buildingId,
    instance.workers ?? 0,
  );
  const assignedElsewhere = ts.buildings.reduce(
    (s, b) =>
      b.instanceId === instance.instanceId ? s : s + (b.workers ?? 0),
    0,
  );
  const freeWorkers = Math.max(0, (ts.workers ?? 0) - assignedElsewhere);
  const trainables = def.produces ?? [];

  return (
    <div
      ref={ref}
      className={`rf-bldg-pop${embedded ? " rf-bldg-pop--embedded" : ""}`}
      role="menu"
      data-testid="building-popover"
      data-tutorial="base-train"
      style={
        embedded
          ? undefined
          : {
              left,
              top,
              visibility: hidden ? "hidden" : "visible",
            }
      }
    >
      <header className="rf-bldg-pop__head">
        <div>
          <span className="rf-label">{def.category}</span>
          <strong>{def.name}</strong>
        </div>
        <button
          type="button"
          className="ghost rf-bldg-pop__close"
          onClick={onClose}
          aria-label={embedded ? "Back to buildings" : "Close building menu"}
        >
          {embedded ? "←" : "×"}
        </button>
      </header>

      {mode === "menu" && (
        <div className="rf-bldg-pop__items">
          {(isTrainingBuilding(def) || def.producesWorkers) &&
            instance.buildRemaining <= 0 && (
            <button
              type="button"
              role="menuitem"
              className="rf-bldg-pop__item"
              data-testid="building-train-btn"
              onClick={() => onMode("train")}
            >
              <Icon name="train" />
              <span>{def.producesWorkers ? "Train" : "Train unit"}</span>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="rf-bldg-pop__item"
            onClick={() => onMode("workers")}
          >
            <Icon name="workers" />
            <span>Workers</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="rf-bldg-pop__item"
            onClick={() => onMode("info")}
          >
            <Icon name="info" />
            <span>Info</span>
          </button>
          {menuExtras}
          {def.id !== "command_nexus" && (
            <button
              type="button"
              role="menuitem"
              className="rf-bldg-pop__item rf-bldg-pop__item--danger"
              data-testid="building-delete"
              onClick={() => onMode("delete")}
            >
              <Icon name="delete" />
              <span>Delete</span>
            </button>
          )}
        </div>
      )}

      {mode === "train" && (
        <div className="rf-bldg-pop__panel">
          <button
            type="button"
            className="ghost rf-bldg-pop__back"
            onClick={() => onMode("menu")}
          >
            ← Menu
          </button>
          <span className="rf-label">Queue</span>
          {def.producesWorkers &&
            (() => {
              const cost = {
                energy: GAME_LOOP.training.worker.energy,
                alloy: GAME_LOOP.training.worker.alloy,
              };
              const short = costShortfalls(activePlayer, cost);
              const check = canQueueWorker(activePlayer, ts, 1);
              const hardBlock =
                !canAct || (check.ok === false && short.length === 0);
              return (
                <ul className="rf-bldg-pop__train-list">
                  <li>
                    <button
                      type="button"
                      className="primary"
                      disabled={hardBlock}
                      data-testid="train-worker"
                      onClick={() => {
                        if (short.length || !check.ok) return;
                        dispatch({
                          type: "TRAIN_WORKER",
                          payload: { territoryId, count: 1 },
                        });
                      }}
                    >
                      Train worker
                      <CostLabel
                        cost={cost}
                        shortfalls={short}
                        showNeed={short.length > 0}
                      />
                    </button>
                  </li>
                </ul>
              );
            })()}
          {trainables.length === 0 && !def.producesWorkers && (
            <p className="rf-hint">No trainable units at this structure.</p>
          )}
          <ul className="rf-bldg-pop__train-list">
            {trainables.map((unitId) => {
              let name = unitId;
              try {
                name = getUnit(unitId).name;
              } catch {
                /* */
              }
              return (
                <li key={unitId}>
                  <button
                    type="button"
                    className="primary"
                    disabled={!canAct}
                    data-testid={`train-${unitId}`}
                    onClick={() => {
                      dispatch({
                        type: "TRAIN_UNIT",
                        payload: { territoryId, unitId, count: 1 },
                      });
                    }}
                  >
                    Train {name}
                  </button>
                </li>
              );
            })}
          </ul>
          {ts.trainingQueue.length > 0 && (
            <p className="rf-hint" data-testid="train-queue">
              Queue: {ts.trainingQueue.length} · next T-
              {ts.trainingQueue[0]!.turnsRemaining}
            </p>
          )}
        </div>
      )}

      {mode === "workers" && (
        <div className="rf-bldg-pop__panel">
          <button
            type="button"
            className="ghost rf-bldg-pop__back"
            onClick={() => onMode("menu")}
          >
            ← Menu
          </button>
          <span className="rf-label">Workers</span>
          <p className="rf-hint">Free {freeWorkers}</p>
          <div className="rf-base__stepper">
            <button
              type="button"
              className="rf-base__stepper-btn"
              disabled={!canAct || (instance.workers ?? 0) <= 0}
              onClick={() =>
                dispatch({
                  type: "ASSIGN_WORKERS",
                  payload: {
                    territoryId,
                    instanceId: instance.instanceId,
                    workers: Math.max(0, (instance.workers ?? 0) - 1),
                  },
                })
              }
            >
              −
            </button>
            <strong>
              {instance.workers ?? 0}/{cap}
            </strong>
            <button
              type="button"
              className="rf-base__stepper-btn"
              disabled={
                !canAct ||
                freeWorkers <= 0 ||
                (instance.workers ?? 0) >= cap
              }
              onClick={() =>
                dispatch({
                  type: "ASSIGN_WORKERS",
                  payload: {
                    territoryId,
                    instanceId: instance.instanceId,
                    workers: (instance.workers ?? 0) + 1,
                  },
                })
              }
            >
              +
            </button>
          </div>
          {effect && (
            <p className="rf-base__staff-effect" data-testid="worker-effect">
              {effect.label}
            </p>
          )}
        </div>
      )}

      {mode === "info" && (
        <div className="rf-bldg-pop__panel">
          <button
            type="button"
            className="ghost rf-bldg-pop__back"
            onClick={() => onMode("menu")}
          >
            ← Menu
          </button>
          <p className="rf-hint">{def.description}</p>
          <p className="rf-hint">
            HP {Math.ceil(instance.hp)}/{def.maxHp}
            {def.supplyUpkeep
              ? ` · Upkeep S${def.supplyUpkeep}`
              : ""}
          </p>
          {effect && (
            <p
              className="rf-base__staff-effect"
              data-testid="info-worker-effect"
            >
              {effect.label}
            </p>
          )}
          <p className="rf-hint rf-text-dim">
            Commander {activePlayer.displayName}
          </p>
        </div>
      )}

      {mode === "delete" && (
        <div
          className="rf-bldg-pop__panel rf-bldg-pop__confirm"
          role="alertdialog"
        >
          <p>Demolish {def.name}? Workers return to the free pool.</p>
          <div className="rf-base__delete-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => onMode("menu")}
            >
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              data-testid="building-delete-confirm"
              disabled={!canAct}
              onClick={() => {
                dispatch({
                  type: "DEMOLISH_BUILDING",
                  payload: {
                    territoryId,
                    instanceId: instance.instanceId,
                  },
                });
                onClose();
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
