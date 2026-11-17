import { beforeEach, describe, expect, it } from "vitest";
import { TERRITORIES as EARTH } from "../data/map/territories";
import { activateMap } from "../data/maps/activate";
import { CIVIL_WAR_TERRITORIES } from "../data/maps/civilWar/territories";
import type { TerritoryDef } from "../data/types";
import { layoutBuildingMinis } from "./buildingMinis";
import { layoutUnitMinis } from "./unitMinis";
import {
  boxesOverlap,
  clearTerritoryAnchorCache,
  footprintInsideRing,
  getTerritoryAnchors,
  groundedOccupancyBox,
  isInsideTerritoryLand,
  labelKeepOutBox,
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
    buildingId:
      i === 0
        ? "command_nexus"
        : i === 1
          ? "reactor"
          : i === 2
            ? "barracks"
            : "refinery",
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

function assertMinisClearLabels(
  minis: {
    key: string;
    x: number;
    y: number;
    size: number;
    compact?: boolean;
  }[],
  labels: { id: string; x: number; y: number; w: number; h: number }[],
) {
  for (const m of minis) {
    // Forced player compact chips may sit under a dense label keep-out —
    // those are an intentional last-resort visibility fallback.
    if (m.compact) continue;
    // Grounded sprites rise above the foot — collide that AABB, not a
    // foot-centered square (which under-counts upward extent).
    const box = groundedOccupancyBox(m.x, m.y, m.size);
    for (const l of labels) {
      const keep = labelKeepOutBox(l, m.size);
      expect(
        boxesOverlap(box, keep, 0.15),
        `${m.key} overlaps label ${l.id}`,
      ).toBe(false);
    }
  }
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

  it("every laid-out mini on World War is inside its territory land and clears labels", () => {
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
    // Deep zoom — buildings place individually inland, clear of labels.
    const cam = { x: 530, y: 55, w: 70, h: 40 };
    const labels = territories.map((t) => ({
      id: t.id,
      x: t.label.x,
      y: t.label.y,
      w: Math.max(14, t.name.length * 2.2),
      h: 4,
    }));
    const zoom = cam.w / 1000;
    expect(zoom).toBeLessThan(0.42);
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
    const swedenBldgs = buildings.filter(
      (b) => b.territoryId === "sweden" && !b.more,
    );
    // Deep zoom places Sweden's full building set inland (not one compact chip).
    expect(swedenBldgs.length).toBeGreaterThanOrEqual(4);
    expect(swedenBldgs.every((b) => !b.compact)).toBe(true);
    for (const m of [...buildings, ...units]) {
      const t = EARTH.find((x) => x.id === m.territoryId)!;
      expect(
        isInsideTerritoryLand(t, m.x, m.y, Math.max(0.6, m.size * 0.35)),
        `${m.key} @ ${m.x.toFixed(1)},${m.y.toFixed(1)} outside ${t.id}`,
      ).toBe(true);
    }
    assertMinisClearLabels([...buildings, ...units], labels);
  });

  it("every laid-out mini on Civil War NE is inside its state land and clears labels", () => {
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
      w: Math.max(12, t.name.length * 1.8),
      h: 3.5,
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
        isInsideTerritoryLand(t, m.x, m.y, Math.max(0.45, m.size * 0.28)),
        `${m.key} outside ${t.id}`,
      ).toBe(true);
    }
    assertMinisClearLabels([...buildings, ...units], labels);
  });

  it("mid zoom may cull buildings; deep zoom reveals all Sweden buildings", () => {
    activateMap("world_war");
    const sweden = EARTH.find((t) => t.id === "sweden")!;
    const territoryState = stockTerritory(sweden, 4, 8);
    const labels = [
      {
        id: "sweden",
        x: sweden.label.x,
        y: sweden.label.y,
        w: 18,
        h: 4,
      },
    ];
    const midCam = { x: 500, y: 45, w: 180, h: 90 };
    const midZoom = midCam.w / 1000; // ~0.18 → deep actually; use larger cam for mid
    const midCam2 = { x: 480, y: 40, w: 480, h: 240 };
    const midZ = midCam2.w / 1000; // 0.48 → mid
    expect(midZ).toBeGreaterThanOrEqual(0.42);
    const midB = layoutBuildingMinis(
      [sweden],
      territoryState,
      midZ,
      midCam2,
      labels,
    );
    // Mid: at most 3 individual buildings (or 1 compact).
    const midShown = midB.filter((b) => !b.more);
    expect(midShown.length).toBeLessThanOrEqual(3);

    const deepCam = { x: 530, y: 55, w: 70, h: 40 };
    const deepZ = deepCam.w / 1000;
    expect(deepZ).toBeLessThan(0.42);
    const deepB = layoutBuildingMinis(
      [sweden],
      territoryState,
      deepZ,
      deepCam,
      labels,
    );
    expect(
      deepB.filter((b) => !b.compact && !b.more).length,
    ).toBeGreaterThanOrEqual(4);
    assertMinisClearLabels(deepB, labels);
    for (const m of deepB) {
      expect(isInsideTerritoryLand(sweden, m.x, m.y, m.size * 0.35)).toBe(true);
    }
    void midZoom;
  });
});
