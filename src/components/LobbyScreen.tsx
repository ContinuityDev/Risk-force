import { useState } from "react";
import type { DifficultyId, NewGamePayload } from "../engine/actions";

interface LobbyScreenProps {
  mode: "solo" | "hotseat" | "lan";
  onStart: (payload: NewGamePayload) => void;
  onConnect?: (address: string) => void;
  onBack: () => void;
  lanStatus?: string | null;
}

export function LobbyScreen({
  mode,
  onStart,
  onConnect,
  onBack,
  lanStatus,
}: LobbyScreenProps) {
  const [humanCount, setHumanCount] = useState(mode === "solo" ? 1 : 2);
  const [aiCount, setAiCount] = useState(mode === "solo" ? 2 : 1);
  const [names, setNames] = useState([
    "Commander",
    "Officer",
    "Captain",
    "Admiral",
  ]);
  const [address, setAddress] = useState("localhost:3847");
  const [difficulty, setDifficulty] = useState<DifficultyId>("normal");
  const [vpEnabled, setVpEnabled] = useState(false);
  const [turnLimit, setTurnLimit] = useState(40);

  const title =
    mode === "solo"
      ? "Solo Campaign"
      : mode === "hotseat"
        ? "Hot-Seat Briefing"
        : "LAN Operations";

  function updateName(i: number, value: string) {
    setNames((prev) => prev.map((n, idx) => (idx === i ? value : n)));
  }

  return (
    <div className="rf-lobby rf-fade-in">
      <header className="rf-lobby__header">
        <button type="button" className="ghost" onClick={onBack}>
          ← Menu
        </button>
        <h1>{title}</h1>
        <p className="rf-lobby__tag">Configure the theater before deployment.</p>
      </header>

      <div className="rf-lobby__grid">
        <label className="rf-field">
          <span className="rf-label">Human commanders</span>
          <input
            type="number"
            min={1}
            max={4}
            value={humanCount}
            onChange={(e) =>
              setHumanCount(
                Math.min(4, Math.max(1, Number(e.target.value) || 1)),
              )
            }
          />
        </label>
        <label className="rf-field">
          <span className="rf-label">AI factions</span>
          <input
            type="number"
            min={0}
            max={3}
            value={aiCount}
            onChange={(e) =>
              setAiCount(Math.min(3, Math.max(0, Number(e.target.value) || 0)))
            }
          />
        </label>
        <label className="rf-field">
          <span className="rf-label">Difficulty</span>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as DifficultyId)}
          >
            <option value="easy">Easy — lean AI budgets</option>
            <option value="normal">Normal</option>
            <option value="hard">Hard — richer AI + early tech</option>
          </select>
        </label>
      </div>

      <div className="rf-lobby__vp">
        <label className="rf-field rf-field--check">
          <input
            type="checkbox"
            checked={vpEnabled}
            onChange={(e) => setVpEnabled(e.target.checked)}
          />
          <span>
            Victory points race (territories, cores, continents) — default win
            remains total domination
          </span>
        </label>
        {vpEnabled && (
          <label className="rf-field">
            <span className="rf-label">Turn limit (0 = no limit)</span>
            <input
              type="number"
              min={0}
              max={200}
              value={turnLimit}
              onChange={(e) =>
                setTurnLimit(
                  Math.min(200, Math.max(0, Number(e.target.value) || 0)),
                )
              }
            />
          </label>
        )}
      </div>

      <div className="rf-lobby__names">
        <span className="rf-label">Callsigns</span>
        {Array.from({ length: humanCount }, (_, i) => (
          <input
            key={i}
            type="text"
            value={names[i] ?? `Commander ${i + 1}`}
            onChange={(e) => updateName(i, e.target.value)}
            maxLength={24}
          />
        ))}
      </div>

      {mode === "lan" && (
        <div className="rf-lobby__lan">
          <label className="rf-field">
            <span className="rf-label">Host address</span>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="192.168.1.10:3847"
            />
          </label>
          <button
            type="button"
            onClick={() => onConnect?.(address)}
            disabled={!onConnect}
          >
            Connect
          </button>
          {lanStatus && <p className="rf-lobby__status">{lanStatus}</p>}
        </div>
      )}

      <div className="rf-lobby__footer">
        <button
          type="button"
          className="primary"
          onClick={() =>
            onStart({
              humanCount,
              aiCount,
              humanNames: names.slice(0, humanCount),
              multiplayerMode: mode,
              difficulty,
              victoryPointsEnabled: vpEnabled,
              turnLimit: vpEnabled ? turnLimit : 0,
            })
          }
        >
          Start
        </button>
      </div>
    </div>
  );
}
