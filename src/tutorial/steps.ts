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
    body: "You start with one homeland. Grey territories are Neutral — static defenders until invaded. Tap your colored land; the country sheet opens with Open Base and March.",
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
    title: "Resources at a glance",
    body: "Top HUD chips are Energy, Alloy, Research, Supply, and Campaign — each with an icon and short label. Green/red deltas show per-turn Energy. Tap or long-press a chip for what it is, where it comes from, and what spends it. Unaffordable actions highlight the short resource and pulse that chip.",
    target: "hud-resources",
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
    id: "building-desc",
    title: "Building dossiers",
    body: "Every structure lists what it does — output, cost, upkeep, worker slots, and research gates. Read the blurb in the build menu, long-press a pad building, or check the staffing drawer.",
    target: "base-build-menu",
    screen: "base",
    needSelection: true,
  },
  {
    id: "train",
    title: "Train from buildings",
    body: "Tap a Barracks, Vehicle Factory, Airfield, or Command Nexus on the grid. Choose Train unit to see what that building produces — costs, turns, upkeep, and research locks. Queue progress shows on the building badge.",
    target: "base-train",
    screen: "base",
    needSelection: true,
  },
  {
    id: "move",
    title: "Move troops",
    body: "Army → Reinforce plans multi-hop routes along neighbors. Travel takes turns from distance, slowest unit, and terrain — the map draws your route line.",
    target: "territory-sheet",
    screen: "map",
    needSelection: true,
  },
  {
    id: "army",
    title: "Attack",
    body: "Invade shows stacking/frontage, win odds, expected losses, and strong/weak counters. March from a local garrison; battle opens on arrival.",
    target: "dock-invade",
    screen: "invade",
  },
  {
    id: "battle",
    title: "Battle & retreat",
    body: "Units keep HP between fights. Damaged troops hit softer. Use Retreat to fall back toward your origin if the assault collapses.",
    screen: "map",
  },
  {
    id: "capture",
    title: "After capture",
    body: "Neutral and enemy captures use the same flow: choose Raze (energy bump, wipe buildings) or Keep (damaged structures need repair), then occupation strength. Captured land is occupied until stabilized.",
    screen: "map",
  },
  {
    id: "doctrine",
    title: "Doctrine",
    body: "Your lobby doctrine (Vanguard / Ironclad / Skyborne / Spectre) sets opening techs and unit cost/stat mods. Difficulty only scales AI budgets — no free human tech dump.",
    screen: "map",
  },
  {
    id: "strikes-recon",
    title: "Strikes & recon",
    body: "On an enemy territory, launch cruise/orbital/kinetic strikes (cooldown + FX + news) or recon drones/sats for exact garrisons. Without recon, enemy stacks show as ranges.",
    screen: "map",
  },
  {
    id: "logistics",
    title: "Supply & market",
    body: "Depots feed local supply stock in a radius — unsupplied armies attrit. Trade energy/alloy/supply on the Orbital Market from the HUD.",
    screen: "map",
  },
  {
    id: "continents",
    title: "Region bonuses",
    body: "Own every territory in a continent or USA region — including former Neutrals — for bonus Energy, Alloy, and Population. Open Continents on the map for the list.",
    target: "map-continents",
    screen: "map",
  },
  {
    id: "endturn",
    title: "End Turn",
    body: "Tap End Turn when ready. Enemy factions resolve instantly — they expand into Neutrals, build economies, research, train, and fight. Neutrals never act.",
    target: "dock-end",
    screen: "map",
  },
  {
    id: "news",
    title: "Orbital Wire",
    body: "After the AI phase, a theater brief summarizes battles, Neutral claims, research, and builds. Reopen anytime via the News button (badge shows unread). History is filed by turn.",
    target: "hud-news",
    screen: "map",
  },
  {
    id: "done",
    title: "You're cleared for ops",
    body: "Replay this tutorial anytime from the main menu or in-game More menu. Good hunting, Commander.",
    screen: "map",
  },
];
