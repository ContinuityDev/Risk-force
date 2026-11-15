import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

/**
 * Chrome/Edge: beforeinstallprompt. iOS: Share → Add to Home Screen help.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [iosHelp, setIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const ios = isIos();

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || dismissed) return null;
  if (!deferred && !ios) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferred(null);
      return;
    }
    setIosHelp(true);
  }

  return (
    <div className="rf-install">
      <button type="button" className="primary" onClick={() => void install()}>
        Install / Add to Home Screen
      </button>
      {(iosHelp || (ios && !deferred)) && (
        <p className="rf-install__hint">
          On iPhone/iPad: tap <strong>Share</strong> →{" "}
          <strong>Add to Home Screen</strong>. Opens fullscreen landscape as a
          PWA.
        </p>
      )}
      <button
        type="button"
        className="ghost rf-install__dismiss"
        onClick={() => setDismissed(true)}
      >
        Not now
      </button>
    </div>
  );
}
