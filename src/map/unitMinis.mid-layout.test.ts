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
      supplyStock: 20,
      trainingQueue: [],
      garrisonHp: {},
      control: "core",
      occupiedTurns: 0,
      buildings: [
        { instanceId: "b1", buildingId: "command_nexus", x: 1, y: 1, hp: 900, buildRemaining: 0, workers: 0 },
        { instanceId: "b2", buildingId: "barracks", x: 0, y: 0, hp: 200, buildRemaining: 0, workers: 0 },
        { instanceId: "b3", buildingId: "vehicle_factory", x: 2, y: 0, hp: 280, buildRemaining: 0, workers: 0 },
        { instanceId: "b4", buildingId: "airfield", x: 0, y: 2, hp: 250, buildRemaining: 0, workers: 0 },
        { instanceId: "b5", buildingId: "fusion_reactor", x: 3, y: 1, hp: 300, buildRemaining: 0, workers: 0 },
        { instanceId: "b6", buildingId: "alloy_refinery", x: 2, y: 2, hp: 220, buildRemaining: 0, workers: 0 },
        { instanceId: "b7", buildingId: "supply_depot", x: 1, y: 3, hp: 180, buildRemaining: 0, workers: 0 },
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
  it("keeps a multi-type mid grid beside Greenland buildings without covering the label", () => {
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

    const lbl = labels[0]!;
    for (const u of units) {
      const ub = { x: u.x, y: u.y, w: u.size, h: u.size };
      expect(
        overlaps(ub, { x: lbl.x, y: lbl.y, w: lbl.w, h: lbl.h }, 0.15),
      ).toBe(false);
      for (const b of bldgs) {
        expect(
          overlaps(ub, { x: b.x, y: b.y, w: b.size, h: b.size }, 0.2),
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
        supplyStock: 0,
        trainingQueue: [],
        garrisonHp: {},
        control: "core",
        occupiedTurns: 0,
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

  it("keeps mid-zoom chips off long Asia/USA label glyphs", () => {
    const ids = ["china_west", "kazakhstan", "india_east", "usa_west"];
    const territories = ids.map((id) => TERRITORIES.find((t) => t.id === id)!);
    const state: Record<string, TerritoryState> = {};
    for (const t of territories) {
      state[t.id] = {
        owner: "player",
        population: 12,
        workers: 4,
        buildings: [],
        supplyStock: 0,
        trainingQueue: [],
        garrisonHp: {},
        control: "core",
        occupiedTurns: 0,
        garrison: { trooper: 5, hover_tank: 2 },
      };
    }
    // Mid zoom over central Asia / USA west.
    const cam = { x: 480, y: 90, w: 380, h: 190 };
    const zoomScale = cam.w / 1000;
    expect(miniZoomTier(zoomScale)).toBe("mid");
    const labels = territories.map((t) => ({
      id: t.id,
      x: t.label.x,
      y: t.label.y,
      // Approximate full-name widths at mid zoom.
      w: Math.max(22, t.name.length * 2.1),
      h: 8,
    }));
    const units = layoutUnitMinis(territories, state, zoomScale, cam, labels, []);
    for (const u of units) {
      const ub = { x: u.x, y: u.y, w: u.size, h: u.size };
      const lbl = labels.find((l) => l.id === u.territoryId)!;
      expect(
        overlaps(ub, { x: lbl.x, y: lbl.y, w: lbl.w, h: lbl.h }, 0.15),
      ).toBe(false);
    }
  });
});
