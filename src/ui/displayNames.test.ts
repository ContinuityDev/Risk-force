import { describe, expect, it } from "vitest";
import {
  factionDisplayName,
  formatUnitCount,
  formatUnitRange,
  reconModeDisplayName,
  roleDisplayName,
  strikeDisplayName,
  territoryDisplayName,
  unitDisplayName,
} from "./displayNames";

describe("displayNames", () => {
  it("maps units, territories, and factions to readable labels", () => {
    expect(unitDisplayName("trooper")).toBe("Power Trooper");
    expect(unitDisplayName("hover_tank")).toMatch(/Hover/i);
    expect(unitDisplayName("aa_tank")).toMatch(/AA|Anti/i);
    expect(territoryDisplayName("north_korea")).toMatch(/Korea/i);
    expect(factionDisplayName("faction_a")).toBe("Faction A");
    expect(formatUnitRange("trooper", 3, 7)).toBe("Power Trooper×3–7");
    expect(formatUnitCount("hover_tank", 2)).toMatch(/×2$/);
    expect(strikeDisplayName("cruise")).toMatch(/Cruise/i);
    expect(reconModeDisplayName("drone")).toMatch(/drone/i);
    expect(roleDisplayName("infantry")).toBe("Infantry");
  });
});
