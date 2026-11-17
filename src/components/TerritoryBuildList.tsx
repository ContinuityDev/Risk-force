import { getBuilding, isTrainingBuilding } from "../data/buildings";
import type { PlacedBuilding } from "../engine/state";
import { workerCapForBuilding } from "../engine/training";
import { Sprite } from "./Sprite";

interface TerritoryBuildListProps {
  buildings: PlacedBuilding[];
  trainingQueue: { kind: string; unitId?: string; turnsRemaining: number }[];
  onSelectBuilding: (instanceId: string) => void;
  selectedInstanceId?: string | null;
}

/** Compact building list for the map territory sheet. */
export function TerritoryBuildList({
  buildings,
  trainingQueue,
  onSelectBuilding,
  selectedInstanceId,
}: TerritoryBuildListProps) {
  if (!buildings.length) {
    return <p className="rf-hint">No structures yet.</p>;
  }

  return (
    <ul className="rf-map__build-list" data-testid="territory-buildings">
      {buildings.map((b) => {
        let def;
        try {
          def = getBuilding(b.buildingId);
        } catch {
          return null;
        }
        const queued = trainingQueue.filter((j) => {
          if (j.kind === "worker") return !!def.producesWorkers;
          return !!(j.unitId && def.produces?.includes(j.unitId));
        });
        const active = selectedInstanceId === b.instanceId;
        return (
          <li key={b.instanceId}>
            <button
              type="button"
              className={active ? "primary" : "ghost"}
              data-testid={`build-row-${b.buildingId}`}
              data-instance-id={b.instanceId}
              onClick={() => onSelectBuilding(b.instanceId)}
            >
              <Sprite id={def.sprite.id} size={28} anim="none" />
              <span className="rf-map__build-row-body">
                <strong>{def.name}</strong>
                <small>
                  {b.buildRemaining > 0
                    ? `Building · T-${b.buildRemaining}`
                    : `HP ${Math.ceil(b.hp)}/${def.maxHp}`}
                  {isTrainingBuilding(def)
                    ? ` · ${b.workers ?? 0}/${workerCapForBuilding(b.buildingId)}w`
                    : b.workers
                      ? ` · ${b.workers}/${workerCapForBuilding(b.buildingId)}w`
                      : ""}
                  {queued.length
                    ? ` · Q${queued.length} T-${queued[0]!.turnsRemaining}`
                    : ""}
                </small>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
