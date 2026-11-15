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

const CATEGORY_RANK: Record<NewsItem["category"], number> = {
  territory: 0,
  battle: 1,
  research: 2,
  movement: 3,
  build: 4,
  economy: 5,
  general: 6,
};

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
      // Skip minor support pads — keep major economy / defense / research
      if (cat === "support") return null;
      const where = territoryLabel(action.payload.territoryId);
      const isEconomy = cat === "economy";
      return makeNewsItem({
        turn,
        category: "build",
        factionId,
        headline: isEconomy
          ? `${displayName} builds ${bName} in ${where}`
          : `${displayName} fortifies ${where} (${bName})`,
        body: `Construction begins on a ${bName}.`,
      });
    }
    case "RESEARCH": {
      const node = action.payload.nodeId.replace(/_/g, " ");
      return makeNewsItem({
        turn,
        category: "research",
        factionId,
        headline: `${displayName} researching ${node}`,
        body: `Labs begin work on ${node}.`,
      });
    }
    case "TRAIN_UNIT":
      // Training is routine — omit from headline wire
      return null;
    case "ORDER_MOVE":
    case "MOVE_GARRISON": {
      const to = action.payload.toId;
      const from = action.payload.fromId;
      const humanId = Object.values(state.players).find(
        (p) => p.kind === "human",
      )?.id;
      const towardHuman =
        humanId &&
        (state.territories[to]?.owner === humanId ||
          TERRITORIES.find((t) => t.id === to)?.neighbors.some(
            (n) => state.territories[n]?.owner === humanId,
          ));
      if (!towardHuman) return null;
      return makeNewsItem({
        turn,
        category: "movement",
        factionId,
        headline: `${displayName} moves on your border`,
        body: `${territoryLabel(from)} → ${territoryLabel(to)}.`,
      });
    }
    case "START_INVASION": {
      return makeNewsItem({
        turn,
        category: "battle",
        factionId,
        headline: `${displayName} invades ${territoryLabel(action.payload.toId)}`,
        body: `From ${territoryLabel(action.payload.fromId)}: ${forceSummary(action.payload.force)}.`,
      });
    }
    case "SET_CAMPAIGN_BUDGET":
      // Collapsed later into a single economy line — skip raw noise
      return null;
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

/**
 * Sort by importance and collapse economy noise into one line.
 */
export function prioritizeNews(items: NewsItem[]): NewsItem[] {
  const economy = items.filter((i) => i.category === "economy");
  const rest = items.filter((i) => i.category !== "economy");
  const sorted = [...rest].sort((a, b) => {
    const ra = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
    if (ra !== 0) return ra;
    return a.timestamp - b.timestamp;
  });
  if (economy.length) {
    const factions = [
      ...new Set(economy.map((e) => e.factionId).filter(Boolean)),
    ] as FactionId[];
    sorted.push(
      makeNewsItem({
        turn: economy[0]!.turn,
        category: "economy",
        factionId: factions[0],
        headline:
          factions.length > 1
            ? `Enemy economies adjusted (${factions.length} factions)`
            : `${factionName(factions[0]!)} adjusted campaign spend`,
        body: "Routine budget and upkeep tweaks collapsed.",
      }),
    );
  }
  return sorted;
}

export function digestHeadline(items: NewsItem[]): string {
  const prioritized = prioritizeNews(items);
  const territories = prioritized.filter((i) => i.category === "territory");
  const battles = prioritized.filter((i) => i.category === "battle");
  const research = prioritized.filter((i) => i.category === "research");
  const builds = prioritized.filter((i) => i.category === "build");
  const parts: string[] = [];
  if (territories.length)
    parts.push(
      `${territories.length} territor${territories.length > 1 ? "ies" : "y"}`,
    );
  if (battles.length)
    parts.push(`${battles.length} battle${battles.length > 1 ? "s" : ""}`);
  if (research.length)
    parts.push(`${research.length} research`);
  if (builds.length)
    parts.push(`${builds.length} build${builds.length > 1 ? "s" : ""}`);
  if (!parts.length) return "Theater brief — quiet sector";
  return `Theater brief — ${parts.join(", ")}`;
}

export const NEWS_ICON: Record<NewsItem["category"], string> = {
  territory: "⚑",
  battle: "⚔",
  research: "◈",
  movement: "⇢",
  build: "⌂",
  economy: "¤",
  general: "·",
};
