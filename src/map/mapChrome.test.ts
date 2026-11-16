import { describe, expect, it } from "vitest";
import { activateMap } from "../data/maps/activate";
import { TERRITORIES } from "../data/map/territories";
import {
  armyTerritoryIdSet,
  forceCompactUnitChrome,
  shouldShowBuildingMinis,
  shouldShowMapChrome,
} from "./mapChrome";

describe("mapChrome", () => {
  it("shows player, selected, neighbors, and march endpoints only", () => {
    activateMap("civil_war");
    const texas = TERRITORIES.find((t) => t.id === "texas")!;
    const neighborId = texas.neighbors[0]!;
    const neighbor = TERRITORIES.find((t) => t.id === neighborId)!;
    const far = TERRITORIES.find(
      (t) => t.id !== "texas" && t.id !== neighborId && !texas.neighbors.includes(t.id),
    )!;

    const focus = {
      humanId: "player" as const,
      selectedId: "texas",
      selectedNeighbors: new Set(texas.neighbors),
      armyTerritoryIds: armyTerritoryIdSet([
        {
          id: "a1",
          owner: "player",
          fromId: "texas",
          toId: far.id,
          force: [{ unitId: "trooper", count: 2 }],
          turnsRemaining: 1,
          totalTurns: 1,
        },
      ]),
    };

    expect(
      shouldShowMapChrome(texas, { owner: "player" } as never, focus),
    ).toBe(true);
    expect(
      shouldShowMapChrome(neighbor, { owner: "neutral" } as never, focus),
    ).toBe(true);
    expect(
      shouldShowMapChrome(far, { owner: "neutral" } as never, focus),
    ).toBe(true); // march destination
    const quiet = TERRITORIES.find(
      (t) =>
        t.id !== far.id &&
        t.id !== "texas" &&
        !texas.neighbors.includes(t.id),
    )!;
    expect(
      shouldShowMapChrome(quiet, { owner: "neutral" } as never, focus),
    ).toBe(false);

    // Buildings: player + selected only — not neutral neighbors.
    expect(
      shouldShowBuildingMinis(neighbor, { owner: "neutral" } as never, focus),
    ).toBe(false);
    expect(
      shouldShowBuildingMinis(texas, { owner: "player" } as never, focus),
    ).toBe(true);
    expect(
      forceCompactUnitChrome(neighbor, { owner: "neutral" } as never, focus),
    ).toBe(true);
  });
});
