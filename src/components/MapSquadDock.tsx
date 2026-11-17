import { useMemo, useState } from "react";
import type { GameAction } from "../engine/actions";
import {
  currentSquadLocation,
  listPlayerSquads,
  squadStrength,
} from "../engine/squads";
import type { GameState, Squad, StrikeForceSlot } from "../engine/state";
import {
  formatUnitCount,
  territoryDisplayName,
} from "../ui/displayNames";

interface MapSquadDockProps {
  state: GameState;
  humanId: string;
  dispatch: (action: GameAction) => void;
  onFocusSquad?: (squadId: string, territoryId: string) => void;
}

function compositionSummary(force: StrikeForceSlot[]): string {
  if (!force.length) return "Empty";
  const parts = force.slice(0, 3).map((f) => formatUnitCount(f.unitId, f.count));
  if (force.length > 3) parts.push(`+${force.length - 3}`);
  return parts.join(", ");
}

function statusLabel(status: Squad["status"]): string {
  if (status === "idle") return "Idle";
  if (status === "marching") return "Marching";
  return "Engaged";
}

/** Collapsible squad list docked on the map (continent-legend pattern). */
export function MapSquadDock({
  state,
  humanId,
  dispatch,
  onFocusSquad,
}: MapSquadDockProps) {
  const [open, setOpen] = useState(true);
  const squads = useMemo(
    () => listPlayerSquads(state, humanId),
    [state.squads, humanId],
  );
  const pendingJoiners = useMemo(
    () =>
      (state.armiesInTransit ?? []).filter(
        (a) => a.owner === humanId && a.joiningSquadId,
      ),
    [state.armiesInTransit, humanId],
  );

  if (squads.length === 0 && pendingJoiners.length === 0) return null;

  return (
    <div
      className={`rf-map__squad-dock${open ? " is-open" : " is-collapsed"}`}
      data-testid="squad-dock"
    >
      <button
        type="button"
        className="rf-map__legend-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="rf-label">
          Squads · {squads.length}
          {pendingJoiners.length > 0 ? ` · +${pendingJoiners.length} joining` : ""}
        </span>
        <span className="rf-map__legend-chevron">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="rf-map__squad-dock-body">
          {pendingJoiners.length > 0 && (
            <ul className="rf-map__squad-dock-joiners" data-testid="squad-dock-joiners">
              {pendingJoiners.map((army) => {
                const squad = squads.find((s) => s.id === army.joiningSquadId);
                return (
                  <li key={army.id}>
                    <span className="rf-map__joining-tag">joining</span>{" "}
                    {compositionSummary(army.force)} → {squad?.name ?? "Squad"} ·{" "}
                    {army.turnsRemaining}t
                  </li>
                );
              })}
            </ul>
          )}
          <ul className="rf-map__squad-dock-list">
            {squads.map((squad) => {
              const locId = currentSquadLocation(state, squad);
              const active = state.selectedSquadId === squad.id;
              const transit = (state.armiesInTransit ?? []).find(
                (a) => a.squadId === squad.id,
              );
              const force = transit?.force?.length
                ? transit.force
                : squad.force;
              return (
                <li key={squad.id}>
                  <button
                    type="button"
                    className={active ? "primary" : "ghost"}
                    data-testid={`squad-dock-${squad.id}`}
                    onClick={() => {
                      dispatch({
                        type: "SELECT_SQUAD",
                        payload: { squadId: squad.id },
                      });
                      onFocusSquad?.(squad.id, locId);
                    }}
                  >
                    <strong>{squad.name}</strong>
                    <small>
                      {territoryDisplayName(locId)} ·{" "}
                      {compositionSummary(force)} · Str{" "}
                      {squadStrength(force)} · {statusLabel(squad.status)}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
