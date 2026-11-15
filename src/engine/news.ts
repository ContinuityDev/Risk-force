import { factionName } from "../data/factions";
import { getBuilding } from "../data/buildings";
import { TERRITORIES } from "../data/map/territories";
import { getUnit } from "../data/units";
import type { FactionId } from "../data/types";
import type { GameAction } from "./actions";
import type { BattleState, GameState, NewsItem } from "./state";

function territoryLabel(id: string): string {
  return TERRITORIES.find((t) => t.id === id)?.name ?? id;
}

function forceSummary(
  force: { unitId: string; count: number }[],
): string {
  return force
    .map((s) => {
      try {
        return `${getUnit(s.unitId).name}×${s.count}`;
      } catch {
        return `${s.unitId}×${s.count}`;
      }
    })
    .join(", ");
}

let newsSeq = 1;

export function makeNewsItem(
  partial: Omit<NewsItem, "id" | "timestamp"> & { id?: string },
): NewsItem {
  return {
    id: partial.id ?? `news-${Date.now()}-${newsSeq++}`,
    timestamp: Date.now(),
    turn: partial.turn,
    category: partial.category,
    headline: partial.headline,
    body: partial.body,
    factionId: partial.factionId,
  };
}

/** Convert a dispatched AI action into a news item (or null if mundane). */
export function newsFromAiAction(
  turn: number,
  factionId: FactionId,
  displayName: string,
  action: GameAction,
  state: GameState,
): NewsItem | null {
  switch (action.type) {
    case "PLACE_BUILDING": {
      let bName = action.payload.buildingId;
      let cat = "structure";
      try {
        const b = getBuilding(action.payload.buildingId);
        bName = b.name;
        cat = b.category;
      } catch {
        /* */
      }
      const where = territoryLabel(action.payload.territoryId);
      const isEconomy = cat === "economy";
      return makeNewsItem({
        turn,
        category: "build",
        factionId,
        headline: isEconomy
          ? `${displayName} expands industry in ${where}`
          : `${displayName} fortifies ${where}`,
        body: `Construction begins on a ${bName}.`,
      });
    }
    case "RESEARCH": {
      const node = action.payload.nodeId.replace(/_/g, " ");
      return makeNewsItem({
        turn,
        category: "research",
        factionId,
        headline: `${displayName} opens research: ${node}`,
        body: `Labs begin work on ${node}.`,
      });
    }
    case "TRAIN_UNIT": {
      let uName = action.payload.unitId;
      try {
        uName = getUnit(action.payload.unitId).name;
      } catch {
        /* */
      }
      return makeNewsItem({
        turn,
        category: "movement",
        factionId,
        headline: `${displayName} musters ${uName}s`,
        body: `${action.payload.count}× ${uName} enter training in ${territoryLabel(action.payload.territoryId)}.`,
      });
    }
    case "ORDER_MOVE":
    case "MOVE_GARRISON": {
      const to =
        action.type === "ORDER_MOVE"
          ? action.payload.toId
          : action.payload.toId;
      const from =
        action.type === "ORDER_MOVE"
          ? action.payload.fromId
          : action.payload.fromId;
      const humanId = Object.values(state.players).find(
        (p) => p.kind === "human",
      )?.id;
      const towardHuman =
        humanId &&
        TERRITORIES.find((t) => t.id === to)?.neighbors.some(
          (n) => state.territories[n]?.owner === humanId,
        );
      if (!towardHuman && action.type === "MOVE_GARRISON") return null;
      return makeNewsItem({
        turn,
        category: "movement",
        factionId,
        headline: towardHuman
          ? `${displayName} shifts forces toward your border`
          : `${displayName} redeploys troops`,
        body: `Movement reported ${territoryLabel(from)} → ${territoryLabel(to)}.`,
      });
    }
    case "START_INVASION": {
      return makeNewsItem({
        turn,
        category: "battle",
        factionId,
        headline: `${displayName} invades ${territoryLabel(action.payload.toId)}`,
        body: `Strike force from ${territoryLabel(action.payload.fromId)}: ${forceSummary(action.payload.force)}.`,
      });
    }
    case "SET_CAMPAIGN_BUDGET":
      if (action.payload.energy < 20) return null;
      return makeNewsItem({
        turn,
        category: "economy",
        factionId,
        headline: `${displayName} sets campaign spend at ${action.payload.energy}`,
        body: `Recruitment budget locked for the coming cycle.`,
      });
    default:
      return null;
  }
}

export function newsFromBattleResult(
  turn: number,
  battle: BattleState,
  previousOwner: FactionId,
  captured: boolean,
): NewsItem {
  const atk = factionName(battle.attacker);
  const def = factionName(battle.defender);
  const where = territoryLabel(battle.territoryId);
  if (captured) {
    return makeNewsItem({
      turn,
      category: "territory",
      factionId: battle.attacker,
      headline: `${atk} seizes ${where}`,
      body: `Taken from ${factionName(previousOwner)}. ${def} garrison collapsed.`,
    });
  }
  return makeNewsItem({
    turn,
    category: "battle",
    factionId: battle.defender,
    headline: `${def} holds ${where}`,
    body: `${atk}'s assault is thrown back.`,
  });
}

export function digestHeadline(items: NewsItem[]): string {
  const battles = items.filter((i) => i.category === "battle" || i.category === "territory");
  const builds = items.filter((i) => i.category === "build");
  const research = items.filter((i) => i.category === "research");
  const parts: string[] = [];
  if (battles.length) parts.push(`${battles.length} engagement${battles.length > 1 ? "s" : ""}`);
  if (builds.length) parts.push(`${builds.length} construction report${builds.length > 1 ? "s" : ""}`);
  if (research.length) parts.push(`${research.length} research note${research.length > 1 ? "s" : ""}`);
  if (!parts.length) return "Theater brief — quiet sector";
  return `Theater brief — ${parts.join(", ")}`;
}
