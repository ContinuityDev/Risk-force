import { useEffect, useMemo, useState } from "react";
import { biomeLabel } from "../data/biomes";
import { BUILDING_LIST } from "../data/buildings";
import { getTerritory, TERRITORIES } from "../data/map/territories";
import { getUnit, UNIT_LIST } from "../data/units";
import type { GameAction } from "../engine/actions";
import { stackingPreview } from "../engine/combatMods";
import { forceSupplyCost } from "../engine/economy";
import { forecastBattle } from "../engine/forecast";
import { travelTurns } from "../engine/movement";
import type { GameState, PlayerState, StrikeForceSlot } from "../engine/state";
import { CounterStrip } from "./CounterStrip";
import { Sprite } from "./Sprite";

function garrisonCount(g: Record<string, number>): number {
  return Object.values(g).reduce((a, b) => a + b, 0);
}

function defensePreview(state: GameState, tid: string): {
  troops: number;
  defense: number;
} {
  const ts = state.territories[tid];
  if (!ts) return { troops: 0, defense: 0 };
  let defense = garrisonCount(ts.garrison) * 2;
  for (const b of ts.buildings) {
    if (b.buildRemaining > 0) continue;
    const d = BUILDING_LIST.find((x) => x.id === b.buildingId);
    if (!d) continue;
    if (d.damage) defense += 3;
    else if (d.category === "defense") defense += 1.5;
    else if (d.category === "command") defense += 2;
  }
  return { troops: garrisonCount(ts.garrison), defense: Math.round(defense) };
}

export interface InvadeOriginPlan {
  fromId: string;
  force: StrikeForceSlot[];
}

interface InvadeFromPanelProps {
  state: GameState;
  activePlayer: PlayerState;
  targetId: string;
  canAct: boolean;
  dispatch: (action: GameAction) => void;
  onCancel: () => void;
  onPlansChange?: (plans: InvadeOriginPlan[]) => void;
}

