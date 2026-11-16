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
    /** Lean opening spend so a one-territory start stays energy-positive. */
    defaultBudget: 10,
    aiDefaultBudget: 12,
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
    /** @deprecated Prefer raze/keep capture choice. */
    destroyBuildingsOnCapture: true,
    /** Soft frontage cap — efficiency drops for units beyond this per side. */
    frontageCap: 12,
    /** Efficiency of each unit past the frontage cap (diminishing). */
    frontageOverstackEfficiency: 0.55,
    /** Entrenchment bonus for units that did not move this turn. */
    fortifiedBonus: 0.18,
    /** Extra fortified bonus from shield walls / bunkers on the plot. */
    fortificationBuildingBonus: 0.08,
  },

  repair: {
    /** HP restored per garrison unit per turn with a completed Repair Bay. */
    repairBayHeal: 18,
    /** Extra HP/turn for all garrisons after field_repair research. */
    fieldRepairHeal: 6,
  },

  occupation: {
    /** Turns of continuous garrison before occupied → stabilized. */
    stabilizeTurns: 4,
    /** Output / training multiplier while occupied (not yet stabilized). */
    occupiedOutputMult: 0.55,
    occupiedTrainMult: 0.7,
    /** Cash bump (energy) when razing on capture. */
    razeEnergyBonus: 40,
    /** Population retained fraction when razing. */
    razePopRetain: 0.35,
    /** Building HP retained fraction when keeping (need repair). */
    keepBuildingHpMult: 0.45,
  },

  logistics: {
    /** Supply radius in neighbor hops from a completed depot. */
    depotRadius: 2,
    /** Per-unit attrition fraction per turn when out of supply. */
    attritionFraction: 0.08,
    /** Combat damage multiplier when out of supply. */
    unsuppliedDamageMult: 0.75,
    /** Market buy spread above mid rate. */
    marketBuySpread: 1.12,
    /** Market sell spread below mid rate. */
    marketSellSpread: 0.88,
    midRates: {
      energyPerAlloy: 3,
      energyPerSupply: 2,
      alloyPerSupply: 0.7,
    },
  },

  solvency: {
    /** Partial energy refund when disbanding a unit (fraction of train cost). */
    disbandRefund: 0.35,
    /** Mothball: unit stays but upkeep × this, cannot fight until remobilized. */
    mothballUpkeepMult: 0.25,
    /** Warn when projected net energy after action is below this. */
    warnNetThreshold: -40,
  },

  victory: {
    /** Default win remains total domination (all territories incl. neutrals). */
    pointsPerTerritory: 1,
    pointsPerCore: 2,
    pointsPerContinent: 8,
    defaultTurnLimit: 0,
  },

  /**
   * One-start setup: each faction begins with a single core;
   * remaining territories are Neutral until invaded.
   */
  neutrals: {
    /** Multiplier on static defender counts. */
    garrisonScale: 1,
    /** Troopers regenerated per full turn on under-garrisoned neutrals. */
    regenPerTurn: 1,
    /** Soft cap = opening garrison × this. */
    regenCapFactor: 1.15,
    /** Minimum graph distance between faction starting territories. */
    minStartDistance: 3,
  },

  /**
   * Energy upkeep (Conflict-of-Nations-like logistics).
   * Paid each turn after income. Negative energy → insolvent:
   * production stops next tick, desertFraction of garrison deserts,
   * workers grant no staffing/build bonuses while insolvent.
   */
  upkeep: {
    perWorker: 0.75,
    byRole: {
      infantry: 0.85,
      armor: 2.5,
      air: 3.5,
      artillery: 2.5,
      naval: 3.5,
      orbital: 5,
      cyber: 1.75,
    },
    insolvencyThreshold: 0,
    desertFraction: 0.12,
  },

  /** Strategic map movement (centroid distance in SVG px). */
  movement: {
    /** World px covered per 1.0 unit speed per turn. */
    pxPerSpeedPerTurn: 28,
    /** Sea crossings take this × longer. */
    seaMultiplier: 1.65,
    /** Label distance above which a coastal neighbor counts as a sea lane. */
    seaLinkMinPx: 55,
    maxTurns: 8,
  },

  capture: {
    /** Default fraction of survivors that occupy (AI / slider default). */
    defaultOccupyFraction: 0.7,
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
    "Tap a training building on the base grid (Barracks, Vehicle Factory, Airfield, Drydock, Nexus) and choose Train unit. Each building lists what it can produce — locked units show their research requirement. Training spends energy, alloy, population, and turns.",
  workers:
    "Workers staff buildings (boosting output up to a cap) and speed construction. Assign them in the base view.",
  invasion:
    "Attack from an adjacent territory using its garrison — including grey Neutral land. You fight defending units and armed/command structures. After a win, choose Raze (cash bump, wipe buildings) or Keep (damaged buildings need repair), then how many survivors occupy. Captured land is occupied until stabilized.",
  ai:
    "AI factions expand into adjacent Neutrals early (weakest / valuable first), build real economies, fight other factions, and may retreat from losing battles. Neutrals never take turns. AI resolves instantly — the Orbital Wire summarizes what happened.",
  upkeep:
    "Units and workers cost energy every turn. Energy floors at 0 (no debt spiral); insolvency still idles production and causes desertion. Disband units for a partial refund if payroll is too high.",
  movement:
    "Move armies along multi-hop neighbor routes. Travel takes multiple turns based on distance, slowest unit, terrain, and sea crossings. Route lines show the path; arriving at an enemy starts a battle. Retreat sends survivors home.",
  continents:
    "Region bonuses (continents / USA regions) only apply once you hold every territory in that region — Neutral land blocks the bonus until captured.",
  victory:
    "Default: total domination — control every territory including Neutrals. Optional VP race scores territories, cores, and completed regions; with a turn limit the VP leader wins if time expires.",
  terrain:
    "Each territory has a biome (plains, urban, mountain, desert, arctic, jungle, coastal) that modifies combat and travel. Units that did not move are fortified; shield walls and bunkers deepen the bonus.",
  logistics:
    "Depots stock local supply within a radius. Armies far from supply suffer attrition and fight worse. Global supply is separate — depot output is not double-counted. Trade energy/alloy/supply on the Orbital Market.",
  stacking:
    "Battles have a frontage cap; excess units fight at reduced efficiency. Invade preview shows stacking, win odds, and strong/weak counters.",
  doctrines:
    "Pick a doctrine in the lobby (Vanguard, Ironclad, Skyborne, Spectre). It sets opening techs and unit cost/stat modifiers. Difficulty only scales AI budgets — no flat human tech dump.",
  commanders:
    "War College trains one officer per role (infantry, armor, air, cyber). Attach them to a garrison for stack buffs; they are lost if that stack is wiped.",
  strikes:
    "Orbital Strike Uplink, cruise launchers, and kinetic rods can hit a territory without invading — damage buildings, knock shields, cut supply. Cooldowns apply; AI uses them too.",
  recon:
    "Stealth recon drones and satellite relays reveal exact garrisons and research for a few turns. Without recon, enemy garrisons show as approximate ranges (not full fog of war).",
  navalAir:
    "Pure naval stacks move only on sea lanes/coasts. Pure air/dropship stacks can jump within range instead of hop-by-hop.",
  theaterEvents:
    "Random theater headlines (solar flare, refugee wave, debris field, black-market cache) apply real effects and appear in the Orbital Wire.",
  templates:
    "Save an invade composition as a template and apply it in one tap from the Army screen.",
  hotseat:
    "Hot-seat passes through a clean handoff screen between human commanders; the news feed is shared.",
} as const;
