import { BUILDING_LIST } from "../data/buildings";
import { getTerritory } from "../data/map/territories";
import type { GameAction } from "../engine/actions";
import { costShortfalls } from "../engine/economy";
import { findFreeBuildingCell } from "../engine/placement";
import { isUnlocked } from "../engine/research";
import type { PlayerState, TerritoryState } from "../engine/state";
import { CostLabel } from "./CostLabel";
import { Sprite } from "./Sprite";

interface TerritoryBuildCatalogProps {
  territoryId: string;
  territory: TerritoryState;
  activePlayer: PlayerState;
  canAct: boolean;
  dispatch: (action: GameAction) => void;
}

/**
 * Constructible building list for the map-first right dock — replaces the
 * removed Base-tab build catalog so owned territories can still place.
 */
export function TerritoryBuildCatalog({
  territoryId,
  territory,
  activePlayer,
  canAct,
  dispatch,
}: TerritoryBuildCatalogProps) {
  const tdef = getTerritory(territoryId);
  const hasNexus = territory.buildings.some(
    (b) => b.buildingId === "command_nexus",
  );
  const catalog = BUILDING_LIST.filter(
    (b) => b.id !== "command_nexus" || !hasNexus,
  );

  return (
    <section
      className="rf-map__sheet-build-catalog"
      data-testid="territory-build-catalog"
    >
      <span className="rf-label">Construct</span>
      <ul className="rf-map__build-catalog-list">
        {catalog.map((b) => {
          const unlocked =
            b.id === "command_nexus" || isUnlocked(activePlayer, b.id);
          const short = costShortfalls(activePlayer, b.cost);
          const coastalBlocked =
            (b.category === "naval" || b.id.includes("coastal")) &&
            !tdef.coastal;
          const slot = findFreeBuildingCell(
            territory,
            territoryId,
            b.id,
            activePlayer,
          );
          const hardBlock =
            !canAct || !unlocked || coastalBlocked || !slot;
          return (
            <li key={b.id}>
              <button
                type="button"
                className={
                  short.length && unlocked ? "is-unaffordable" : undefined
                }
                data-testid={`build-${b.id}`}
                disabled={hardBlock}
                onClick={() => {
                  if (hardBlock || short.length || !slot) return;
                  dispatch({
                    type: "PLACE_BUILDING",
                    payload: {
                      territoryId,
                      buildingId: b.id,
                      x: slot.x,
                      y: slot.y,
                    },
                  });
                }}
              >
                <Sprite id={b.sprite.id} size={28} anim="idle" />
                <span>
                  <strong>{b.name}</strong>
                  <CostLabel
                    cost={b.cost}
                    shortfalls={unlocked ? short : []}
                    showNeed={unlocked && short.length > 0}
                  />
                  <small>
                    {!unlocked
                      ? "locked"
                      : coastalBlocked
                        ? "coastal only"
                        : !slot
                          ? "yard full"
                          : `${b.size.w}×${b.size.h}`}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
