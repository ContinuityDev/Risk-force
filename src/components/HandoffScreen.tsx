import type { HandoffState } from "../engine/state";

interface HandoffScreenProps {
  handoff: HandoffState;
  onContinue: () => void;
}

/** Clean hot-seat pass between human commanders. */
export function HandoffScreen({ handoff, onContinue }: HandoffScreenProps) {
  return (
    <div className="rf-handoff" role="dialog" aria-label="Hot-seat handoff">
      <div className="rf-handoff__panel">
        <span className="rf-label">Theater handoff</span>
        <h2>Pass the console</h2>
        <p>
          <strong>{handoff.fromName}</strong> is done.
          <br />
          <strong>{handoff.toName}</strong> — your turn.
        </p>
        <p className="rf-text-dim">
          Shared Orbital Wire stays open for both commanders. Confirm when the
          next player is ready.
        </p>
        <button type="button" className="primary" onClick={onContinue}>
          Begin {handoff.toName}&apos;s turn
        </button>
      </div>
    </div>
  );
}
