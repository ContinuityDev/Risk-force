import type { GameState } from "../engine/state";
import { SAVE_VERSION } from "./saves";

const SESSION_KEY = "risk-force-session-v1";

export interface SessionBlob {
  updatedAt: number;
  state: GameState;
}

/** Autosave for resume after backgrounding / tab close (localStorage). */
export function saveSession(state: GameState): void {
  if (typeof localStorage === "undefined") return;
  if (state.screen === "menu" || state.screen === "lobby") return;
  if (state.phase === "ended") {
    clearSession();
    return;
  }
  try {
    const blob: SessionBlob = {
      updatedAt: Date.now(),
      state: structuredClone(state),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(blob));
  } catch {
    // Quota / private mode — ignore; manual slots still work.
  }
}

export function loadSession(): SessionBlob | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionBlob;
    if (!parsed?.state || parsed.state.version !== SAVE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* */
  }
}

export function hasSession(): boolean {
  return loadSession() != null;
}
