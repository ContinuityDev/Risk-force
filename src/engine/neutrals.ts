/**
 * Neutral territories: static defenders, light regen, no AI turns.
 */

import { getBiome } from "../data/biomes";
import { GAME_LOOP } from "../data/gameLoop";
import { TERRITORIES } from "../data/map/territories";
import type { TerritoryDef } from "../data/types";
import type { GameState, TerritoryState } from "./state";

const BIOME_GARRISON: Record<string, number> = {
  urban: 1.55,
  mountain: 1.4,
  jungle: 1.25,
  arctic: 1.15,
  desert: 1.05,
  coastal: 1.1,
  plains: 1,
};

/** Population for an unclaimed territory based on land area. */
export function neutralPopulation(tdef: TerritoryDef): number {
  const base = GAME_LOOP.startingPopulation;
  const areaBoost = Math.round(tdef.area * 220);
  return Math.max(6, base + areaBoost);
}

/** Static defender stack scaled by population + terrain. */
export function neutralGarrison(tdef: TerritoryDef): Record<string, number> {
  const pop = neutralPopulation(tdef);
  const biome = getBiome(tdef.id);
  const mult = BIOME_GARRISON[biome] ?? 1;
  const troopers = Math.max(
    2,
    Math.round((2 + pop / 7) * mult * GAME_LOOP.neutrals.garrisonScale),
  );
  const garrison: Record<string, number> = { trooper: troopers };
  if (biome === "urban" || biome === "mountain" || troopers >= 6) {
    garrison.assault_mech = 1;
  }
  return garrison;
}

/** Light emplacements neutrals can keep or lose on capture. */
export function neutralBuildings(
  nextId: { n: number },
  tdef: TerritoryDef,
): TerritoryState["buildings"] {
  const biome = getBiome(tdef.id);
  const buildings: TerritoryState["buildings"] = [];
  if (biome === "urban" || biome === "mountain" || tdef.area > 0.02) {
    buildings.push({
      instanceId: `b${nextId.n++}`,
      buildingId: "laser_turret",
      x: 4,
      y: 0,
      hp: 220,
      buildRemaining: 0,
      workers: 0,
    });
  }
  if (biome === "urban" || tdef.area > 0.035) {
    buildings.push({
      instanceId: `b${nextId.n++}`,
      buildingId: "shield_wall",
      x: 4,
      y: 4,
      hp: 400,
      buildRemaining: 0,
      workers: 0,
    });
  }
  return buildings;
}

export function makeNeutralTerritory(
  tdef: TerritoryDef,
  nextId: { n: number },
): TerritoryState {
  const pop = neutralPopulation(tdef);
  return {
    owner: "neutral",
    buildings: neutralBuildings(nextId, tdef),
    supplyStock: 4,
    population: pop,
    workers: 0,
    garrison: neutralGarrison(tdef),
    garrisonHp: {},
    trainingQueue: [],
    control: "core",
    occupiedTurns: 0,
    movedThisTurn: false,
  };
}

/**
 * Slow garrison regen for neutrals — a few troopers toward soft cap each full turn.
 */
export function regenerateNeutralGarrisons(state: GameState): GameState {
  const cfg = GAME_LOOP.neutrals;
  if (cfg.regenPerTurn <= 0) return state;
  const territories = { ...state.territories };
  let changed = false;
  for (const t of TERRITORIES) {
    const ts = territories[t.id];
    if (!ts || ts.owner !== "neutral") continue;
    const softCap = Math.max(
      3,
      Math.round(
        Object.values(neutralGarrison(t)).reduce((a, b) => a + b, 0) *
          cfg.regenCapFactor,
      ),
    );
    const current = ts.garrison.trooper ?? 0;
    if (current >= softCap) continue;
    const add = Math.min(cfg.regenPerTurn, softCap - current);
    territories[t.id] = {
      ...ts,
      garrison: {
        ...ts.garrison,
        trooper: current + add,
      },
    };
    changed = true;
  }
  return changed ? { ...state, territories } : state;
}
