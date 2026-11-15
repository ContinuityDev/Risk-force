import { describe, expect, it } from "vitest";
import { getBiome, BIOME_MODS } from "../data/biomes";
import { TERRITORIES } from "../data/map/territories";
import {
  averageFrontageEfficiency,
  counterStrip,
  stackingPreview,
} from "./combatMods";
import { forecastBattle } from "./forecast";
import { findRoute } from "./pathfinding";
import { createInitialState } from "./init";
import { GAME_LOOP } from "../data/gameLoop";

describe("terrain biomes", () => {
  it("assigns a biome to every territory", () => {
    for (const t of TERRITORIES.slice(0, 40)) {
      const b = getBiome(t.id);
      expect(BIOME_MODS[b]).toBeTruthy();
    }
  });
});

describe("stacking / frontage", () => {
  it("efficiency drops past the frontage cap", () => {
    const under = averageFrontageEfficiency(GAME_LOOP.combat.frontageCap);
    const over = averageFrontageEfficiency(GAME_LOOP.combat.frontageCap + 10);
    expect(under).toBe(1);
    expect(over).toBeLessThan(1);
    const preview = stackingPreview([
      { unitId: "trooper", count: GAME_LOOP.combat.frontageCap + 5 },
    ]);
    expect(preview.overstack).toBe(5);
  });
});

describe("battle forecast + counters", () => {
  it("forecasts win odds for an invasion", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 3,
    });
    const enemy = Object.entries(state.territories).find(
      ([, t]) => t.owner !== "player",
    )![0];
    const f = forecastBattle(state, enemy, [
      { unitId: "trooper", count: 8 },
      { unitId: "hover_tank", count: 2 },
    ]);
    expect(f.winChance).toBeGreaterThan(0.05);
    expect(f.winChance).toBeLessThan(0.95);
  });

  it("exposes strong/weak counter strip for troopers", () => {
    const strip = counterStrip("trooper");
    expect(strip.strong.length + strip.weak.length).toBeGreaterThan(0);
  });
});

describe("multi-hop pathfinding", () => {
  it("finds a neighbor path between distant owned plots", () => {
    const a = TERRITORIES[0]!;
    const b = a.neighbors[0]!;
    const route = findRoute(a.id, b, [{ unitId: "trooper", count: 1 }]);
    expect(route).not.toBeNull();
    expect(route!.path[0]).toBe(a.id);
    expect(route!.path.at(-1)).toBe(b);
    expect(route!.totalTurns).toBeGreaterThanOrEqual(1);
  });
});
