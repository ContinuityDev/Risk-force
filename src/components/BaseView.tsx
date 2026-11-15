import { useState } from "react";
import { BUILDING_LIST, getBuilding } from "../data/buildings";
import { getTerritory } from "../data/map/territories";
import type { GameAction } from "../engine/actions";
import { canAfford } from "../engine/economy";
import { isUnlocked } from "../engine/research";
import type { GameState, PlayerState } from "../engine/state";
import { Sprite } from "./Sprite";

interface BaseViewProps {
  state: GameState;
  activePlayer: PlayerState;
  dispatch: (action: GameAction) => void;
  canAct: boolean;
}

export function BaseView({
  state,
  activePlayer,
  dispatch,
  canAct,
}: BaseViewProps) {
  const tid = state.selectedTerritoryId;
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [demolishId, setDemolishId] = useState<string | null>(null);

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
  const catalog = BUILDING_LIST.filter((b) => b.id !== "command_nexus");

  function cellOccupied(x: number, y: number) {
    return ts.buildings.find((b) => {
      const def = getBuilding(b.buildingId);
      return (
        x >= b.x &&
        x < b.x + def.size.w &&
        y >= b.y &&
        y < b.y + def.size.h
      );
    });
  }

  function placeAt(x: number, y: number) {
    if (!canAct || !owned || !selectedBuilding) return;
    dispatch({
      type: "PLACE_BUILDING",
      payload: { territoryId: tid!, buildingId: selectedBuilding, x, y },
    });
  }

  return (
    <div className="rf-base rf-fade-in">
      <header className="rf-view-header">
        <div>
          <span className="rf-label">{tdef.continent}</span>
          <h2>{tdef.name} Base</h2>
          {!owned && <p className="rf-text-dim">Enemy-controlled sector</p>}
        </div>
        <p className="rf-text-dim">
          Local supply stock: {Math.floor(ts.supplyStock)}
        </p>
      </header>

      <div className="rf-base__layout">
        <div
          className="rf-base__grid"
          style={{
            gridTemplateColumns: `repeat(${tdef.grid.cols}, 1fr)`,
            gridTemplateRows: `repeat(${tdef.grid.rows}, 1fr)`,
          }}
        >
          {Array.from({ length: tdef.grid.rows }, (_, y) =>
            Array.from({ length: tdef.grid.cols }, (_, x) => {
              const inst = cellOccupied(x, y);
              const isOrigin =
                inst && inst.x === x && inst.y === y;
              const def = inst ? getBuilding(inst.buildingId) : null;
              return (
                <button
                  key={`${x}-${y}`}
                  type="button"
                  className={`rf-base__cell${inst ? " has-building" : ""}${
                    demolishId === inst?.instanceId ? " is-target" : ""
                  }`}
                  disabled={!canAct || !owned}
                  onClick={() => {
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
                >
                  {isOrigin && def && (
                    <div className="rf-base__placed">
                      <Sprite
                        id={def.sprite.id}
                        anim={
                          inst!.buildRemaining > 0
                            ? "working"
                            : "idle"
                        }
                        size={40}
                      />
                      {inst!.buildRemaining > 0 && (
                        <span className="rf-base__progress">
                          T-{inst!.buildRemaining}
                        </span>
                      )}
                      <span className="rf-base__hp">
                        {Math.ceil(inst!.hp)}/{def.maxHp}
                      </span>
                    </div>
                  )}
                </button>
              );
            }),
          )}
        </div>

        <aside className="rf-base__catalog">
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
                    <Sprite id={b.sprite.id} size={28} anim="none" />
                    <span>
                      <strong>{b.name}</strong>
                      <small>
                        E{b.cost.energy}
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
            Select a structure, then click an empty tile. Click a building twice
            to demolish (HQ excluded).
          </p>
        </aside>
      </div>
    </div>
  );
}
