import type { GameAction } from "../engine/actions";
import type { GameState, Screen } from "../engine/state";

interface MobileDockProps {
  state: GameState;
  isHumanTurn: boolean;
  dispatch: (action: GameAction) => void;
  onMore?: () => void;
}

const DOCK: { screen: Screen; label: string }[] = [
  { screen: "map", label: "Map" },
  { screen: "base", label: "Base" },
  { screen: "research", label: "Research" },
  { screen: "invade", label: "Army" },
];

/**
 * Thumb-reachable bottom action bar for short landscape phones.
 * Desktop keeps the classic HUD nav instead.
 */
export function MobileDock({
  state,
  isHumanTurn,
  dispatch,
  onMore,
}: MobileDockProps) {
  return (
    <nav className="rf-dock" aria-label="Primary navigation" data-tutorial="dock">
      {DOCK.map(({ screen, label }) => (
        <button
          key={screen}
          type="button"
          className={state.screen === screen ? "is-active" : undefined}
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
      {onMore && (
        <button type="button" className="ghost" onClick={onMore}>
          More
        </button>
      )}
    </nav>
  );
}
