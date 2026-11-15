import { factionColor, factionName } from "../data/factions";
import type { FactionId } from "../data/types";

interface VictoryScreenProps {
  winner: FactionId | null;
  message?: string | null;
  /** Human faction id — used to show Victory vs Defeat. */
  humanId?: FactionId | null;
  onMenu: () => void;
}

export function VictoryScreen({
  winner,
  message,
  humanId,
  onMenu,
}: VictoryScreenProps) {
  const name = winner ? factionName(winner) : "Unknown";
  const color = winner ? factionColor(winner) : "var(--rf-accent)";
  const humanWon = !!winner && !!humanId && winner === humanId;
  const title = !humanId ? "Victory" : humanWon ? "Victory" : "Defeat";

  return (
    <div className="rf-victory rf-fade-in">
      <div className="rf-victory__panel">
        <p className="rf-label">Theater resolved · total domination</p>
        <h1 style={{ color: humanWon || !humanId ? color : "#c07070" }}>
          {title}
        </h1>
        <p className="rf-victory__winner">
          <strong style={{ color }}>{name}</strong> controls every territory.
        </p>
        {message && <p className="rf-text-dim">{message}</p>}
        <button type="button" className="primary" onClick={onMenu}>
          Return to Menu
        </button>
      </div>
    </div>
  );
}
