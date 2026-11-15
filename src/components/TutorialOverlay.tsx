import { useEffect, useLayoutEffect, useState } from "react";
import type { GameAction } from "../engine/actions";
import type { GameState } from "../engine/state";
import { saveTutorialProgress } from "../tutorial/progress";
import { TUTORIAL_STEPS } from "../tutorial/steps";

interface TutorialOverlayProps {
  stepIndex: number;
  state: GameState;
  dispatch: (action: GameAction) => void;
  onStep: (index: number) => void;
  onClose: (completed: boolean) => void;
}

export function TutorialOverlay({
  stepIndex,
  state,
  dispatch,
  onStep,
  onClose,
}: TutorialOverlayProps) {
  const step = TUTORIAL_STEPS[stepIndex] ?? TUTORIAL_STEPS[0]!;
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Navigate / select as needed for the step
  useEffect(() => {
    if (step.screen && state.screen !== step.screen) {
      dispatch({ type: "SET_SCREEN", payload: { screen: step.screen } });
    }
    if (step.needSelection && !state.selectedTerritoryId) {
      const owned = Object.entries(state.territories).find(
        ([, t]) => t.owner === "player",
      );
      if (owned) {
        dispatch({
          type: "SELECT_TERRITORY",
          payload: { territoryId: owned[0] },
        });
      }
    }
  }, [step, state.screen, state.selectedTerritoryId, state.territories, dispatch]);

  useLayoutEffect(() => {
    const measure = () => {
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(`[data-tutorial="${step.target}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      setRect(el.getBoundingClientRect());
    };
    measure();
    const t = window.setInterval(measure, 400);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("resize", measure);
    };
  }, [step, state.screen, state.selectedTerritoryId]);

  useEffect(() => {
    saveTutorialProgress({
      stepIndex,
      completed: false,
      updatedAt: Date.now(),
    });
  }, [stepIndex]);

  function finish(completed: boolean) {
    if (completed) {
      saveTutorialProgress({
        stepIndex: TUTORIAL_STEPS.length - 1,
        completed: true,
        updatedAt: Date.now(),
      });
    } else {
      // Skip keeps progress so "Resume Tutorial" can continue later.
      saveTutorialProgress({
        stepIndex,
        completed: false,
        updatedAt: Date.now(),
      });
    }
    onClose(completed);
  }

  const pad = 6;
  const spotlight = rect
    ? {
        left: Math.max(0, rect.left - pad),
        top: Math.max(0, rect.top - pad),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  const isLast = stepIndex >= TUTORIAL_STEPS.length - 1;

  return (
    <div className="rf-tutorial" role="dialog" aria-modal="true" aria-label="Tutorial">
      <div className="rf-tutorial__shade" aria-hidden>
        {spotlight && (
          <div
            className="rf-tutorial__hole"
            style={{
              left: spotlight.left,
              top: spotlight.top,
              width: spotlight.width,
              height: spotlight.height,
            }}
          />
        )}
      </div>

      <div
        className={`rf-tutorial__card${spotlight ? " has-target" : ""}`}
        style={
          spotlight
            ? {
                // Prefer below target; flip above if near bottom
                top:
                  spotlight.top + spotlight.height + 10 < window.innerHeight - 120
                    ? spotlight.top + spotlight.height + 8
                    : Math.max(8, spotlight.top - 118),
                left: Math.min(
                  Math.max(8, spotlight.left),
                  window.innerWidth - 280,
                ),
              }
            : undefined
        }
      >
        <div className="rf-tutorial__progress">
          Step {stepIndex + 1} / {TUTORIAL_STEPS.length}
        </div>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="rf-tutorial__actions">
          <button
            type="button"
            className="ghost"
            disabled={stepIndex <= 0}
            onClick={() => onStep(Math.max(0, stepIndex - 1))}
          >
            Back
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => finish(false)}
          >
            Skip
          </button>
          {isLast ? (
            <button
              type="button"
              className="primary"
              onClick={() => finish(true)}
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() =>
                onStep(Math.min(TUTORIAL_STEPS.length - 1, stepIndex + 1))
              }
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
