import { useState } from "react";

interface RotateOverlayProps {
  /** Called when the user taps “Enter landscape / fullscreen”. */
  onRequestLandscape: () => void;
}

/**
 * Full-screen gate for touch devices in portrait. The game UI stays
 * unusable until the device is landscape (CSS) or the user enters a
 * fullscreen session that can lock orientation (where supported).
 * iOS Safari cannot force orientation in-browser — keep this overlay
 * and nudge Add to Home Screen for a real fullscreen PWA.
 */
export function RotateOverlay({ onRequestLandscape }: RotateOverlayProps) {
  const [hintDismissed, setHintDismissed] = useState(false);

  return (
    <div
      className="rf-rotate"
      role="dialog"
      aria-modal="true"
      aria-label="Rotate your device"
    >
      <div className="rf-rotate__card">
        <div className="rf-rotate__icon" aria-hidden>
          <svg viewBox="0 0 96 96" width="88" height="88">
            <rect
              x="30"
              y="12"
              width="36"
              height="64"
              rx="5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
            <line
              x1="42"
              y1="18"
              x2="54"
              y2="18"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M68 28c10 6 14 18 10 28-3 8-11 14-20 15"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M62 66l-4 5 7 1"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1>Rotate your device</h1>
        <p>
          Risk Force is locked to landscape. Turn your phone sideways to play.
        </p>
        <button type="button" className="primary" onClick={onRequestLandscape}>
          Enter landscape
        </button>
        <p className="rf-rotate__note">
          iOS Safari cannot force orientation in the browser — rotate manually.
        </p>
        {!hintDismissed && (
          <div className="rf-rotate__a2hs" role="note">
            <p>
              Tip: <strong>Add to Home Screen</strong> for true fullscreen
              landscape (best on iPhone).
            </p>
            <button
              type="button"
              className="ghost rf-rotate__a2hs-dismiss"
              onClick={() => setHintDismissed(true)}
              aria-label="Dismiss Add to Home Screen tip"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
