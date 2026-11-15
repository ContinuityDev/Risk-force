import { counterStrip } from "../engine/combatMods";

interface CounterStripProps {
  unitId: string;
  className?: string;
}

export function CounterStrip({ unitId, className }: CounterStripProps) {
  const strip = counterStrip(unitId);
  if (!strip.strong.length && !strip.weak.length) return null;
  return (
    <div className={`rf-counters ${className ?? ""}`.trim()}>
      {strip.strong.length > 0 && (
        <span className="rf-counters__strong">
          Strong vs {strip.strong.join(", ")}
        </span>
      )}
      {strip.weak.length > 0 && (
        <span className="rf-counters__weak">
          Weak vs {strip.weak.join(", ")}
        </span>
      )}
    </div>
  );
}
