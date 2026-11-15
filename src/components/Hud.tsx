import { factionColor } from "../data/factions";
import type { GameAction } from "../engine/actions";
import type { GameState, PlayerState, Screen } from "../engine/state";

interface HudProps {
  state: GameState;
  activePlayer: PlayerState;
  isHumanTurn: boolean;
  dispatch: (action: GameAction) => void;
}

const NAV: { screen: Screen; label: string }[] = [
  { screen: "map", label: "Map" },
  { screen: "base", label: "Base" },
  { screen: "research", label: "Research" },
  { screen: "invade", label: "Invade" },
  { screen: "save", label: "Save" },
];

export function Hud({ state, activePlayer, isHumanTurn, dispatch }: HudProps) {
  const r = activePlayer.resources;
  const color = factionColor(activePlayer.id);

  return (
    <header className="rf-hud">
      <div className="rf-hud__identity">
        <span className="rf-label">Turn {state.turn}</span>
        <strong style={{ color }}>{activePlayer.displayName}</strong>
        {!isHumanTurn && <span className="rf-hud__ai">AI executing…</span>}
      </div>

      <div className="rf-hud__resources" aria-label="Resources">
        <span className="rf-resource rf-tick">
          <span className="rf-label">Energy</span>
          <strong>{Math.floor(r.energy)}</strong>
        </span>
        <span className="rf-resource rf-tick">
          <span className="rf-label">Alloy</span>
          <strong>{Math.floor(r.alloy)}</strong>
        </span>
        <span className="rf-resource rf-tick">
          <span className="rf-label">Research</span>
          <strong>{Math.floor(r.research)}</strong>
        </span>
        <span className="rf-resource rf-tick">
          <span className="rf-label">Supply</span>
          <strong>{Math.floor(r.supply)}</strong>
        </span>
      </div>

      <nav className="rf-hud__nav">
        {NAV.map(({ screen, label }) => (
          <button
            key={screen}
            type="button"
            className={state.screen === screen ? "primary" : "ghost"}
            disabled={!isHumanTurn && screen !== "map" && screen !== "save"}
            onClick={() =>
              dispatch({ type: "SET_SCREEN", payload: { screen } })
            }
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="primary"
          disabled={!isHumanTurn || state.phase !== "play"}
          onClick={() => dispatch({ type: "END_TURN" })}
        >
          End Turn
        </button>
      </nav>

      {state.message && (
        <div className="rf-hud__message" role="status">
          <span>{state.message}</span>
          <button
            type="button"
            className="ghost"
            onClick={() => dispatch({ type: "DISMISS_MESSAGE" })}
          >
            Dismiss
          </button>
        </div>
      )}
    </header>
  );
}
