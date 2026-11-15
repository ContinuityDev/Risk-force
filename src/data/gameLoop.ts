/**
 * Tunable constants for the Risk-like population / campaigning / training loop.
 * Keep gameplay balance changes here — not buried in engine code.
 */

import type { FactionId } from "./types";

export const GAME_LOOP = {
  /** Starting pop on each territory after assignment. */
  startingPopulation: 12,
  /** Extra pop on a faction's largest starting territories. */
  startingPopBonus: 6,

  population: {
    /** Recruits from land: baseLandFactor * sum(area) * 100. */
    baseLandFactor: 18,
    /** Campaigning: campaignFactor * sqrt(energySpend). */
    campaignFactor: 14,
    /** Minimum recruits a faction with any land still gets. */
    minRecruits: 2,
    /** Fraction of total recruits each territory gets by land share (rest flat). */
    landShareWeight: 0.75,
    /** Population retained when territory is captured. */
    captureRetain: 0.65,
  },

  campaigning: {
    /** Max energy that can be earmarked as campaign budget per turn. */
    maxBudget: 200,
    defaultBudget: 40,
    aiDefaultBudget: 55,
  },

  training: {
    worker: {
      popCost: 1,
      energy: 18,
      alloy: 4,
      turns: 1,
    },
    /** Basic always-available infantry. */
    basicUnitId: "trooper",
    unit: {
      /** Multiplier on unit def cost for local training. */
      energyMult: 1,
      alloyMult: 1,
      turnsBase: 1,
      /** Extra turns for higher-tier (by energy cost bands). */
      turnsPer100Energy: 1,
      popCost: 1,
    },
  },

  workers: {
    /** Default max workers assignable to a completed building. */
    defaultCap: 3,
    economyCap: 4,
    defenseCap: 2,
    commandCap: 2,
    /** Output multiplier = 1 + bonusPerWorker * assigned (up to cap). */
    outputBonusPerWorker: 0.22,
    /** Each free worker in the territory shaves this fraction off buildRemaining drain. */
    buildSpeedPerWorker: 0.12,
    maxBuildSpeedBonus: 0.6,
  },

  combat: {
    /** On capture, all buildings are wiped (bare land). */
    destroyBuildingsOnCapture: true,
  },
} as const;

/** AI personality weights — higher = more emphasis. */
export interface AiPersonality {
  id: FactionId;
  /** Prioritize garrisoning exposed borders. */
  defense: number;
  /** Prefer weak / low-garrison targets. */
  opportunism: number;
  /** Prefer concentrating force on one axis. */
  concentration: number;
  /** Prefer opening a second front / flank. */
  flanking: number;
  /** Economy / campaigning spend bias 0–1. */
  campaignBias: number;
}

export const AI_PERSONALITIES: Record<string, AiPersonality> = {
  faction_a: {
    id: "faction_a",
    defense: 0.85,
    opportunism: 0.55,
    concentration: 0.7,
    flanking: 0.35,
    campaignBias: 0.45,
  },
  faction_b: {
    id: "faction_b",
    defense: 0.45,
    opportunism: 0.9,
    concentration: 0.4,
    flanking: 0.85,
    campaignBias: 0.65,
  },
  faction_c: {
    id: "faction_c",
    defense: 0.65,
    opportunism: 0.7,
    concentration: 0.55,
    flanking: 0.55,
    campaignBias: 0.55,
  },
  player: {
    id: "player",
    defense: 0.5,
    opportunism: 0.5,
    concentration: 0.5,
    flanking: 0.5,
    campaignBias: 0.5,
  },
};

export function getAiPersonality(id: FactionId): AiPersonality {
  return AI_PERSONALITIES[id] ?? AI_PERSONALITIES.faction_c!;
}

/** Help blurbs shown in UI tooltips / help panel. */
export const HELP = {
  campaigning:
    "Campaigning budget (energy/turn) funds recruitment drives. Land gives a baseline of recruits; spending accelerates growth with diminishing returns — a rich small state can out-recruit a poor empire.",
  population:
    "Each territory has a local population pool. Recruits arrive each turn from land share + campaigning, then you train them into workers or units.",
  training:
    "Train population into workers or units locally. Basic troopers are always available; advanced units need research. Training costs energy, alloy, and time.",
  workers:
    "Workers staff buildings (boosting output up to a cap) and speed construction. Assign them in the base view.",
  invasion:
    "Attack from an adjacent territory using its garrison. You fight both enemy buildings and units stationed there. Capturing wipes buildings — you get bare land and a reduced local population.",
  ai:
    "AI factions defend borders, pick weak targets, and may open flanking fronts based on personality.",
} as const;
