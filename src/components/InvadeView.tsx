import { useEffect, useMemo, useState } from "react";
import { biomeLabel } from "../data/biomes";
import { HELP } from "../data/gameLoop";
import { getTerritory, TERRITORIES } from "../data/map/territories";
import { getUnit, UNIT_LIST } from "../data/units";
import type { GameAction } from "../engine/actions";
import { stackingPreview } from "../engine/combatMods";
import { forceSupplyCost } from "../engine/economy";
import { forecastBattle } from "../engine/forecast";
import { travelTurns } from "../engine/movement";
import { findRoute } from "../engine/pathfinding";
import type { GameState, PlayerState, StrikeForceSlot } from "../engine/state";
import { CounterStrip } from "./CounterStrip";
import { PickerList } from "./PickerList";
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
  const [mode, setMode] = useState<"invade" | "reinforce">("invade");

  // Keep launch origin in sync when selection changes (map → Army, LOAD_STATE).
  useEffect(() => {
    const sel = state.selectedTerritoryId;
    if (sel && state.territories[sel]?.owner === activePlayer.id && sel !== fromId) {
      setFromId(sel);
      setToId("");
      setForce({});
    }
  }, [state.selectedTerritoryId, state.territories, activePlayer.id, fromId]);

  const fromDef = fromId ? getTerritory(fromId) : null;
  const fromTs = fromId ? state.territories[fromId] : null;
  const garrison = fromTs?.garrison ?? {};

  const targets = useMemo(() => {
    if (!fromDef) return [];
    if (mode === "reinforce") {
      // Friendly destinations reachable by multi-hop
      return TERRITORIES.filter(
        (t) =>
          t.id !== fromId &&
          state.territories[t.id]?.owner === activePlayer.id,
      ).map((t) => t.id);
    }
    return fromDef.neighbors.filter(
      (nid) => state.territories[nid]?.owner !== activePlayer.id,
    );
  }, [fromDef, state.territories, activePlayer.id, mode, fromId]);

  const slots: StrikeForceSlot[] = Object.entries(force)
    .filter(([, c]) => c > 0)
    .map(([unitId, count]) => ({ unitId, count }));

  const supplyNeed = forceSupplyCost(
    slots,
    (id) => getUnit(id).supplyCost ?? 1,
  );
  const route =
    fromId && toId && slots.length
      ? findRoute(fromId, toId, slots, {
          avoidEnemy: mode === "reinforce",
          owner: activePlayer.id,
          territories: state.territories,
        })
      : null;
  const eta =
    route?.totalTurns ??
    (fromId && toId && slots.length
      ? travelTurns(fromId, toId, slots)
      : null);
  const stack = stackingPreview(slots);
  const forecast =
    mode === "invade" && toId && slots.length
      ? forecastBattle(state, toId, slots)
      : null;

  const garrisonUnits = UNIT_LIST.filter((u) => (garrison[u.id] ?? 0) > 0);

  function setCount(unitId: string, count: number) {
    const max = garrison[unitId] ?? 0;
    setForce((prev) => ({
      ...prev,
      [unitId]: Math.max(0, Math.min(max, count)),
    }));
  }

  return (
    <div className="rf-invade rf-fade-in" data-tutorial="invade-view">
      <header className="rf-view-header">
        <div>
          <span className="rf-label">Operations</span>
          <h2>{mode === "invade" ? "Invasion Planning" : "Reinforce"}</h2>
          <p className="rf-hint" title={HELP.invasion}>
            Multi-hop marches along neighbors. Invade opens battle on arrival;
            reinforce uses the same unit picker for friendly moves.
          </p>
          <div className="rf-invade__modes">
            <button
              type="button"
              className={mode === "invade" ? "primary" : "ghost"}
              onClick={() => {
                setMode("invade");
                setToId("");
              }}
            >
              Invade
            </button>
            <button
              type="button"
              className={mode === "reinforce" ? "primary" : "ghost"}
              onClick={() => {
                setMode("reinforce");
                setToId("");
              }}
            >
              Reinforce
            </button>
          </div>
        </div>
        <p className="rf-resource">
          <span className="rf-label">Supply</span>
          <strong>
            {Math.floor(activePlayer.resources.supply)} / need{" "}
            {mode === "invade" ? supplyNeed : 0}
          </strong>
        </p>
      </header>

      <div className="rf-invade__row">
        <PickerList
          label="Launch from"
          value={fromId}
          onChange={(id) => {
            setFromId(id);
            setToId("");
            setForce({});
            dispatch({
              type: "SELECT_TERRITORY",
              payload: { territoryId: id },
            });
          }}
          options={owned.map((t) => {
            const g = Object.values(
              state.territories[t.id]?.garrison ?? {},
            ).reduce((a, b) => a + b, 0);
            return {
              id: t.id,
              label: t.name,
              meta: `Garrison ${g}`,
            };
          })}
        />
        <PickerList
          label={
            mode === "invade"
              ? "Target (adjacent enemy)"
              : "Friendly destination"
          }
          value={toId}
          onChange={(id) => {
            setToId(id);
            if (fromId && slots.length) {
              const r = findRoute(fromId, id, slots);
              dispatch({
                type: "SET_PLANNED_ROUTE",
                payload: { path: r?.path ?? null },
              });
            }
          }}
          emptyText={
            mode === "invade"
              ? "No adjacent enemies from this launch point"
              : "No other friendly territories"
          }
          options={targets.map((nid) => ({
            id: nid,
            label: getTerritory(nid).name,
            meta:
              mode === "invade"
                ? `${biomeLabel(nid)} · ${state.territories[nid]?.owner ?? "neutral"}`
                : biomeLabel(nid),
          }))}
        />
      </div>

      <section className="rf-invade__force">
        <span className="rf-label">Assemble strike force from local garrison</span>
        {garrisonUnits.length === 0 && (
          <p className="rf-hint">No units stationed here — train them in Base.</p>
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
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="rf-invade__footer">
        {slots.length > 0 && (
          <div className="rf-invade__forecast">
            <p>
              Frontage {stack.count}/{stack.cap}
              {stack.overstack > 0
                ? ` · −${Math.round((1 - stack.efficiency) * 100)}% eff`
                : " · full efficiency"}
              {route ? ` · ${route.path.length - 1} hops` : ""}
            </p>
            {forecast && (
              <p>
                Win odds{" "}
                <strong>{Math.round(forecast.winChance * 100)}%</strong>
                {" · "}Exp. losses ~{forecast.expectedAttackerLosses}
              </p>
            )}
          </div>
        )}
        <button
          type="button"
          className="primary"
          disabled={
            !canAct ||
            !fromId ||
            !toId ||
            slots.length === 0 ||
            (mode === "invade" &&
              activePlayer.resources.supply < supplyNeed) ||
            (mode === "reinforce" && !route)
          }
          onClick={() => {
            if (mode === "reinforce" && route) {
              dispatch({
                type: "ORDER_ROUTE",
                payload: {
                  fromId,
                  toId,
                  force: slots,
                  path: route.path,
                },
              });
            } else {
              dispatch({
                type: "START_INVASION",
                payload: { fromId, toId, force: slots },
              });
            }
          }}
        >
          {mode === "invade" ? "Launch Invasion" : "March Reinforcements"}
          {eta != null ? ` · ${eta} turn${eta === 1 ? "" : "s"}` : ""}
        </button>
      </footer>
    </div>
  );
}
