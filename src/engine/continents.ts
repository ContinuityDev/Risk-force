import { CONTINENT_BONUSES } from "../data/continents";
import { TERRITORIES } from "../data/map/territories";
import type { GameState } from "./state";
import { emptyResources } from "./state";

/** Continents fully owned by this faction. */
export function controlledContinents(
  state: GameState,
  playerId: string,
): string[] {
  const byCont = new Map<string, { total: number; owned: number }>();
  for (const t of TERRITORIES) {
    const row = byCont.get(t.continent) ?? { total: 0, owned: 0 };
    row.total += 1;
    if (state.territories[t.id]?.owner === playerId) row.owned += 1;
    byCont.set(t.continent, row);
  }
  const held: string[] = [];
  for (const [name, row] of byCont) {
    if (row.total > 0 && row.owned === row.total) held.push(name);
  }
  return held;
}

export function continentIncome(
  state: GameState,
  playerId: string,
): { energy: number; alloy: number; population: number; held: string[] } {
  const held = controlledContinents(state, playerId);
  let energy = 0;
  let alloy = 0;
  let population = 0;
  for (const name of held) {
    const b = CONTINENT_BONUSES[name];
    if (!b) continue;
    energy += b.energy;
    alloy += b.alloy;
    population += b.population;
  }
  return { energy, alloy, population, held };
}

/** Distribute continent pop bonus across owned territories on those continents. */
export function applyContinentPopulation(
  state: GameState,
  playerId: string,
  popBonus: number,
  held: string[],
): GameState {
  if (popBonus <= 0 || !held.length) return state;
  const heldSet = new Set(held);
  const ids = TERRITORIES.filter(
    (t) =>
      heldSet.has(t.continent) &&
      state.territories[t.id]?.owner === playerId,
  ).map((t) => t.id);
  if (!ids.length) return state;
  const territories = { ...state.territories };
  let left = popBonus;
  let i = 0;
  while (left > 0) {
    const tid = ids[i % ids.length]!;
    const ts = territories[tid]!;
    territories[tid] = { ...ts, population: ts.population + 1 };
    left -= 1;
    i += 1;
  }
  return { ...state, territories };
}

export function continentBonusResources(
  state: GameState,
  playerId: string,
) {
  const { energy, alloy } = continentIncome(state, playerId);
  const r = emptyResources();
  r.energy = energy;
  r.alloy = alloy;
  return r;
}
