import { useState } from "react";
import { DOCTRINE_LIST, type DoctrineId } from "../data/doctrines";
import type { DifficultyId, NewGamePayload } from "../engine/actions";

interface LobbyScreenProps {
  mode: "solo" | "hotseat" | "lan";
  onStart: (payload: NewGamePayload) => void;
  onConnect?: (address: string) => void;
  onBack: () => void;
  lanStatus?: string | null;
}

const DIFFICULTY_OPTIONS: { id: DifficultyId; label: string; hint: string }[] = [
  { id: "easy", label: "Easy", hint: "Lean AI budgets" },
  { id: "normal", label: "Normal", hint: "Standard" },
  { id: "hard", label: "Hard", hint: "Richer AI + early tech" },
];

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
  const [doctrineId, setDoctrineId] = useState<DoctrineId>("vanguard");
  const [humanDoctrines, setHumanDoctrines] = useState<DoctrineId[]>([
    "vanguard",
    "ironclad",
    "skyborne",
    "spectre",
  ]);

  const title =
    mode === "solo"
      ? "Solo Campaign"
      : mode === "hotseat"
        ? "Hot-Seat Briefing"
        : "LAN Operations";

  function updateName(i: number, value: string) {
    setNames((prev) => prev.map((n, idx) => (idx === i ? value : n)));
  }

  function bump(setter: (n: number) => void, value: number, min: number, max: number, delta: number) {
    setter(Math.min(max, Math.max(min, value + delta)));
  }

  return (
    <div className="rf-lobby rf-fade-in" data-testid="lobby-screen">
      <header className="rf-lobby__header">
        <button type="button" className="ghost rf-lobby__back" onClick={onBack}>
          ← Menu
        </button>
        <div className="rf-lobby__titles">
          <h1>{title}</h1>
          <p className="rf-lobby__tag">
            Configure the theater before deployment.
          </p>
        </div>
      </header>

      <div className="rf-lobby__body">
        <div className="rf-lobby__grid">
          <div className="rf-field rf-field--stepper">
            <span className="rf-label">Human commanders</span>
            <div className="rf-stepper" role="group" aria-label="Human commanders">
              <button
                type="button"
                className="rf-stepper__btn"
                aria-label="Decrease humans"
                disabled={humanCount <= 1}
                onClick={() => bump(setHumanCount, humanCount, 1, 4, -1)}
              >
                −
              </button>
              <strong className="rf-stepper__value" data-testid="human-count">
                {humanCount}
              </strong>
              <button
                type="button"
                className="rf-stepper__btn"
                aria-label="Increase humans"
                disabled={humanCount >= 4}
                onClick={() => bump(setHumanCount, humanCount, 1, 4, 1)}
              >
                +
              </button>
            </div>
          </div>
          <div className="rf-field rf-field--stepper">
            <span className="rf-label">AI factions</span>
            <div className="rf-stepper" role="group" aria-label="AI factions">
              <button
                type="button"
                className="rf-stepper__btn"
                aria-label="Decrease AI"
                disabled={aiCount <= 0}
                onClick={() => bump(setAiCount, aiCount, 0, 3, -1)}
              >
                −
              </button>
              <strong className="rf-stepper__value" data-testid="ai-count">
                {aiCount}
              </strong>
              <button
                type="button"
                className="rf-stepper__btn"
                aria-label="Increase AI"
                disabled={aiCount >= 3}
                onClick={() => bump(setAiCount, aiCount, 0, 3, 1)}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="rf-field rf-lobby__difficulty">
          <span className="rf-label">Difficulty</span>
          <div
            className="rf-seg"
            role="radiogroup"
            aria-label="Difficulty"
            data-testid="difficulty-seg"
          >
            {DIFFICULTY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={difficulty === opt.id}
                className={`rf-seg__btn${difficulty === opt.id ? " is-on" : ""}`}
                title={opt.hint}
                onClick={() => setDifficulty(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rf-lobby__vp">
          <button
            type="button"
            role="checkbox"
            aria-checked={vpEnabled}
            className={`rf-check${vpEnabled ? " is-on" : ""}`}
            onClick={() => setVpEnabled((v) => !v)}
          >
            <span className="rf-check__box" aria-hidden="true" />
            <span className="rf-check__label">
              Victory points race — default win remains total domination
            </span>
          </button>
          {vpEnabled && (
            <div className="rf-field rf-field--stepper">
              <span className="rf-label">Turn limit (0 = none)</span>
              <div className="rf-stepper" role="group" aria-label="Turn limit">
                <button
                  type="button"
                  className="rf-stepper__btn"
                  aria-label="Decrease turn limit"
                  onClick={() =>
                    bump(setTurnLimit, turnLimit, 0, 200, turnLimit > 0 ? -5 : 0)
                  }
                >
                  −
                </button>
                <strong className="rf-stepper__value" data-testid="turn-limit">
                  {turnLimit}
                </strong>
                <button
                  type="button"
                  className="rf-stepper__btn"
                  aria-label="Increase turn limit"
                  onClick={() => bump(setTurnLimit, turnLimit, 0, 200, 5)}
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rf-lobby__doctrine" data-tutorial="lobby-doctrine">
          <span className="rf-label">Faction doctrine</span>
          <p className="rf-lobby__tag rf-lobby__tag--compact">
            Opening techs and unit mods. Difficulty only scales AI budgets.
          </p>
          <div className="rf-lobby__doctrine-grid" role="radiogroup" aria-label="Doctrine">
            {DOCTRINE_LIST.map((d) => {
              const selected =
                humanCount === 1
                  ? doctrineId === d.id
                  : humanDoctrines[0] === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`rf-lobby__doctrine-card${selected ? " is-selected" : ""}`}
                  style={{ ["--rf-doc-accent" as string]: d.accent }}
                  onClick={() => {
                    setDoctrineId(d.id);
                    setHumanDoctrines((prev) => {
                      const next = [...prev];
                      next[0] = d.id;
                      return next;
                    });
                  }}
                >
                  <strong>{d.name}</strong>
                  <span>{d.tagline}</span>
                </button>
              );
            })}
          </div>
          {humanCount > 1 && (
            <div className="rf-lobby__doctrine-hotseat">
              {Array.from({ length: humanCount }, (_, i) => (
                <label key={i} className="rf-field">
                  <span className="rf-label">
                    {names[i] ?? `P${i + 1}`} doctrine
                  </span>
                  <select
                    className="rf-control"
                    value={humanDoctrines[i] ?? "vanguard"}
                    onChange={(e) => {
                      const id = e.target.value as DoctrineId;
                      setHumanDoctrines((prev) => {
                        const next = [...prev];
                        next[i] = id;
                        return next;
                      });
                      if (i === 0) setDoctrineId(id);
                    }}
                  >
                    {DOCTRINE_LIST.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
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
              aria-label={`Callsign player ${i + 1}`}
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
      </div>

      <div className="rf-lobby__footer">
        <button
          type="button"
          className="primary rf-lobby__start"
          data-testid="lobby-start"
          onClick={() =>
            onStart({
              humanCount,
              aiCount,
              humanNames: names.slice(0, humanCount),
              multiplayerMode: mode,
              difficulty,
              victoryPointsEnabled: vpEnabled,
              turnLimit: vpEnabled ? turnLimit : 0,
              doctrineId,
              humanDoctrines: humanDoctrines.slice(0, humanCount),
            })
          }
        >
          Start
        </button>
      </div>
    </div>
  );
}
