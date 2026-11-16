import { beforeEach, describe, expect, it } from "vitest";
import { TERRITORIES as EARTH } from "../data/map/territories";
import { activateMap } from "../data/maps/activate";
import { CIVIL_WAR_TERRITORIES } from "../data/maps/civilWar/territories";
import type { TerritoryDef } from "../data/types";
import { layoutBuildingMinis } from "./buildingMinis";
import { layoutUnitMinis } from "./unitMinis";
import {
  clearTerritoryAnchorCache,
  footprintInsideRing,
  getTerritoryAnchors,
  isInsideTerritoryLand,
  parseSvgPathRings,
  pointInRing,
} from "./territoryAnchors";

function stockTerritory(
  t: TerritoryDef,
  buildings = 3,
  troops = 6,
): Record<string, import("../engine/state").TerritoryState> {
  const blds = Array.from({ length: buildings }, (_, i) => ({
    instanceId: `b${i}`,
    buildingId: i === 0 ? "command_nexus" : i === 1 ? "reactor" : "barracks",
    x: i % 2,
    y: Math.floor(i / 2),
    hp: 20,
    buildRemaining: 0,
    workers: 1,
  }));
  return {
    [t.id]: {
      owner: "player",
      control: "owned",
      population: 10,
      workers: 4,
      buildings: blds,
      garrison: { trooper: troops, assault_mech: 1 },
      supplyStock: 20,
      trainingQueue: [],
    } as import("../engine/state").TerritoryState,
  };
}

describe("territoryAnchors", () => {
  beforeEach(() => {
    clearTerritoryAnchorCache();
  });

  it("parses multi-ring SVG paths (New York)", () => {
    activateMap("civil_war");
    const ny = CIVIL_WAR_TERRITORIES.find((t) => t.id === "new_york")!;
    const rings = parseSvgPathRings(ny.path);
    expect(rings.length).toBeGreaterThanOrEqual(2);
    const a = getTerritoryAnchors(ny);
    expect(pointInRing(a.pole.x, a.pole.y, a.rings[a.largestRingIndex]!)).toBe(
      true,
    );
  });

  it("Sweden / Finland poles sit inside their land polygons", () => {
    activateMap("world_war");
    for (const id of ["sweden", "finland", "norway", "germany"]) {
      const t = EARTH.find((x) => x.id === id)!;
      const a = getTerritoryAnchors(t);
      expect(
        footprintInsideRing(
          a.pole.x,
          a.pole.y,
          1.2,
          1.2,
          a.rings[a.largestRingIndex]!,
          0.2,
        ),
      ).toBe(true);
    }
  });

  it("every laid-out mini on World War is inside its territory land", () => {
    activateMap("world_war");
    const focus = ["sweden", "finland", "germany", "poland", "united_kingdom"];
    const territories = focus.map((id) => {
      const t = EARTH.find((x) => x.id === id);
      if (!t) throw new Error(`missing territory ${id}`);
      return t;
    });
    const territoryState: Record<
      string,
      import("../engine/state").TerritoryState
    > = {};
    for (const t of territories) {
      Object.assign(territoryState, stockTerritory(t, 4, 8));
    }
    const cam = { x: 480, y: 40, w: 160, h: 80 };
    const labels = territories.map((t) => ({
      id: t.id,
      x: t.label.x,
      y: t.label.y,
      w: 20,
      h: 4,
    }));
    const zoom = cam.w / 1000;
    const buildings = layoutBuildingMinis(
      territories,
      territoryState,
      zoom,
      cam,
      labels,
    );
    const units = layoutUnitMinis(
      territories,
      territoryState,
      zoom,
      cam,
      labels,
      buildings.map((b) => ({ x: b.x, y: b.y, w: b.size, h: b.size })),
    );
    expect(buildings.length + units.length).toBeGreaterThan(0);
    for (const m of [...buildings, ...units]) {
      const t = EARTH.find((x) => x.id === m.territoryId)!;
      expect(
        isInsideTerritoryLand(t, m.x, m.y, Math.max(0.6, m.size * 0.35)),
        `${m.key} @ ${m.x.toFixed(1)},${m.y.toFixed(1)} outside ${t.id}`,
      ).toBe(true);
    }
  });

  it("every laid-out mini on Civil War NE is inside its state land", () => {
    activateMap("civil_war");
    const focus = [
      "new_york",
      "connecticut",
      "massachusetts",
      "new_hampshire",
      "vermont",
      "new_jersey",
    ];
    const territories = CIVIL_WAR_TERRITORIES.filter((t) =>
      focus.includes(t.id),
    );
    const territoryState: Record<
      string,
      import("../engine/state").TerritoryState
    > = {};
    for (const t of territories) {
      Object.assign(territoryState, stockTerritory(t, 2, 5));
    }
    const cam = { x: 780, y: 90, w: 120, h: 60 };
    const labels = territories.map((t) => ({
      id: t.id,
      x: t.label.x,
      y: t.label.y,
      w: 16,
      h: 3,
    }));
    const zoom = cam.w / 1000;
    const buildings = layoutBuildingMinis(
      territories,
      territoryState,
      zoom,
      cam,
      labels,
    );
    const units = layoutUnitMinis(
      territories,
      territoryState,
      zoom,
      cam,
      labels,
      buildings.map((b) => ({ x: b.x, y: b.y, w: b.size, h: b.size })),
    );
    expect(units.length).toBeGreaterThan(0);
    for (const m of [...buildings, ...units]) {
      const t = CIVIL_WAR_TERRITORIES.find((x) => x.id === m.territoryId)!;
      expect(
        isInsideTerritoryLand(t, m.x, m.y, Math.max(0.5, m.size * 0.3)),
        `${m.key} outside ${t.id}`,
      ).toBe(true);
    }
  });
});
