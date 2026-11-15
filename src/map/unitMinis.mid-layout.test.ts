import { describe, expect, it } from "vitest";
import { TERRITORIES } from "../data/map/territories";
import {
  iconWorldSize,
  layoutBuildingMinis,
  miniZoomTier,
} from "./buildingMinis";
import { layoutUnitMinis } from "./unitMinis";
import type { TerritoryState } from "../engine/state";

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  pad = 0.4,
): boolean {
  return !(
    a.x + a.w / 2 + pad < b.x - b.w / 2 ||
    a.x - a.w / 2 - pad > b.x + b.w / 2 ||
    a.y + a.h / 2 + pad < b.y - b.h / 2 ||
    a.y - a.h / 2 - pad > b.y + b.h / 2
  );
}

function greenlandState(): Record<string, TerritoryState> {
  return {
    greenland: {
      owner: "player",
      population: 18,
      workers: 10,
      buildings: [
        { id: "b1", buildingId: "command_nexus", x: 1, y: 1, hp: 900, maxHp: 900 },
        { id: "b2", buildingId: "barracks", x: 0, y: 0, hp: 200, maxHp: 200 },
        { id: "b3", buildingId: "vehicle_factory", x: 2, y: 0, hp: 280, maxHp: 280 },
        { id: "b4", buildingId: "airfield", x: 0, y: 2, hp: 250, maxHp: 250 },
        { id: "b5", buildingId: "fusion_reactor", x: 3, y: 1, hp: 300, maxHp: 300 },
        { id: "b6", buildingId: "alloy_refinery", x: 2, y: 2, hp: 220, maxHp: 220 },
        { id: "b7", buildingId: "supply_depot", x: 1, y: 3, hp: 180, maxHp: 180 },
      ],
      garrison: {
        trooper: 8,
        jumpjet_trooper: 4,
        aa_tank: 2,
        railgun_walker: 2,
        emp_disruptor: 1,
        heavy_siege_mech: 1,
        stealth_recon_drone: 2,
      },
    },
  };
}

describe("unitMinis mid/deep dense cores", () => {
  it("keeps a multi-type mid grid above Greenland buildings/label", () => {
    const greenland = TERRITORIES.find((t) => t.id === "greenland")!;
    const cam = {
      x: greenland.label.x - 160,
      y: greenland.label.y - 80,
      w: 320,
      h: 160,
    };
    const zoomScale = 320 / 1000;
    expect(miniZoomTier(zoomScale)).toBe("mid");
    expect(iconWorldSize(zoomScale, 320, "mid")).toBeGreaterThan(2);

    const state = greenlandState();
    const labels = [
      { id: "greenland", x: greenland.label.x, y: greenland.label.y, w: 28, h: 10 },
    ];
    const bldgs = layoutBuildingMinis(
      [greenland],
      state,
      zoomScale,
      cam,
      labels,
    );
    const occupied = bldgs.map((b) => ({
      x: b.x,
      y: b.y,
      w: b.size,
      h: b.size,
    }));
    const units = layoutUnitMinis(
      [greenland],
      state,
      zoomScale,
      cam,
      labels,
      occupied,
    );
    const typed = units.filter((u) => !u.compact && u.unitId !== "_more");
    expect(typed.length).toBeGreaterThanOrEqual(3);
    expect(units.some((u) => u.more && u.more > 0)).toBe(true);

    for (const u of units) {
      expect(u.y + u.size / 2).toBeLessThanOrEqual(greenland.label.y + 0.5);
      for (const b of bldgs) {
        expect(
          overlaps(
            { x: u.x, y: u.y, w: u.size, h: u.size },
            { x: b.x, y: b.y, w: b.size, h: b.size },
          ),
        ).toBe(false);
      }
    }
  });

  it("places deep multi-type units above buildings without overlap", () => {
    const greenland = TERRITORIES.find((t) => t.id === "greenland")!;
    const cam = {
      x: greenland.label.x - 40,
      y: greenland.label.y - 20,
      w: 80,
      h: 40,
    };
    const zoomScale = 80 / 1000;
    expect(miniZoomTier(zoomScale)).toBe("deep");

    const state = greenlandState();
    const labels = [
      { id: "greenland", x: greenland.label.x, y: greenland.label.y, w: 18, h: 8 },
    ];
    const bldgs = layoutBuildingMinis(
      [greenland],
      state,
      zoomScale,
      cam,
      labels,
    );
    const occupied = bldgs.map((b) => ({
      x: b.x,
      y: b.y,
      w: b.size,
      h: b.size,
    }));
    const units = layoutUnitMinis(
      [greenland],
      state,
      zoomScale,
      cam,
      labels,
      occupied,
    );
    const typed = units.filter((u) => !u.compact && u.unitId !== "_more");
    expect(typed.length).toBeGreaterThanOrEqual(4);

    for (const u of units) {
      for (const b of bldgs) {
        expect(
          overlaps(
            { x: u.x, y: u.y, w: u.size, h: u.size },
            { x: b.x, y: b.y, w: b.size, h: b.size },
          ),
        ).toBe(false);
      }
    }
  });

  it("emits a single compact chip per territory at world zoom", () => {
    const europe = TERRITORIES.filter((t) => t.continent === "Europe").slice(
      0,
      12,
    );
    const state: Record<string, TerritoryState> = {};
    for (const t of europe) {
      state[t.id] = {
        owner: "player",
        population: 8,
        workers: 2,
        buildings: [],
        garrison: { trooper: 2, hover_tank: 1 },
      };
    }
    const cam = { x: 420, y: 80, w: 1000, h: 500 };
    const labels = europe.map((t) => ({
      id: t.id,
      x: t.label.x,
      y: t.label.y,
      w: 14,
      h: 6,
    }));
    const units = layoutUnitMinis(europe, state, 1, cam, labels, []);
    const byTerritory = new Map<string, number>();
    for (const u of units) {
      if (!u.territoryId) continue;
      byTerritory.set(
        u.territoryId,
        (byTerritory.get(u.territoryId) ?? 0) + 1,
      );
      expect(u.compact).toBe(true);
    }
    for (const n of byTerritory.values()) {
      expect(n).toBe(1);
    }
  });
});
