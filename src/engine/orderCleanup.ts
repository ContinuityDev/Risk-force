import type { FactionId } from "../data/types";
import { territoryDisplayName } from "../ui/displayNames";
import { mergeIntoGarrison } from "./garrisonHp";
import type { ArmyTransit, GameState } from "./state";

/**
 * After a territory changes owner (capture, reinforce arrival, etc.), drop or
 * retarget any pending invade / march / planned-route UI that no longer makes
 * sense. Attacking a territory you now own becomes a friendly reinforce merge
 * (or is cancelled if the army can't merge cleanly).
 */
export function scrubOrdersForTerritory(
  state: GameState,
  territoryId: string,
  opts?: { notice?: string | null },
): GameState {
  let territories = state.territories;
  let notice: string | null = opts?.notice ?? null;
  const remaining: ArmyTransit[] = [];

  for (const army of state.armiesInTransit ?? []) {
    const touches =
      army.toId === territoryId ||
      army.fromId === territoryId ||
      (army.pathRemaining ?? []).includes(territoryId);

    if (!touches) {
      remaining.push(army);
      continue;
    }

    const dest = territories[army.toId];
    // Marching into land that is now friendly → merge as reinforcements.
    if (dest && dest.owner === army.owner) {
      territories = {
        ...territories,
        [army.toId]: mergeIntoGarrison(dest, army.force),
      };
      notice =
        notice ??
        `Column arrives in friendly ${territoryDisplayName(army.toId)} — invasion cancelled.`;
      continue;
    }
    // Destination owned by someone else who isn't the intended foe, or origin
    // lost — cancel the march and return force home when possible.
    const homeId =
      territories[army.fromId]?.owner === army.owner
        ? army.fromId
        : Object.entries(territories).find(
            ([id, ts]) => ts.owner === army.owner && id !== army.toId,
          )?.[0];
    if (homeId) {
      territories = {
        ...territories,
        [homeId]: mergeIntoGarrison(territories[homeId]!, army.force),
      };
    }
    notice =
      notice ??
      `Orders updated — march on ${territoryDisplayName(territoryId)} cancelled.`;
  }

  let plannedRoute = state.plannedRoute;
  if (plannedRoute?.includes(territoryId)) {
    // If the route's destination is now friendly to the active player, clear.
    const destId = plannedRoute[plannedRoute.length - 1];
    const dest = destId ? territories[destId] : null;
    const active = state.playerOrder[state.activePlayerIndex];
    if (!dest || (active && dest.owner === active) || destId === territoryId) {
      plannedRoute = null;
      notice =
        notice ??
        `Route cleared — ${territoryDisplayName(territoryId)} is no longer a valid target.`;
    }
  }

  const aiAttackPlans = (state.aiAttackPlans ?? []).filter(
    (p) => p.toId !== territoryId && p.fromId !== territoryId,
  );

  return {
    ...state,
    territories,
    armiesInTransit: remaining,
    plannedRoute,
    aiAttackPlans,
    message: notice ?? state.message,
  };
}

/** Scrub every territory whose owner differs from `previous`. */
export function scrubOrdersAfterOwnerMap(
  state: GameState,
  previous: Record<string, { owner: FactionId | string }>,
): GameState {
  let cur = state;
  for (const [id, ts] of Object.entries(state.territories)) {
    const prev = previous[id]?.owner;
    if (prev !== undefined && prev !== ts.owner) {
      cur = scrubOrdersForTerritory(cur, id);
    }
  }
  return cur;
}
