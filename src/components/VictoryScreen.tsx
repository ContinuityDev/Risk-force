import { factionColor, factionName } from "../data/factions";
import type { FactionId } from "../data/types";

interface VictoryScreenProps {
  winner: FactionId | null;
  message?: string | null;
  onMenu: () => void;
}

export function VictoryScreen({ winner, message, onMenu }: VictoryScreenProps) {
  const name = winner ? factionName(winner) : "Unknown";
  const color = winner ? factionColor(winner) : "var(--rf-accent)";

  return (
    <div className="rf-victory rf-fade-in">
      <div className="rf-victory__panel">
        <p className="rf-label">Theater resolved</p>
        <h1 style={{ color }}>Victory</h1>
        <p className="rf-victory__winner">
          <strong style={{ color }}>{name}</strong> controls the Earth Theater.
        </p>
        {message && <p className="rf-text-dim">{message}</p>}
        <button type="button" className="primary" onClick={onMenu}>
          Return to Menu
        </button>
      </div>
    </div>
  );
}
