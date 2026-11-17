import { useState } from "react";
import type { GameAction } from "../engine/actions";
import type { GameState, Screen } from "../engine/state";
import { Drawer } from "./Drawer";

interface MobileDockProps {
  state: GameState;
  isHumanTurn: boolean;
  dispatch: (action: GameAction) => void;
  onMore?: () => void;
  onOpenMarket?: () => void;
  onTutorial?: () => void;
  marketOpen?: boolean;
}

const DOCK: { screen: Screen; label: string }[] = [
  { screen: "map", label: "Map" },
  { screen: "research", label: "Research" },
];

/**
 * Thumb-reachable bottom action bar for short landscape phones.
 * Map-first: Base/Squads/Army/Market live on the map or in More.
 */
export function MobileDock({
  state,
  isHumanTurn,
  dispatch,
  onOpenMarket,
  onTutorial,
}: MobileDockProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const mapActive =
    state.screen === "map" ||
    state.screen === "base" ||
    state.screen === "squads" ||
    state.screen === "invade" ||
    state.screen === "capture";

  return (
    <>
      <nav
        className="rf-dock"
        aria-label="Primary navigation"
        data-tutorial="dock"
      >
        {DOCK.map(({ screen, label }) => (
          <button
            key={screen}
            type="button"
            className={
              screen === "map"
                ? mapActive
                  ? "is-active"
                  : undefined
                : state.screen === screen
                  ? "is-active"
                  : undefined
            }
            disabled={!isHumanTurn && screen !== "map"}
            data-tutorial={`dock-${screen}`}
            onClick={() =>
              dispatch({ type: "SET_SCREEN", payload: { screen } })
            }
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="rf-dock__end primary"
          disabled={!isHumanTurn || state.phase !== "play"}
          data-tutorial="dock-end"
          onClick={() => dispatch({ type: "END_TURN" })}
        >
          End Turn
        </button>
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          data-tutorial="dock-more"
        >
          More
        </button>
      </nav>

      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} side="right">
        <span className="rf-label">Menu</span>
        <div className="rf-hud__more-list">
          {onOpenMarket && (
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onOpenMarket();
              }}
            >
              Orbital Market
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false);
              dispatch({ type: "SET_SCREEN", payload: { screen: "save" } });
            }}
          >
            Save / Load
          </button>
          {onTutorial && (
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onTutorial();
              }}
            >
              Tutorial
            </button>
          )}
        </div>
      </Drawer>
    </>
  );
}
