import { getBuilding } from "../data/buildings";
import { TERRITORIES } from "../data/map/territories";
import { getUnit } from "../data/units";
import type { GameAction } from "./actions";

function territoryLabel(id: string): string {
  return TERRITORIES.find((t) => t.id === id)?.name ?? id;
}

function forceSummary(
  force: { unitId: string; count: number }[],
): string {
  return force
    .map((s) => {
      try {
        return `${getUnit(s.unitId).name}×${s.count}`;
      } catch {
        return `${s.unitId}×${s.count}`;
      }
    })
    .join(", ");
}

/** Human-readable AI turn-log lines (what/where/ETA). */
export function describeAiAction(
  displayName: string,
  action: GameAction,
): string | null {
  switch (action.type) {
    case "PLACE_BUILDING": {
      let bName = action.payload.buildingId;
      try {
        bName = getBuilding(action.payload.buildingId).name;
      } catch {
        /* */
      }
      return `${displayName} builds ${bName} in ${territoryLabel(action.payload.territoryId)}`;
    }
    case "RESEARCH":
      return `${displayName} researches ${action.payload.nodeId.replace(/_/g, " ")}`;
    case "TRAIN_WORKER":
      return `${displayName} trains ${action.payload.count} worker(s) in ${territoryLabel(action.payload.territoryId)}`;
    case "TRAIN_UNIT": {
      let uName = action.payload.unitId;
      try {
        uName = getUnit(action.payload.unitId).name;
      } catch {
        /* */
      }
      return `${displayName} trains ${uName}×${action.payload.count} in ${territoryLabel(action.payload.territoryId)}`;
    }
    case "MOVE_GARRISON":
      return `${displayName} reinforces ${territoryLabel(action.payload.toId)} from ${territoryLabel(action.payload.fromId)} (${action.payload.unitId}×${action.payload.count})`;
    case "ORDER_MOVE": {
      const head = action.payload.force.reduce((n, s) => n + s.count, 0);
      return `${displayName} marches ${head} from ${territoryLabel(action.payload.fromId)} → ${territoryLabel(action.payload.toId)}`;
    }
    case "SET_AI_ATTACK_PLANS": {
      const axes = action.payload.plans
        .map(
          (p) =>
            `${territoryLabel(p.fromId)}→${territoryLabel(p.toId)} (${forceSummary(p.force)})`,
        )
        .join("; ");
      return `${displayName} opens ${action.payload.plans.length} front(s): ${axes}`;
    }
    case "START_INVASION": {
      const head = action.payload.force.reduce((n, s) => n + s.count, 0);
      return `${displayName} invades ${territoryLabel(action.payload.toId)} from ${territoryLabel(action.payload.fromId)} with ${head} (${forceSummary(action.payload.force)})`;
    }
    default:
      return null;
  }
}
