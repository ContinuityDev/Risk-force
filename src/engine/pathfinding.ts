/**
 * Multi-hop routes along territory neighbor graph.
 */

import { getTerritory, TERRITORIES } from "../data/map/territories";
import type { StrikeForceSlot } from "./state";
import {
  canAirJump,
  forceMoveLayer,
  isSeaLink,
  travelTurns,
} from "./movement";

export interface RouteHop {
  fromId: string;
  toId: string;
  turns: number;
}

export interface MoveRoute {
  path: string[];
  hops: RouteHop[];
  totalTurns: number;
}

/** BFS shortest path by hop count; ties broken by travel time. */
export function findRoute(
  fromId: string,
  toId: string,
  force: StrikeForceSlot[],
  opts?: { maxHops?: number; avoidEnemy?: boolean; owner?: string; territories?: Record<string, { owner: string }> },
): MoveRoute | null {
  if (fromId === toId) {
    return { path: [fromId], hops: [], totalTurns: 0 };
  }
  const maxHops = opts?.maxHops ?? 8;
  const queue: string[] = [fromId];
  const prev = new Map<string, string | null>([[fromId, null]]);
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++]!;
    const depth = (() => {
      let d = 0;
      let p = cur;
      while (prev.get(p)) {
        p = prev.get(p)!;
        d++;
      }
      return d;
    })();
    if (depth >= maxHops) continue;
    let neighbors: string[] = [];
    try {
      neighbors = [...getTerritory(cur).neighbors];
    } catch {
      continue;
    }
    const layer = forceMoveLayer(force);
    if (layer === "naval") {
      neighbors = neighbors.filter((n) => isSeaLink(cur, n));
    } else if (layer === "air") {
      // Air can also jump to non-adjacent territories in range.
      for (const t of TERRITORIES) {
        if (t.id === cur) continue;
        if (neighbors.includes(t.id)) continue;
        if (canAirJump(cur, t.id, force)) neighbors.push(t.id);
      }
    }
    for (const n of neighbors) {
      if (prev.has(n)) continue;
      if (
        opts?.avoidEnemy &&
        opts.territories &&
        opts.owner &&
        opts.territories[n]?.owner !== opts.owner &&
        n !== toId
      ) {
        continue;
      }
      prev.set(n, cur);
      if (n === toId) {
        // reconstruct
        const path: string[] = [];
        let walk: string | null = toId;
        while (walk) {
          path.push(walk);
          walk = prev.get(walk) ?? null;
        }
        path.reverse();
        const hops: RouteHop[] = [];
        let total = 0;
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i]!;
          const b = path[i + 1]!;
          const turns = travelTurns(a, b, force);
          hops.push({ fromId: a, toId: b, turns });
          total += turns;
        }
        return { path, hops, totalTurns: total };
      }
      queue.push(n);
    }
  }
  return null;
}

/** All territory ids (for tests / UI). */
export function territoryIds(): string[] {
  return TERRITORIES.map((t) => t.id);
}
