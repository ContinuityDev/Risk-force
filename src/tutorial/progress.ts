const KEY = "risk-force-tutorial-v1";

export interface TutorialProgress {
  stepIndex: number;
  completed: boolean;
  updatedAt: number;
}

export function loadTutorialProgress(): TutorialProgress | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TutorialProgress;
  } catch {
    return null;
  }
}

export function saveTutorialProgress(p: TutorialProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* */
  }
}

export function clearTutorialProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* */
  }
}

export function hasTutorialProgress(): boolean {
  const p = loadTutorialProgress();
  return Boolean(p && !p.completed && p.stepIndex > 0);
}

export function hasCompletedTutorial(): boolean {
  const p = loadTutorialProgress();
  return Boolean(p?.completed);
}