export function InvadeFromPanel({
  state,
  activePlayer,
  targetId,
  canAct,
  dispatch,
  onCancel,
  onPlansChange,
}: InvadeFromPanelProps) {
  const target = getTerritory(targetId);
  const preview = defensePreview(state, targetId);

  const origins = useMemo(() => {
    return TERRITORIES.filter((t) => {
      if (state.territories[t.id]?.owner !== activePlayer.id) return false;
      if (!t.neighbors.includes(targetId)) return false;
      return garrisonCount(state.territories[t.id]?.garrison ?? {}) > 0;
    }).sort((a, b) => {
      const ga = garrisonCount(state.territories[a.id]?.garrison ?? {});
      const gb = garrisonCount(state.territories[b.id]?.garrison ?? {});
      return gb - ga;
    });
  }, [state.territories, activePlayer.id, targetId]);

  const [selected, setSelected] = useState<Set<string>>(() =>
    new Set(origins[0] ? [origins[0].id] : []),
  );
  /** Expanded origin shows full unit steppers; keep collapsed by default on short panels. */
  const [editForce, setEditForce] = useState<string | null>(null);
  const [forces, setForces] = useState<Record<string, Record<string, number>>>(
    () => {
      const init: Record<string, Record<string, number>> = {};
      for (const o of origins) {
        const g = state.territories[o.id]?.garrison ?? {};
        const force: Record<string, number> = {};
        for (const [uid, c] of Object.entries(g)) {
          if (c > 0) force[uid] = Math.max(1, Math.floor(c / 2));
        }
        init[o.id] = force;
      }
      return init;
    },
  );

  const plans: InvadeOriginPlan[] = useMemo(() => {
    const out: InvadeOriginPlan[] = [];
    for (const fromId of selected) {
      const force = Object.entries(forces[fromId] ?? {})
        .filter(([, c]) => c > 0)
        .map(([unitId, count]) => ({ unitId, count }));
      if (force.length) out.push({ fromId, force });
    }
    return out;
  }, [selected, forces]);

  useEffect(() => {
    onPlansChange?.(plans);
  }, [plans, onPlansChange]);

  const totalSupply = plans.reduce(
    (s, p) =>
      s + forceSupplyCost(p.force, (id) => getUnit(id).supplyCost ?? 1),
    0,
  );

  const combinedForce: StrikeForceSlot[] = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of plans) {
      for (const s of p.force) {
        map[s.unitId] = (map[s.unitId] ?? 0) + s.count;
      }
    }
    return Object.entries(map).map(([unitId, count]) => ({ unitId, count }));
  }, [plans]);

  const stack = stackingPreview(combinedForce);
  const forecast = useMemo(
    () => forecastBattle(state, targetId, combinedForce),
    [state, targetId, combinedForce],
  );

  function toggleOrigin(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setCount(fromId: string, unitId: string, count: number) {
    const max = state.territories[fromId]?.garrison[unitId] ?? 0;
    setForces((prev) => ({
      ...prev,
      [fromId]: {
        ...(prev[fromId] ?? {}),
        [unitId]: Math.max(0, Math.min(max, count)),
      },
    }));
  }

  function confirm() {
    for (const plan of plans) {
      dispatch({
        type: "START_INVASION",
        payload: {
          fromId: plan.fromId,
          toId: targetId,
          force: plan.force,
        },
      });
    }
    onCancel();
  }

  return (
    <div className="rf-invade-from" data-tutorial="invade-from">
      <header className="rf-invade-from__head">
        <div>
          <span className="rf-label">Invade</span>
          <h3>{target.name}</h3>
          <p className="rf-hint">
            Gar {preview.troops} · Def {preview.defense} ·{" "}
            {biomeLabel(targetId)} ·{" "}
            {state.territories[targetId]?.owner ?? "neutral"}
          </p>
        </div>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </header>

      {combinedForce.length > 0 && (
        <div className="rf-invade-from__forecast">
          <p>
            Win odds{" "}
            <strong>{Math.round(forecast.winChance * 100)}%</strong>
            {" · "}
            Exp. losses ~{forecast.expectedAttackerLosses} / enemy ~
            {forecast.expectedDefenderLosses}
          </p>
          <p className="rf-hint">
            Frontage {stack.count}/{stack.cap}
            {stack.overstack > 0
              ? ` · overstack −${Math.round((1 - stack.efficiency) * 100)}% eff`
              : " · full efficiency"}
          </p>
          <div className="rf-invade-from__counters">
            {combinedForce.slice(0, 3).map((s) => (
              <div key={s.unitId}>
                <small>{getUnit(s.unitId).name}</small>
                <CounterStrip unitId={s.unitId} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rf-invade-from__body">
        <span className="rf-label">Invade from</span>
        {origins.length === 0 && (
          <p className="rf-hint">
            No bordering territories with units. March troops closer first.
          </p>
        )}
        <ul className="rf-invade-from__origins">
          {origins.map((o) => {
            const g = state.territories[o.id]?.garrison ?? {};
            const forceSlots = Object.entries(forces[o.id] ?? {})
              .filter(([, c]) => c > 0)
              .map(([unitId, count]) => ({ unitId, count }));
            const eta =
              forceSlots.length > 0
                ? travelTurns(o.id, targetId, forceSlots)
                : travelTurns(
                    o.id,
                    targetId,
                    Object.entries(g)
                      .filter(([, c]) => c > 0)
                      .map(([unitId, count]) => ({ unitId, count })),
                  );
            const active = selected.has(o.id);
            const units = UNIT_LIST.filter((u) => (g[u.id] ?? 0) > 0);
            return (
              <li
                key={o.id}
                className={active ? "is-active" : undefined}
              >
                <button
                  type="button"
                  className={active ? "primary" : "ghost"}
                  onClick={() => toggleOrigin(o.id)}
                >
                  <strong>{o.name}</strong>
                  <small>
                    {garrisonCount(g)} units · {eta} turn
                    {eta === 1 ? "" : "s"} travel
                  </small>
                </button>
                <div className="rf-invade-from__minis">
                  {units.map((u) => {
                    const cur = forces[o.id]?.[u.id] ?? 0;
                    return (
                      <span
                        key={u.id}
                        className="rf-invade-from__chip"
                        title={`${u.name}: send ${cur}/${g[u.id]}`}
                      >
                        <Sprite id={u.sprite.id} size={20} anim="none" />
                        <em>
                          {active ? cur : g[u.id]}
                          {active ? `/${g[u.id]}` : ""}
                        </em>
                      </span>
                    );
                  })}
                </div>
                {active && (
                  <div className="rf-invade-from__adjust">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        setEditForce((prev) =>
                          prev === o.id ? null : o.id,
                        )
                      }
                    >
                      {editForce === o.id ? "Hide units" : "Adjust units"}
                    </button>
                  </div>
                )}
                {active && editForce === o.id && (
                  <ul className="rf-invade-from__force">
                    {units.map((u) => {
                      const reserve = g[u.id] ?? 0;
                      const cur = forces[o.id]?.[u.id] ?? 0;
                      return (
                        <li key={u.id}>
                          <Sprite id={u.sprite.id} size={24} anim="none" />
                          <div>
                            <strong>{u.name}</strong>
                            <small>
                              Avail {reserve} · Spd {u.speed}
                            </small>
                            <CounterStrip unitId={u.id} />
                          </div>
                          <div className="rf-invade__stepper">
                            <button
                              type="button"
                              disabled={!canAct || cur <= 0}
                              onClick={() => setCount(o.id, u.id, cur - 1)}
                            >
                              −
                            </button>
                            <strong>{cur}</strong>
                            <button
                              type="button"
                              disabled={!canAct || cur >= reserve}
                              onClick={() => setCount(o.id, u.id, cur + 1)}
                            >
                              +
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="rf-invade-from__footer">
        <p className="rf-resource">
          <span className="rf-label">Supply</span>
          <strong>
            {Math.floor(activePlayer.resources.supply)} / need {totalSupply}
          </strong>
        </p>
        <button
          type="button"
          className="primary"
          disabled={
            !canAct ||
            plans.length === 0 ||
            activePlayer.resources.supply < totalSupply
          }
          onClick={confirm}
        >
          Confirm invasion
          {plans.length > 1 ? ` (${plans.length} fronts)` : ""}
        </button>
      </footer>
    </div>
  );
}
