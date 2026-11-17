import { describe, expect, it } from "vitest";
import { getTerritory } from "../data/map/territories";
import { activateMap } from "../data/maps/activate";

/**
 * Occupation sheet must title the *captured* territory, not the attack origin.
 * (Regression: capture screenshot once showed "Secure Indonesia" after a
 * march from Indonesia onto New Guinea.)
 */
describe("capture occupation title", () => {
  it("resolves the captured territory id to its display name", () => {
    activateMap("world_war");
    const capturedId = "papua_new_guinea";
    const originId = "indonesia";
    expect(capturedId).not.toBe(originId);
    const name = getTerritory(capturedId).name;
    expect(name.toLowerCase()).toContain("guinea");
    expect(name.toLowerCase()).not.toBe(
      getTerritory(originId).name.toLowerCase(),
    );
  });
});
