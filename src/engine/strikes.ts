/**
 * Strategic map strikes — orbital uplink, cruise missiles, kinetic rods.
 * Hit a territory without invading: damage buildings, drop shields, cut supply.
 */

import { getBuilding } from "../data/buildings";
import { TERRITORIES } from "../data/map/territories";
import type { FactionId } from "../data/types";
import type { GameState, StrikeFx, StrikeKind } from "./state";
import { canAfford, spend } from "./economy";
import { makeNewsItem } from "./news";

export const STRIKE_DEFS: Record<
  StrikeKind,
  {
    label: string;
    /** Garrison / building asset that authorizes the strike. */
    requiresUnit?: string[];
    requiresBuilding?: string[];
    cost: { energy: number; alloy: number; supply: number };
    cooldown: number;
    /** Fraction of building maxHp damaged. */
    buildingDamageFrac: number;
    /** Wipe shield_wall / shield_generator HP to 0. */
    knockShields: boolean;
    /** Turns of supply cut on target. */
    supplyCutTurns: number;
  }
> = {
  orbital: {
    label: "Orbital Strike",
    requiresUnit: ["orbital_strike_uplink"],
    requiresBuilding: ["uplink_array"],
    cost: { energy: 120, alloy: 40, supply: 18 },
    cooldown: 3,
    buildingDamageFrac: 0.35,
    knockShields: true,
    supplyCutTurns: 1,
  },
  cruise: {
    label: "Cruise Barrage",
    requiresUnit: ["cruise_launcher"],
    requiresBuilding: ["missile_battery"],
    cost: { energy: 70, alloy: 25, supply: 12 },
    cooldown: 2,
    buildingDamageFrac: 0.22,
    knockShields: false,
    supplyCutTurns: 1,
  },
  kinetic: {
    label: "Kinetic Rod",
    requiresUnit: ["kinetic_rod_battery"],
    requiresBuilding: ["silo_pad"],
    cost: { energy: 160, alloy: 55, supply: 22 },
    cooldown: 4,
    buildingDamageFrac: 0.48,
    knockShields: true,
    supplyCutTurns: 2,
  },
};

function territoryLabel(id: string): string {
  return TERRITORIES.find((t) => t.id === id)?.name ?? id;
}

export function playerHasStrikeAsset(
  state: GameState,
  playerId: FactionId,
  kind: StrikeKind,
): boolean {
  const def = STRIKE_DEFS[kind];
  for (const ts of Object.values(state.territories)) {
    if (ts.owner !== playerId) continue;
    if (def.requiresUnit) {
      for (const u of def.requiresUnit) {
        if ((ts.garrison[u] ?? 0) > 0) return true;
      }
    }
    if (def.requiresBuilding) {
      for (const b of ts.buildings) {
        if (b.buildRemaining > 0 || b.hp <= 0) continue;
        if (def.requiresBuilding.includes(b.buildingId)) return true;
      }
    }
  }
  return false;
}

export function strikeCooldownLeft(
  state: GameState,
  playerId: FactionId,
  kind: StrikeKind,
): number {
  const cd = state.players[playerId]?.strikeCooldowns?.[kind] ?? 0;
  return Math.max(0, cd);
}

export function canLaunchStrike(
  state: GameState,
  playerId: FactionId,
  kind: StrikeKind,
  targetId: string,
): { ok: true } | { ok: false; reason: string } {
  const player = state.players[playerId];
  if (!player || player.eliminated) return { ok: false, reason: "No player." };
  const target = state.territories[targetId];
  if (!target) return { ok: false, reason: "Unknown target." };
  if (target.owner === playerId) return { ok: false, reason: "Friendly territory." };
  if (!playerHasStrikeAsset(state, playerId, kind)) {
    return { ok: false, reason: `Need ${STRIKE_DEFS[kind].label} assets.` };
  }
  if (strikeCooldownLeft(state, playerId, kind) > 0) {
    return {
      ok: false,
      reason: `Cooldown ${strikeCooldownLeft(state, playerId, kind)}t.`,
    };
  }
  const cost = STRIKE_DEFS[kind].cost;
  if (!canAfford(player, cost)) return { ok: false, reason: "Insufficient resources." };
  return { ok: true };
}

