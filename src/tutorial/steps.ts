import type { Screen } from "../engine/state";

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  /** data-tutorial attribute to spotlight */
  target?: string;
  /** Navigate here before showing the step */
  screen?: Screen;
  /** Prefer selecting a player-owned territory first */
  needSelection?: boolean;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome, Commander",
    body: "This short tour uses the real UI. Follow the highlights — Next advances, Back goes back, Skip ends anytime. Progress is saved if you leave.",
    screen: "map",
  },
  {
    id: "select",
    title: "Select a territory",
    body: "Tap a green territory you own on the map. The country sheet opens on the right with Open Base and March actions.",
    target: "map-svg",
    screen: "map",
  },
  {
    id: "sheet",
    title: "Country sheet",
    body: "Your selected territory sheet stays in reach on the right. Open Base to manage the sector, or pick a friendly neighbor to March troops.",
    target: "territory-sheet",
    screen: "map",
    needSelection: true,
  },
  {
    id: "economy",
    title: "Energy & the ledger",
    body: "Top HUD shows Energy (with net /turn), Alloy, Research, and Supply. Long-press Energy for income, upkeep, and campaign spend. Keep net energy from going deeply negative.",
    target: "hud-energy",
    screen: "map",
  },
  {
    id: "campaign",
    title: "Campaign budget",
    body: "The Campaign slider spends energy each turn to recruit population on your territories. Too high starves construction; too low stalls growth.",
    target: "hud-campaign",
    screen: "map",
  },
  {
    id: "base",
    title: "Build & staff",
    body: "In Base, pick a structure from the side panel, tap an empty pad (Confirm on phones), then staff buildings with the − / + worker stepper so output scales.",
    target: "dock-base",
    screen: "base",
    needSelection: true,
  },
  {
    id: "train",
    title: "Train units",
    body: "Untrained population becomes workers or combat units in the Population & Training list. Advanced units unlock through Research.",
    target: "base-train",
    screen: "base",
    needSelection: true,
  },
  {
    id: "move",
    title: "Move troops",
    body: "From a selected territory, March to a friendly neighbor. Travel takes turns based on the slowest unit in the force — plan ahead.",
    target: "territory-sheet",
    screen: "map",
    needSelection: true,
  },
  {
    id: "army",
    title: "Attack",
    body: "Army assembles a strike force from a local garrison against an adjacent enemy. Large tappable lists pick origin and target — no tiny dropdowns.",
    target: "dock-invade",
    screen: "invade",
  },
  {
    id: "battle",
    title: "Battle deploy zones",
    body: "In battle, attackers spawn in the left deploy strip, fight across no-man's-land, and hit the defender base on the right. Skip is a corner control on phones.",
    screen: "map",
  },
  {
    id: "capture",
    title: "After capture",
    body: "Winning lets you choose how many surviving units occupy the captured land. Buildings are razed — you rebuild on bare ground with reduced population.",
    screen: "map",
  },
  {
    id: "continents",
    title: "Continent bonuses",
    body: "Own every territory on a continent for bonus Energy, Alloy, and Population each turn. Open Continents on the map for the list.",
    target: "map-continents",
    screen: "map",
  },
  {
    id: "endturn",
    title: "End Turn & AI log",
    body: "Tap End Turn on the bottom bar when ready. AI factions act automatically — watch the turn log for builds, marches, and invasions.",
    target: "dock-end",
    screen: "map",
  },
  {
    id: "done",
    title: "You're cleared for ops",
    body: "Replay this tutorial anytime from the main menu or in-game More menu. Good hunting, Commander.",
    screen: "map",
  },
];
