import { RESEARCH_LIST } from "../data/research";
import type { GameAction } from "../engine/actions";
import {
  canResearch,
  hasResearched,
  researchByBranch,
} from "../engine/research";
import type { PlayerState } from "../engine/state";

interface ResearchViewProps {
  activePlayer: PlayerState;
  dispatch: (action: GameAction) => void;
  canAct: boolean;
}

const BRANCH_LABELS: Record<string, string> = {
  infantry: "Infantry",
  armor: "Armor",
  air: "Air",
  energy_weapons: "Energy Weapons",
  defenses: "Defenses",
  naval: "Naval",
  orbital: "Orbital",
  cyber: "Cyber",
  economy: "Economy",
  logistics: "Logistics",
};

export function ResearchView({
  activePlayer,
  dispatch,
  canAct,
}: ResearchViewProps) {
  const branches = researchByBranch();
  const branchOrder = Object.keys(branches).sort(
    (a, b) =>
      (BRANCH_LABELS[a] ?? a).localeCompare(BRANCH_LABELS[b] ?? b),
  );

  return (
    <div className="rf-research rf-fade-in">
      <header className="rf-view-header">
        <div>
          <span className="rf-label">Doctrine</span>
          <h2>Research Tree</h2>
        </div>
        <p className="rf-resource">
          <span className="rf-label">Available</span>
          <strong>{Math.floor(activePlayer.resources.research)}</strong>
        </p>
      </header>

      <div className="rf-research__branches">
        {branchOrder.map((branch) => (
          <section key={branch} className="rf-research__branch">
            <h3>{BRANCH_LABELS[branch] ?? branch}</h3>
            <ul>
              {(branches[branch] ?? []).map((node) => {
                const done = hasResearched(activePlayer, node.id);
                const ready = canResearch(activePlayer, node.id);
                const prereqFail = node.prerequisites.some(
                  (p) => !hasResearched(activePlayer, p),
                );
                let status = "Locked";
                if (done) status = "Complete";
                else if (ready) status = "Ready";
                else if (prereqFail) status = "Prerequisites";
                else status = "Insufficient";

                return (
                  <li key={node.id}>
                    <button
                      type="button"
                      className={
                        done
                          ? "is-done"
                          : ready
                            ? "primary"
                            : undefined
                      }
                      disabled={!canAct || !ready}
                      onClick={() =>
                        dispatch({
                          type: "RESEARCH",
                          payload: { nodeId: node.id },
                        })
                      }
                      title={node.description}
                    >
                      <span className="rf-research__name">{node.name}</span>
                      <span className="rf-research__meta">
                        <span>{node.cost} R</span>
                        <span className="rf-label">{status}</span>
                      </span>
                      {node.unlocks.length > 0 && (
                        <span className="rf-research__unlocks">
                          Unlocks {node.unlocks.length} asset
                          {node.unlocks.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {RESEARCH_LIST.length === 0 && (
        <p className="rf-empty">No research nodes available.</p>
      )}
    </div>
  );
}
