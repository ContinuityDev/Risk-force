import type { GameAction } from "../engine/actions";
import type { GameState } from "../engine/state";

interface EconomySummaryProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

export function EconomySummary({ state, dispatch }: EconomySummaryProps) {
  const summary = state.economySummary;
  if (!summary) return null;
  return (
    <div className="rf-economy-summary" role="dialog" aria-label="Your economy">
      <header>
        <span className="rf-label">Turn {summary.turn}</span>
        <h3>Your economy</h3>
      </header>
      <p>
        Income E{summary.income.energy} / A{summary.income.alloy} / S
        {summary.income.supply} / R{summary.income.research}
      </p>
      <p>
        Upkeep {summary.upkeep} · Net{" "}
        <strong className={summary.net < 0 ? "is-neg" : undefined}>
          {summary.net >= 0 ? "+" : ""}
          {summary.net}
        </strong>
      </p>
      {summary.finishedBuildings.length > 0 && (
        <p className="rf-hint">
          Built: {summary.finishedBuildings.join(", ")}
        </p>
      )}
      {summary.finishedTraining.length > 0 && (
        <p className="rf-hint">
          Trained: {summary.finishedTraining.join(", ")}
        </p>
      )}
      {summary.finishedResearch.length > 0 && (
        <p className="rf-hint">
          Researched: {summary.finishedResearch.join(", ")}
        </p>
      )}
      <button
        type="button"
        className="primary"
        onClick={() => dispatch({ type: "DISMISS_ECONOMY_SUMMARY" })}
      >
        Continue
      </button>
    </div>
  );
}
