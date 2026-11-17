import { beforeEach, describe, expect, it } from "vitest";
import { TERRITORIES as EARTH } from "../data/map/territories";
import { activateMap } from "../data/maps/activate";
import { CIVIL_WAR_TERRITORIES } from "../data/maps/civilWar/territories";
import type { TerritoryDef } from "../data/types";
import { layoutBuildingMinis, miniZoomTier } from "./buildingMinis";
import { layoutUnitMinis } from "./unitMinis";

function miniZoomTierFor(zoom: number) {
  return miniZoomTier(zoom);
}
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
    territoryId?: string;
    x: number;
    y: number;
    size: number;
    compact?: boolean;
  }[],
  labels: { id: string; x: number; y: number; w: number; h: number }[],
) {
  for (const m of minis) {
    // Grounded sprites rise above the foot — collide that AABB, not a
    // foot-centered square (which under-counts upward extent).
    const box = groundedOccupancyBox(m.x, m.y, m.size);
    const ownId = m.territoryId ?? m.key.split(":")[0];
    for (const l of labels) {
      // Own name: full keep-out. Neighbor names: the glyph itself — padded
      // keep-outs from adjacent states must not ban inland slots.
      const keep =
        l.id === ownId
          ? labelKeepOutBox(l, m.size)
          : {
              x: l.x,
              y: l.y,
              w: Math.max(l.w * 1.05, l.w + 0.8),
              h: Math.max(l.h * 1.25, l.h + 0.8),
            };
      expect(
        boxesOverlap(box, keep, 0.1),
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
    // World-space label extents ≈ screenPx × zoom (not inflated mid-zoom widths).
    const zoom = cam.w / 1000;
    const labels = territories.map((t) => {
      const font = 11 * zoom;
      return {
        id: t.id,
        x: t.label.x,
        y: t.label.y,
        w: Math.max(6, t.name.length * font * 0.55),
        h: Math.max(2.2, font * 1.15),
      };
    });
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
      buildings.map((b) => groundedOccupancyBox(b.x, b.y, b.size)),
    );
    expect(buildings.length + units.length).toBeGreaterThan(0);
    const swedenBldgs = buildings.filter(
      (b) => b.territoryId === "sweden" && !b.more,
    );
    // Deep zoom places readable inland chips (large paint may only fit 2–3).
    expect(swedenBldgs.length).toBeGreaterThanOrEqual(2);
    expect(swedenBldgs.every((b) => !b.compact)).toBe(true);
    expect(swedenBldgs.every((b) => b.size >= 7.8)).toBe(true);
    for (const m of [...buildings, ...units]) {
      const t = EARTH.find((x) => x.id === m.territoryId)!;
      expect(
        isInsideTerritoryLand(t, m.x, m.y, Math.max(0.5, Math.min(1.4, m.size * 0.22))),
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
    const zoom = cam.w / 1000;
    // World-space glyph extents (screenPx × zoom) — not inflated mid-zoom
    // widths that ban every inland slot between NE states.
    const labels = territories.map((t) => {
      const font = 11 * zoom;
      return {
        id: t.id,
        x: t.label.x,
        y: t.label.y,
        w: Math.max(6, t.name.length * font * 0.55),
        h: Math.max(2.2, font * 1.15),
      };
    });
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

  it("Indonesia deep zoom spreads readable minis across islands, clear of labels", () => {
    activateMap("world_war");
    const indo = EARTH.find((t) => t.id === "indonesia")!;
    const malay = EARTH.find((t) => t.id === "malaysia")!;
    const territories = [indo, malay];
    const territoryState: Record<
      string,
      import("../engine/state").TerritoryState
    > = {
      ...stockTerritory(indo, 4, 8),
      ...stockTerritory(malay, 2, 4),
    };
    // Focus frame ≈ mobile 844×390 default zoom on SE Asia.
    const cam = {
      x: indo.label.x - 72,
      y: indo.label.y - 45,
      w: 180,
      h: 90,
    };
    const zoom = 0.18;
    expect(miniZoomTierFor(zoom)).toBe("deep");
    const labels = territories.map((t) => ({
      id: t.id,
      x: t.label.x,
      y: t.label.y,
      w: Math.max(6, t.name.length * 11 * zoom * 0.55),
      h: Math.max(2.2, 11 * zoom * 1.15),
    }));
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
      buildings.map((b) => groundedOccupancyBox(b.x, b.y, b.size * 0.55)),
    );
    const indoB = buildings.filter(
      (b) => b.territoryId === "indonesia" && !b.more && !b.compact,
    );
    expect(indoB.length).toBeGreaterThanOrEqual(3);
    // ≥24px on an 844-wide map at camW=180.
    // Height-limited mobile maps ~3.3px/wu; require ≥7.8wu (≥~24px).
    expect(indoB.every((b) => b.size >= 7.8)).toBe(true);
    let minD = Infinity;
    for (let i = 0; i < indoB.length; i++) {
      for (let j = i + 1; j < indoB.length; j++) {
        minD = Math.min(
          minD,
          Math.hypot(indoB[i]!.x - indoB[j]!.x, indoB[i]!.y - indoB[j]!.y),
        );
      }
    }
    expect(minD).toBeGreaterThanOrEqual(4);
    // At least one pair spans distinct landmasses (not one Borneo clump).
    const span = Math.max(
      ...indoB.map((a) =>
        Math.max(
          ...indoB.map((b) => Math.hypot(a.x - b.x, a.y - b.y)),
        ),
      ),
    );
    expect(span).toBeGreaterThanOrEqual(40);
    for (const m of [...buildings, ...units]) {
      const t = EARTH.find((x) => x.id === m.territoryId)!;
      expect(
        isInsideTerritoryLand(
          t,
          m.x,
          m.y,
          Math.max(0.5, Math.min(1.4, m.size * 0.22)),
        ),
        `${m.key} outside ${t.id}`,
      ).toBe(true);
    }
    assertMinisClearLabels([...buildings, ...units], labels);
  });

  it("mid zoom may cull buildings; deep zoom reveals all Sweden buildings", () => {
    activateMap("world_war");
    const sweden = EARTH.find((t) => t.id === "sweden")!;
    const territoryState = stockTerritory(sweden, 4, 8);
    const midCam2 = { x: 480, y: 40, w: 480, h: 240 };
    const midZ = midCam2.w / 1000; // 0.48 → mid
    const midLabels = [
      {
        id: "sweden",
        x: sweden.label.x,
        y: sweden.label.y,
        w: Math.max(8, sweden.name.length * 11 * midZ * 0.55),
        h: Math.max(2.4, 11 * midZ * 1.15),
      },
    ];
    expect(midZ).toBeGreaterThanOrEqual(0.42);
    const midB = layoutBuildingMinis(
      [sweden],
      territoryState,
      midZ,
      midCam2,
      midLabels,
    );
    // Mid: at most 3 individual buildings (or 1 compact).
    const midShown = midB.filter((b) => !b.more);
    expect(midShown.length).toBeLessThanOrEqual(3);

    const deepCam = { x: 530, y: 55, w: 70, h: 40 };
    const deepZ = deepCam.w / 1000;
    const deepLabels = [
      {
        id: "sweden",
        x: sweden.label.x,
        y: sweden.label.y,
        w: Math.max(6, sweden.name.length * 11 * deepZ * 0.55),
        h: Math.max(2.2, 11 * deepZ * 1.15),
      },
    ];
    expect(deepZ).toBeLessThan(0.42);
    const deepB = layoutBuildingMinis(
      [sweden],
      territoryState,
      deepZ,
      deepCam,
      deepLabels,
    );
    const deepIcons = deepB.filter((b) => !b.compact && !b.more);
    expect(deepIcons.length).toBeGreaterThanOrEqual(2);
    expect(deepIcons.every((b) => b.size >= 7.8)).toBe(true);
    assertMinisClearLabels(deepB, deepLabels);
    for (const m of deepB) {
      expect(
        isInsideTerritoryLand(sweden, m.x, m.y, Math.max(0.6, m.size * 0.28)),
      ).toBe(true);
    }
  });
});
