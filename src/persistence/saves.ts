import type { GameState } from "../engine/state";

export const SAVE_VERSION = 1;
export const SLOT_COUNT = 5;
const PREFIX = "risk-force-save-";

export interface SaveMeta {
  slot: number;
  updatedAt: number;
  turn: number;
  mode: GameState["multiplayerMode"];
  label: string;
}

export interface SaveBlob {
  meta: SaveMeta;
  state: GameState;
}

function slotKey(slot: number): string {
  return `${PREFIX}${slot}`;
}

export function listSaveSlots(): (SaveMeta | null)[] {
  const out: (SaveMeta | null)[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    out.push(readMeta(i));
  }
  return out;
}

function readMeta(slot: number): SaveMeta | null {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveBlob;
    return parsed.meta ?? null;
  } catch {
    return null;
  }
}

export function saveToSlot(slot: number, state: GameState, label?: string): SaveMeta {
  if (slot < 0 || slot >= SLOT_COUNT) throw new Error("Invalid slot");
  const meta: SaveMeta = {
    slot,
    updatedAt: Date.now(),
    turn: state.turn,
    mode: state.multiplayerMode,
    label:
      label ??
      `Turn ${state.turn} — ${state.multiplayerMode} (${Object.keys(state.players).length} factions)`,
  };
  const blob: SaveBlob = { meta, state: structuredClone(state) };
  localStorage.setItem(slotKey(slot), JSON.stringify(blob));
  return meta;
}

export function loadFromSlot(slot: number): GameState | null {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveBlob;
    if (!parsed.state || parsed.state.version !== SAVE_VERSION) return null;
    return parsed.state;
  } catch {
    return null;
  }
}

export function deleteSlot(slot: number): void {
  localStorage.removeItem(slotKey(slot));
}

/** Export full save JSON for backup / transfer. */
export function exportSaveJson(state: GameState): string {
  const blob: SaveBlob = {
    meta: {
      slot: -1,
      updatedAt: Date.now(),
      turn: state.turn,
      mode: state.multiplayerMode,
      label: "export",
    },
    state,
  };
  return JSON.stringify(blob, null, 2);
}

export function importSaveJson(json: string): GameState {
  const parsed = JSON.parse(json) as SaveBlob | GameState;
  const state = "state" in parsed && parsed.state ? parsed.state : (parsed as GameState);
  if (!state || state.version !== SAVE_VERSION) {
    throw new Error("Unsupported or corrupt save");
  }
  return state;
}
