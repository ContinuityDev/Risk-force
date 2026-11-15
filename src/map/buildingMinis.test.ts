import { describe, expect, it } from "vitest";
import { TERRITORIES } from "../data/map/territories";
import type { TerritoryState } from "../engine/state";
import {
  buildingPriority,
  buildingsFingerprint,
  layoutBuildingMinis,
  miniZoomTier,
} from "./buildingMinis";

function stubTerritory(
  partial: Partial<TerritoryState> & { owner: TerritoryState["owner"] },
): TerritoryState {
  return {
    owner: partial.owner,
    buildings: partial.buildings ?? [],
    garrison: partial.garrison ?? {},
    population: partial.population ?? 10,
    workers: partial.workers ?? 4,
    supplyStock: partial.supplyStock ?? 0,
    trainingQueue: partial.trainingQueue ?? [],
  };
}

describe("buildingMinis", () => {
  it("ranks command nexus above economy and defenses", () => {
    expect(buildingPriority("command_nexus")).toBeGreaterThan(
      buildingPriority("reactor"),
    );
    expect(buildingPriority("reactor")).toBeGreaterThan(
      buildingPriority("laser_turret"),
    );
  });

  it("picks zoom tiers from scale", () => {
    expect(miniZoomTier(1)).toBe("world");
    expect(miniZoomTier(0.5)).toBe("mid");
    expect(miniZoomTier(0.2)).toBe("deep");
  });

  it("places compact markers at world zoom and rows when zoomed in", () => {
    const tid = TERRITORIES.find((t) => t.area > 0.01)?.id ?? TERRITORIES[0]!.id;
    const tdef = TERRITORIES.find((t) => t.id === tid)!;
    const state: Record<string, TerritoryState> = {
      [tid]: stubTerritory({
        owner: "player",
        buildings: [
          {
            instanceId: "a",
            buildingId: "command_nexus",
            x: 0,
            y: 0,
            hp: 400,
            buildRemaining: 0,
            workers: 2,
          },
          {
            instanceId: "b",
            buildingId: "reactor",
            x: 1,
            y: 0,
            hp: 200,
            buildRemaining: 1,
            workers: 1,
          },
          {
            instanceId: "c",
            buildingId: "barracks",
            x: 2,
            y: 0,
            hp: 200,
            buildRemaining: 0,
            workers: 0,
          },
          {
            instanceId: "d",
            buildingId: "laser_turret",
            x: 0,
            y: 1,
            hp: 150,
            buildRemaining: 0,
            workers: 0,
          },
        ],
      }),
    };

    const world = layoutBuildingMinis(
      [tdef],
      state,
      0.92,
      { x: 0, y: 0, w: 1000, h: 500 },
      [],
    );
    expect(world.some((m) => m.compact && m.count === 4)).toBe(true);

    const midCam = {
      x: tdef.label.x - 225,
      y: tdef.label.y - 112,
      w: 450,
      h: 225,
    };
    const mid = layoutBuildingMinis([tdef], state, 0.45, midCam, []);
    const midIcons = mid.filter((m) => !m.more && !m.compact);
    expect(midIcons.length).toBe(3);
    expect(mid.some((m) => m.more === 1)).toBe(true);
    expect(midIcons.some((m) => m.constructing)).toBe(true);

    const deep = layoutBuildingMinis(
      [tdef],
      state,
      0.15,
      { x: tdef.label.x - 40, y: tdef.label.y - 40, w: 150, h: 75 },
      [],
    );
    expect(deep.filter((m) => !m.more).length).toBe(4);
  });

  it("fingerprints building mutations including construction", () => {
    const a = buildingsFingerprint({
      t1: stubTerritory({
        owner: "player",
        buildings: [
          {
            instanceId: "x",
            buildingId: "reactor",
            x: 0,
            y: 0,
            hp: 100,
            buildRemaining: 2,
            workers: 0,
          },
        ],
      }),
    });
    const b = buildingsFingerprint({
      t1: stubTerritory({
        owner: "player",
        buildings: [
          {
            instanceId: "x",
            buildingId: "reactor",
            x: 0,
            y: 0,
            hp: 100,
            buildRemaining: 1,
            workers: 0,
          },
        ],
      }),
    });
    expect(a).not.toEqual(b);
  });
});
