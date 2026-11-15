import { useEffect, useState } from "react";

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

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(hover: none) and (pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0
  );
}

async function tryLockLandscape(): Promise<boolean> {
  try {
    const orient = (screen as Screen & { orientation?: ScreenOrientationLike })
      .orientation;
    if (!orient?.lock) return false;
    await orient.lock("landscape");
    return true;
  } catch {
    // iOS Safari and many browsers reject lock outside fullscreen / PWA.
    return false;
  }
}

async function enterFullscreenAndLock(): Promise<void> {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen();
    }
  } catch {
    /* fullscreen may be blocked */
  }
  await tryLockLandscape();
}

/**
 * Landscape preference for phones: attempt Screen Orientation API after the
 * first user gesture (often requires fullscreen). Returns whether the device
 * is a touch client so UI can show the portrait rotate overlay.
 */
export function useLandscapeLock(): {
  isTouch: boolean;
  locked: boolean;
  requestLandscape: () => void;
} {
  const [isTouch, setIsTouch] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    setIsTouch(isTouchDevice());
  }, []);

  useEffect(() => {
    if (!isTouch) return;
    const onFirstGesture = () => {
      void enterFullscreenAndLock().then(() => {
        const orient = (
          screen as Screen & { orientation?: ScreenOrientationLike }
        ).orientation;
        const type = orient?.type ?? "";
        setLocked(type.startsWith("landscape"));
      });
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
      window.removeEventListener("click", onFirstGesture);
    };
    window.addEventListener("pointerdown", onFirstGesture, { once: true });
    window.addEventListener("touchstart", onFirstGesture, { once: true });
    window.addEventListener("click", onFirstGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
      window.removeEventListener("click", onFirstGesture);
    };
  }, [isTouch]);

  const requestLandscape = () => {
    void enterFullscreenAndLock().then(() => {
      const orient = (screen as Screen & { orientation?: ScreenOrientationLike })
        .orientation;
      setLocked((orient?.type ?? "").startsWith("landscape"));
    });
  };

  return { isTouch, locked, requestLandscape };
}
