import { describe, expect, it } from "vitest";
import { TERRITORIES } from "../data/map/territories";
import type { TerritoryState } from "../engine/state";
import {
  garrisonFingerprint,
  layoutTransitUnitMinis,
  layoutUnitMinis,
  unitPriority,
} from "./unitMinis";

function stubTs(
  partial: Partial<TerritoryState> & { garrison: Record<string, number> },
): TerritoryState {
  return {
    owner: "player",
    population: 10,
    workers: 2,
    buildings: [],
    supplyStock: 0,
    trainingQueue: [],
    garrisonHp: {},
    control: "core",
    occupiedTurns: 0,
    movedThisTurn: false,
    ...partial,
  };
}

describe("unitMinis", () => {
  it("ranks armor above infantry for equal counts", () => {
    expect(unitPriority("hover_tank", 2)).toBeGreaterThan(
      unitPriority("trooper", 2),
    );
  });

  it("places compact troop badges at world zoom and types when zoomed", () => {
    const territories = TERRITORIES.slice(0, 8);
    const state: Record<string, TerritoryState> = {};
    for (const t of territories) {
      state[t.id] = stubTs({
        garrison: { trooper: 5, hover_tank: 2, drone: 1 },
      });
    }
    const cam = { x: 0, y: 0, w: 1000, h: 500 };
    const labels = territories.map((t) => ({
      id: t.id,
      x: t.label.x,
      y: t.label.y,
      w: 20,
      h: 8,
    }));
    const world = layoutUnitMinis(territories, state, 1, cam, labels);
    expect(world.some((m) => m.compact)).toBe(true);

    const mid = layoutUnitMinis(
      territories,
      state,
      0.4,
      { x: 0, y: 0, w: 400, h: 200 },
      labels,
    );
    expect(mid.some((m) => !m.compact && m.unitId === "hover_tank")).toBe(true);
  });

  it("layouts transit armies along the route", () => {
    const a = TERRITORIES[0]!;
    const b = TERRITORIES.find((t) => t.id !== a.id)!;
    const minis = layoutTransitUnitMinis(
      [
        {
          id: "army_1",
          owner: "player",
          fromId: a.id,
          toId: b.id,
          force: [{ unitId: "trooper", count: 3 }],
          turnsRemaining: 2,
          totalTurns: 4,
        },
      ],
      TERRITORIES,
      0.35,
      { x: 0, y: 0, w: 1000, h: 500 },
    );
    expect(minis.length).toBeGreaterThan(0);
    expect(minis[0]?.transit).toBe(true);
  });

  it("emits nothing for empty or zero-count garrisons", () => {
    const t =
      TERRITORIES.find((x) => x.id === "morocco") ?? TERRITORIES[0]!;
    const cam = {
      x: t.label.x - 50,
      y: t.label.y - 25,
      w: 100,
      h: 50,
    };
    const labels = [
      { id: t.id, x: t.label.x, y: t.label.y, w: 16, h: 8 },
    ];
    expect(
      layoutUnitMinis(
        [t],
        { [t.id]: stubTs({ garrison: {} }) },
        0.4,
        cam,
        labels,
      ),
    ).toEqual([]);
    expect(
      layoutUnitMinis(
        [t],
        { [t.id]: stubTs({ garrison: { trooper: 0, hover_tank: 0 } }) },
        0.4,
        cam,
        labels,
      ),
    ).toEqual([]);
  });

  it("fingerprints garrison mutations", () => {
    const a = garrisonFingerprint({
      t1: stubTs({ garrison: { trooper: 2 } }),
    });
    const b = garrisonFingerprint({
      t1: stubTs({ garrison: { trooper: 3 } }),
    });
    expect(a).not.toBe(b);
  });
});
