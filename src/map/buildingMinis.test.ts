import { describe, expect, it } from "vitest";
import { TERRITORIES } from "../data/map/territories";
import type { TerritoryState } from "../engine/state";
import {
  buildingPriority,
  buildingsFingerprint,
  layoutBuildingMinis,
  miniZoomTier,
  targetScreenPx,
} from "./buildingMinis";

function stubTerritory(
  partial: Partial<TerritoryState> & { owner: TerritoryState["owner"] },
): TerritoryState {
  return {
    owner: partial.owner,
    buildings: partial.buildings ?? [],
    garrison: partial.garrison ?? {},
    garrisonHp: partial.garrisonHp ?? {},
    population: partial.population ?? 10,
    workers: partial.workers ?? 4,
    supplyStock: partial.supplyStock ?? 0,
    trainingQueue: partial.trainingQueue ?? [],
    control: partial.control ?? "core",
    occupiedTurns: partial.occupiedTurns ?? 0,
    movedThisTurn: partial.movedThisTurn ?? false,
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

  it("grows on-screen size with zoom-in and clamps", () => {
    // world compact stays small; deep zoom reads larger (deep world-unit cap
    // keeps clusters fitting beside labels, so mid may still floor at 10px).
    expect(targetScreenPx(1)).toBeLessThanOrEqual(14);
    expect(targetScreenPx(0.1)).toBeGreaterThan(targetScreenPx(1));
    expect(targetScreenPx(0.1)).toBeGreaterThanOrEqual(22);
    expect(targetScreenPx(0.08)).toBeLessThanOrEqual(40);
  });

  it("places compact markers at world zoom and clusters when zoomed in", () => {
    // Prefer a large continental plot so a mid-zoom cluster of 3 fits inland.
    const tid =
      TERRITORIES.find((t) => t.id === "china_east")?.id ??
      TERRITORIES.find((t) => t.area > 0.05)?.id ??
      TERRITORIES[0]!.id;
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
    // World zoom leaves the pole to unit strength chips (no building pads).
    expect(world).toEqual([]);

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
    const deepIcons = deep.filter((m) => !m.more && !m.compact);
    expect(deepIcons.length).toBe(4);
    // Deep icons should be large enough to read (~screenPx * scale)
    expect(deepIcons[0]!.size).toBeGreaterThan(4);
  });

  it("falls back to a compact marker when the cluster cannot fit", () => {
    const tid =
      TERRITORIES.find((t) => t.id === "china_east")?.id ??
      TERRITORIES.find((t) => t.area > 0.05)?.id ??
      TERRITORIES[0]!.id;
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
            workers: 1,
          },
          {
            instanceId: "b",
            buildingId: "reactor",
            x: 1,
            y: 0,
            hp: 200,
            buildRemaining: 0,
            workers: 1,
          },
        ],
      }),
    };
    // Label over the pole blocks a full cluster but leaves land beside/below
    // for a single compact chip (hard keep-out — never cover the name).
    const blockingLabel = {
      id: tid,
      x: tdef.label.x,
      y: tdef.label.y,
      w: 28,
      h: 6,
    };
    const mid = layoutBuildingMinis(
      [tdef],
      state,
      0.5,
      { x: tdef.label.x - 200, y: tdef.label.y - 100, w: 400, h: 200 },
      [blockingLabel],
    );
    expect(mid.length).toBeGreaterThan(0);
    expect(mid.some((m) => m.compact || m.buildingId === "command_nexus")).toBe(
      true,
    );

    // Territory-filling label → emit nothing rather than overlapping the name.
    const giantLabel = {
      id: tid,
      x: tdef.label.x,
      y: tdef.label.y,
      w: 80,
      h: 60,
    };
    expect(
      layoutBuildingMinis(
        [tdef],
        state,
        0.5,
        { x: tdef.label.x - 200, y: tdef.label.y - 100, w: 400, h: 200 },
        [giantLabel],
      ),
    ).toEqual([]);
  });

  it("emits nothing for empty or razed buildings (seed-77 Maghreb outposts)", async () => {
    const { createInitialState } = await import("../engine/init");
    let state = createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 77,
    });
    // Strip neutral starter emplacements so these plots are truly empty.
    const cleared = { ...state.territories };
    for (const id of ["morocco", "tunisia", "france"] as const) {
      cleared[id] = { ...cleared[id]!, buildings: [] };
    }
    state = { ...state, territories: cleared };
    for (const id of ["morocco", "tunisia", "france"] as const) {
      expect(state.territories[id]?.buildings ?? []).toEqual([]);
    }
    // Algeria may be a faction core or neutral with light defenses after one-start.
    expect(state.territories.algeria).toBeTruthy();

    const focus = TERRITORIES.filter((t) =>
      ["morocco", "tunisia", "algeria", "france"].includes(t.id),
    );
    const labels = focus.map((t) => ({
      id: t.id,
      x: t.label.x,
      y: t.label.y,
      w: 18,
      h: 8,
    }));
    const cam = { x: 450, y: 100, w: 120, h: 80 };
    for (const zoom of [1, 0.5, 0.2]) {
      const minis = layoutBuildingMinis(
        focus,
        state.territories,
        zoom,
        cam,
        labels,
      );
      expect(minis.every((m) => m.territoryId === "algeria")).toBe(true);
      expect(minis.some((m) => m.territoryId === "morocco")).toBe(false);
      expect(minis.some((m) => m.territoryId === "tunisia")).toBe(false);
    }

    const razed: Record<string, TerritoryState> = {
      algeria: stubTerritory({
        owner: "player",
        buildings: [
          {
            instanceId: "dead",
            buildingId: "command_nexus",
            x: 0,
            y: 0,
            hp: 0,
            buildRemaining: 0,
            workers: 0,
          },
        ],
      }),
    };
    expect(
      layoutBuildingMinis(
        focus.filter((t) => t.id === "algeria"),
        razed,
        0.5,
        cam,
        labels.filter((l) => l.id === "algeria"),
      ),
    ).toEqual([]);
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
