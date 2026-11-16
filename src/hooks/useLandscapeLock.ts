import { useCallback, useEffect, useRef, useState } from "react";

type OrientationLockType =
  | "landscape"
  | "landscape-primary"
  | "landscape-secondary"
  | "portrait"
  | "portrait-primary"
  | "portrait-secondary"
  | "any"
  | "natural";

interface ScreenOrientationLike {
  type?: string;
  angle?: number;
  lock?: (orientation: OrientationLockType) => Promise<void>;
  unlock?: () => void;
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

/** Coarse/touch clients only — never auto-fullscreen a desktop mouse session. */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(hover: none) and (pointer: coarse)").matches ||
    (navigator.maxTouchPoints > 0 &&
      window.matchMedia("(pointer: coarse)").matches)
  );
}

async function requestFullscreenEl(el: FullscreenElement): Promise<void> {
  try {
    if (document.fullscreenElement) return;
    if (typeof el.requestFullscreen === "function") {
      await el.requestFullscreen({ navigationUI: "hide" });
      return;
    }
    if (typeof el.webkitRequestFullscreen === "function") {
      await el.webkitRequestFullscreen();
    }
  } catch {
    /* blocked / unsupported — fail silent */
  }
}

async function tryLockLandscape(): Promise<boolean> {
  try {
    const orient = (screen as Screen & { orientation?: ScreenOrientationLike })
      .orientation;
    if (!orient?.lock) return false;
    await orient.lock("landscape");
    return true;
  } catch {
    // iOS Safari rejects lock outside installed PWA / fullscreen.
    return false;
  }
}

/** Fullscreen (with webkit fallback) then landscape lock. Both may fail. */
export async function enterFullscreenAndLock(): Promise<void> {
  await requestFullscreenEl(document.documentElement as FullscreenElement);
  await tryLockLandscape();
}

function isLandscapeLocked(): boolean {
  try {
    const orient = (screen as Screen & { orientation?: ScreenOrientationLike })
      .orientation;
    return (orient?.type ?? "").startsWith("landscape");
  } catch {
    return false;
  }
}

/**
 * On touch devices: first pointerdown/touchend enters fullscreen + landscape
 * lock once per session. Re-arms after the user exits fullscreen. Desktop is
 * never auto-fullscreened.
 */
export function useLandscapeLock(): {
  isTouch: boolean;
  locked: boolean;
  requestLandscape: () => void;
} {
  const [isTouch, setIsTouch] = useState(false);
  const [locked, setLocked] = useState(false);
  const armedRef = useRef(true);
  const attemptingRef = useRef(false);

  useEffect(() => {
    setIsTouch(isTouchDevice());
  }, []);

  const runLock = useCallback(async () => {
    if (attemptingRef.current) return;
    attemptingRef.current = true;
    try {
      await enterFullscreenAndLock();
      setLocked(isLandscapeLocked());
    } finally {
      attemptingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isTouch) return;

    const onGesture = () => {
      if (!armedRef.current) return;
      armedRef.current = false;
      void runLock();
    };

    // pointerdown covers finger + stylus; touchend as extra for older WebKit.
    window.addEventListener("pointerdown", onGesture, { passive: true });
    window.addEventListener("touchend", onGesture, { passive: true });

    const onFsChange = () => {
      if (!document.fullscreenElement) {
        // User exited fullscreen — allow one more auto-attempt next gesture.
        armedRef.current = true;
        setLocked(false);
      } else {
        setLocked(isLandscapeLocked());
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange as EventListener);

    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("touchend", onGesture);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        onFsChange as EventListener,
      );
    };
  }, [isTouch, runLock]);

  const requestLandscape = useCallback(() => {
    armedRef.current = false;
    void runLock();
  }, [runLock]);

  return { isTouch, locked, requestLandscape };
}
