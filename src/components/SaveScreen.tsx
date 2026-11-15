import { useRef, useState } from "react";
import type { GameAction } from "../engine/actions";
import type { GameState } from "../engine/state";
import {
  deleteSlot,
  exportSaveJson,
  importSaveJson,
  listSaveSlots,
  loadFromSlot,
  saveToSlot,
  SLOT_COUNT,
  type SaveMeta,
} from "../persistence/saves";

interface SaveScreenProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
  onLoaded?: () => void;
  menuMode?: boolean;
}

export function SaveScreen({
  state,
  dispatch,
  onLoaded,
  menuMode = false,
}: SaveScreenProps) {
  const [slots, setSlots] = useState<(SaveMeta | null)[]>(() => listSaveSlots());
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function refresh() {
    setSlots(listSaveSlots());
  }

  function handleSave(slot: number) {
    try {
      saveToSlot(slot, state);
      setError(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  function handleLoad(slot: number) {
    const loaded = loadFromSlot(slot);
    if (!loaded) {
      setError("Empty or corrupt slot");
      return;
    }
    dispatch({ type: "LOAD_STATE", payload: { state: loaded } });
    setError(null);
    onLoaded?.();
  }

  function handleDelete(slot: number) {
    deleteSlot(slot);
    refresh();
  }

  function handleExport() {
    const json = exportSaveJson(state);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `risk-force-turn-${state.turn}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = importSaveJson(String(reader.result ?? ""));
        dispatch({ type: "LOAD_STATE", payload: { state: imported } });
        setError(null);
        onLoaded?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="rf-save rf-fade-in">
      <header className="rf-view-header">
        <div>
          <span className="rf-label">Persistence</span>
          <h2>{menuMode ? "Load Campaign" : "Save / Load"}</h2>
        </div>
        <div className="rf-save__io">
          {!menuMode && (
            <button type="button" onClick={handleExport}>
              Export JSON
            </button>
          )}
          <button type="button" onClick={() => fileRef.current?.click()}>
            Import File
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <ul className="rf-save__slots">
        {Array.from({ length: SLOT_COUNT }, (_, i) => {
          const meta = slots[i];
          return (
            <li key={i}>
              <div>
                <strong>Slot {i + 1}</strong>
                {meta ? (
                  <p>
                    {meta.label}
                    <br />
                    <span className="rf-text-dim">
                      {new Date(meta.updatedAt).toLocaleString()}
                    </span>
                  </p>
                ) : (
                  <p className="rf-text-dim">Empty</p>
                )}
              </div>
              <div className="rf-save__actions">
                {!menuMode && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => handleSave(i)}
                  >
                    Save
                  </button>
                )}
                <button
                  type="button"
                  disabled={!meta}
                  onClick={() => handleLoad(i)}
                >
                  Load
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={!meta}
                  onClick={() => handleDelete(i)}
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p className="rf-save__error">{error}</p>}
    </div>
  );
}
