import { useCallback, useRef } from "react";

const DEFAULT_MS = 480;

/**
 * Long-press for touch (and click-and-hold). Desktop hover tooltips stay
 * intact; this adds a press path for the same content.
 */
export function useLongPress(
  onLongPress: () => void,
  onClear?: () => void,
  ms = DEFAULT_MS,
): {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
} {
  const timer = useRef<number | null>(null);
  const clear = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  return {
    onPointerDown: (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      clear();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        onLongPress();
      }, ms);
    },
    onPointerUp: () => {
      clear();
      onClear?.();
    },
    onPointerLeave: () => {
      clear();
      onClear?.();
    },
    onPointerCancel: () => {
      clear();
      onClear?.();
    },
    onContextMenu: (e) => {
      // Suppress the system menu so long-press can own the gesture on mobile.
      e.preventDefault();
    },
  };
}
