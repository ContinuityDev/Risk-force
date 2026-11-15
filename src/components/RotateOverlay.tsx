interface RotateOverlayProps {
  /** Called when the user taps “Enter landscape / fullscreen”. */
  onRequestLandscape: () => void;
}

/**
 * Full-screen gate for touch devices in portrait. The game UI stays
 * unusable until the device is landscape (CSS) or the user enters a
 * fullscreen session that can lock orientation (where supported).
 */
export function RotateOverlay({ onRequestLandscape }: RotateOverlayProps) {
  return (
    <div
      className="rf-rotate"
      role="dialog"
      aria-modal="true"
      aria-label="Rotate your device"
    >
      <div className="rf-rotate__card">
        <div className="rf-rotate__icon" aria-hidden>
          <svg viewBox="0 0 96 64" width="96" height="64">
            <rect
              x="28"
              y="4"
              width="40"
              height="56"
              rx="6"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              d="M18 32h-8M86 32h-8M12 24l-6 8 6 8M84 24l6 8-6 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
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
          iOS Safari cannot force orientation in the browser — rotate manually,
          or install the app to the home screen for a landscape PWA.
        </p>
      </div>
    </div>
  );
}