export function applyStrike(
  state: GameState,
  playerId: FactionId,
  kind: StrikeKind,
  targetId: string,
): GameState {
  const check = canLaunchStrike(state, playerId, kind, targetId);
  if (!check.ok) {
    return { ...state, message: check.reason };
  }
  const def = STRIKE_DEFS[kind];
  const player = state.players[playerId]!;
  const spent = spend(player, def.cost);
  const target = state.territories[targetId]!;
  const buildings = target.buildings.map((b) => {
    if (b.buildRemaining > 0 || b.hp <= 0) return b;
    let hp = b.hp;
    try {
      const bdef = getBuilding(b.buildingId);
      const dmg = Math.ceil(bdef.maxHp * def.buildingDamageFrac);
      hp = Math.max(0, hp - dmg);
      if (
        def.knockShields &&
        (b.buildingId === "shield_wall" ||
          b.buildingId === "shield_generator_large")
      ) {
        hp = 0;
      }
    } catch {
      hp = Math.max(0, Math.floor(hp * (1 - def.buildingDamageFrac)));
    }
    return { ...b, hp };
  });

  const fx: StrikeFx = {
    id: `sfx-${state.nextInstanceId}`,
    kind,
    territoryId: targetId,
    turn: state.turn,
    createdAt: Date.now(),
  };

  const news = makeNewsItem({
    turn: state.turn,
    category: "battle",
    factionId: playerId,
    headline: `${def.label} hits ${territoryLabel(targetId)}`,
    body: `${player.displayName} authorized a ${def.label.toLowerCase()} — structures damaged${
      def.knockShields ? ", shields offline" : ""
    }${def.supplyCutTurns ? `, supply cut ${def.supplyCutTurns}t` : ""}.`,
  });

  return {
    ...state,
    nextInstanceId: state.nextInstanceId + 1,
    players: {
      ...state.players,
      [playerId]: {
        ...spent,
        strikeCooldowns: {
          ...(spent.strikeCooldowns ?? {}),
          [kind]: def.cooldown,
        },
      },
    },
    territories: {
      ...state.territories,
      [targetId]: {
        ...target,
        buildings,
        supplyCutTurns: Math.max(
          target.supplyCutTurns ?? 0,
          def.supplyCutTurns,
        ),
        supplyStock: Math.max(
          0,
          Math.floor(target.supplyStock * (1 - 0.35)),
        ),
      },
    },
    strikeFx: [...(state.strikeFx ?? []).slice(-8), fx],
    newsFeed: [...(state.newsFeed ?? []), news].slice(-120),
    newsUnread: (state.newsUnread ?? 0) + 1,
    message: `${def.label} on ${territoryLabel(targetId)}.`,
  };
}

/** Tick strike cooldowns + clear stale FX for the ending player. */
export function tickStrikeState(
  state: GameState,
  playerId: string,
): GameState {
  const p = state.players[playerId];
  if (!p) return state;
  const cds = { ...(p.strikeCooldowns ?? {}) };
  for (const k of Object.keys(cds) as StrikeKind[]) {
    cds[k] = Math.max(0, (cds[k] ?? 0) - 1);
  }
  const territories = { ...state.territories };
  for (const [tid, ts] of Object.entries(territories)) {
    if (ts.owner !== playerId) continue;
    if ((ts.supplyCutTurns ?? 0) > 0) {
      territories[tid] = {
        ...ts,
        supplyCutTurns: Math.max(0, (ts.supplyCutTurns ?? 0) - 1),
      };
    }
  }
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...p, strikeCooldowns: cds },
    },
    territories,
    strikeFx: (state.strikeFx ?? []).filter(
      (fx) => Date.now() - fx.createdAt < 8000 || fx.turn >= state.turn - 1,
    ),
  };
}
