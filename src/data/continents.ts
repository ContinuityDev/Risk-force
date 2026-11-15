/**
 * Continent / region control bonuses — tunable, data-driven.
 * Holding every territory whose `continent` matches the key grants the bonus.
 */

export interface ContinentBonus {
  id: string;
  /** Display name on the map legend. */
  name: string;
  /** Energy income per turn while holding the whole continent. */
  energy: number;
  /** Alloy income per turn. */
  alloy: number;
  /** Extra untrained recruits split across owned territories on the continent. */
  population: number;
  /** Legend tint (CSS color). */
  color: string;
}

export const CONTINENT_BONUSES: Record<string, ContinentBonus> = {
  "North America": {
    id: "north_america",
    name: "North America",
    energy: 55,
    alloy: 18,
    population: 6,
    color: "#6aaa8a",
  },
  "South America": {
    id: "south_america",
    name: "South America",
    energy: 40,
    alloy: 14,
    population: 5,
    color: "#c4a574",
  },
  Europe: {
    id: "europe",
    name: "Europe",
    energy: 50,
    alloy: 16,
    population: 5,
    color: "#7eb6c9",
  },
  Africa: {
    id: "africa",
    name: "Africa",
    energy: 45,
    alloy: 12,
    population: 7,
    color: "#c07070",
  },
  Asia: {
    id: "asia",
    name: "Asia",
    energy: 70,
    alloy: 22,
    population: 8,
    color: "#a88bc4",
  },
  Oceania: {
    id: "oceania",
    name: "Oceania",
    energy: 28,
    alloy: 10,
    population: 3,
    color: "#6ec4a0",
  },
};

export const CONTINENT_LIST = Object.values(CONTINENT_BONUSES);
