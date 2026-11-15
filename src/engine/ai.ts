import { BUILDING_LIST } from "../data/buildings";
import { TERRITORIES } from "../data/map/territories";
import { RESEARCH_LIST } from "../data/research";
import { UNIT_LIST } from "../data/units";
import type { GameAction } from "./actions";
import { canAfford } from "./economy";
import { canPlaceBuilding } from "./placement";
import { canResearch, isUnlocked } from "./research";
import type { GameState, StrikeForceSlot } from "./state";

/**
 * Believable AI: research toward unlocked branches, balance eco/defense,
 * recruit a mixed force, invade when local superiority looks favorable.
 */
export function planAiTurn(state: GameState): GameAction[] {
  const pid = state.playerOrder[state.activePlayerIndex]!;
  const player = state.players[pid]!;
  if (player.kind !== "ai") return [];

  const actions: GameAction[] = [];

  // 1) Research — prefer nodes that unlock combat power we lack.
  const researchable = RESEARCH_LIST.filter((n) =>
    canResearch(player, n.id),
  ).sort((a, b) => {
    const branchScore = (id: string) => {
      if (id.includes("defense") || id.includes("plasma") || id.includes("armor"))
        return 0;
      if (id.includes("economy") || id.includes("nano") || id.includes("industry"))
        return 1;
      return 2;
    };
    return (
      branchScore(a.id) - branchScore(b.id) || a.cost - b.cost
    );
  });
  if (researchable[0] && player.resources.research >= researchable[0].cost) {
    actions.push({ type: "RESEARCH", payload: { nodeId: researchable[0].id } });
  }

  const owned = TERRITORIES.filter((t) => state.territories[t.id]?.owner === pid);
  const frontier = owned.filter((t) =>
    t.neighbors.some((n) => state.territories[n]?.owner !== pid),
  );

  // 2) Build — economy on safe territories, defenses on frontier.
  for (const t of owned) {
    const ts = state.territories[t.id]!;
    const isFront = frontier.some((f) => f.id === t.id);
    const ecoCount = ts.buildings.filter((b) => {
      try {
        return BUILDING_LIST.find((d) => d.id === b.buildingId)?.category === "economy";
      } catch {
        return false;
      }
    }).length;
    const defCount = ts.buildings.filter((b) => {
      const d = BUILDING_LIST.find((x) => x.id === b.buildingId);
      return d?.category === "defense";
    }).length;

    const candidates = BUILDING_LIST.filter((b) => {
      if (b.id === "command_nexus") return false;
      if (!isUnlocked(player, b.id)) return false;
      if (!canAfford(player, b.cost)) return false;
      if (isFront) return b.category === "defense" || (ecoCount < 2 && b.category === "economy");
      return b.category === "economy" || (defCount < 2 && b.category === "defense") || b.category === "support";
    }).sort((a, b) => a.cost.energy - b.cost.energy);

    let placed = 0;
    for (const b of candidates) {
      if (placed >= 2) break;
      outer: for (let y = 0; y < t.grid.rows; y++) {
        for (let x = 0; x < t.grid.cols; x++) {
          if (canPlaceBuilding(ts, t.id, b.id, x, y, player).ok) {
            actions.push({
              type: "PLACE_BUILDING",
              payload: { territoryId: t.id, buildingId: b.id, x, y },
            });
            placed++;
            break outer;
          }
        }
      }
    }
  }

  // 3) Recruit — mix infantry + best unlocked.
  const unlockedUnits = UNIT_LIST.filter(
    (u) => isUnlocked(player, u.id) && canAfford(player, u.cost),
  ).sort((a, b) => a.cost.energy - b.cost.energy);
  for (const u of unlockedUnits.slice(0, 2)) {
    actions.push({ type: "RECRUIT", payload: { unitId: u.id, count: 1 } });
  }

  // 4) Invade weak neighbor if force + supply allow.
  const totalReserves = Object.values(player.reserves).reduce((a, b) => a + b, 0);
  if (totalReserves >= 4 && player.resources.supply >= 6) {
    for (const t of frontier) {
      for (const nid of t.neighbors) {
        const nts = state.territories[nid];
        if (!nts || nts.owner === pid) continue;
        const armed = nts.buildings.filter((b) => {
          const d = BUILDING_LIST.find((x) => x.id === b.buildingId);
          return d && (d.damage || d.category === "command");
        }).length;
        if (armed <= 4 || totalReserves >= armed + 3) {
          const force: StrikeForceSlot[] = [];
          let left = Math.min(8, totalReserves);
          // Prefer higher-tier units first.
          const entries = Object.entries(player.reserves).sort((a, b) => {
            const ua = UNIT_LIST.find((u) => u.id === a[0]);
            const ub = UNIT_LIST.find((u) => u.id === b[0]);
            return (ub?.cost.energy ?? 0) - (ua?.cost.energy ?? 0);
          });
          for (const [unitId, count] of entries) {
            if (left <= 0) break;
            const take = Math.min(count, left);
            if (take > 0) {
              force.push({ unitId, count: take });
              left -= take;
            }
          }
          if (force.length) {
            actions.push({
              type: "START_INVASION",
              payload: { fromId: t.id, toId: nid, force },
            });
            return actions;
          }
        }
      }
    }
  }

  actions.push({ type: "END_TURN" });
  return actions;
}
