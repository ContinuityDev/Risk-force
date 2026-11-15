import type { ResourceId } from "../data/types";

type Listener = (ids: ResourceId[]) => void;

const listeners = new Set<Listener>();

export function subscribeResourcePulse(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Flash matching HUD resource chips when the player can't afford a cost. */
export function pulseResources(ids: ResourceId[]): void {
  if (!ids.length) return;
  for (const l of listeners) l(ids);
}
