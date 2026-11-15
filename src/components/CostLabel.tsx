import type { ResourceId } from "../data/types";
import type { ResourceShortfall } from "../engine/economy";
import { formatShortfallMessage } from "../engine/economy";
import { ResourceIcon } from "./ResourceIcon";

const ORDER: ResourceId[] = ["energy", "alloy", "research", "supply"];
const SHORT: Record<ResourceId, string> = {
  energy: "E",
  alloy: "A",
  research: "R",
  supply: "S",
};

/** Inline cost with short resources; shortfalls highlighted red. */
export function CostLabel({
  cost,
  shortfalls = [],
  showNeed = false,
}: {
  cost: { energy: number; alloy?: number; research?: number; supply?: number };
  shortfalls?: ResourceShortfall[];
  showNeed?: boolean;
}) {
  const missing = new Set(shortfalls.map((s) => s.resource));
  const bits = ORDER.filter((r) => {
    const v = r === "energy" ? cost.energy : cost[r] ?? 0;
    return v > 0;
  }).map((r) => {
    const v = r === "energy" ? cost.energy : (cost[r] ?? 0);
    return (
      <span
        key={r}
        className={`rf-cost-chip${missing.has(r) ? " is-short" : ""}`}
      >
        <ResourceIcon id={r} />
        {SHORT[r]}
        {v}
      </span>
    );
  });
  return (
    <span className="rf-cost">
      {bits}
      {showNeed && shortfalls.length > 0 && (
        <span className="rf-cost__need">{formatShortfallMessage(shortfalls)}</span>
      )}
    </span>
  );
}
