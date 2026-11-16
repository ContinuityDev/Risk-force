import { describe, expect, it } from "vitest";
import {
  groundedBuildingFootprint,
  groundedUnitFootprint,
  isGroundedChrome,
  muteFactionColor,
  shadowHugsFoot,
  visibleFootY,
} from "./groundedChrome";

describe("groundedChrome", () => {
  it("unit footprint uses elliptical shadow and pill count tag (no disc)", () => {
    const fp = groundedUnitFootprint(6, 0.25, { count: 4, compact: true });
    expect(isGroundedChrome(fp)).toBe(true);
    expect(fp.shadow.ry).toBeLessThan(fp.shadow.rx);
    expect(fp.countTag).not.toBeNull();
    // Pill: wider than tall — not a circle badge.
    expect(fp.countTag!.w).toBeGreaterThan(fp.countTag!.h);
    // No separate faction stripe below the piece.
    expect(fp.groundLine.strokeW).toBe(0);
    // Sprite base overlaps its contact shadow.
    expect(shadowHugsFoot(fp)).toBe(true);
    expect(visibleFootY(fp)).toBeLessThanOrEqual(
      fp.shadow.cy + fp.shadow.ry + 0.35,
    );
  });

  it("building footprint hugs the clipped plinth foot; progress is a bar", () => {
    const fp = groundedBuildingFootprint(7, 0.3, {
      constructing: true,
      progress: 0.5,
      compact: false,
    });
    expect(isGroundedChrome(fp)).toBe(true);
    expect(fp.progressBar).not.toBeNull();
    expect(fp.progressBar!.w).toBeGreaterThan(0);
    expect(fp.countTag).toBeNull();
    expect(fp.groundLine.strokeW).toBe(0);
    expect(shadowHugsFoot(fp)).toBe(true);
    // Foot inset accounts for clipped building plinth.
    expect(fp.footInset).toBeGreaterThan(0);
  });

  it("muteFactionColor blends toward slate", () => {
    const muted = muteFactionColor("#33ee88", 0.4);
    expect(muted).toMatch(/^#[0-9a-f]{6}$/i);
    expect(muted.toLowerCase()).not.toBe("#33ee88");
  });

  it("keeps geometry positive across zoom tiers", () => {
    for (const z of [1, 0.7, 0.4, 0.2, 0.1]) {
      const u = groundedUnitFootprint(4, z, { count: 2 });
      const b = groundedBuildingFootprint(4, z, { count: 3, compact: true });
      expect(u.hit.w).toBeGreaterThan(0);
      expect(b.hit.h).toBeGreaterThan(0);
      expect(isGroundedChrome(u)).toBe(true);
      expect(isGroundedChrome(b)).toBe(true);
      expect(shadowHugsFoot(u)).toBe(true);
      expect(shadowHugsFoot(b)).toBe(true);
    }
  });

  it("shadow is tight (footprint-width) and offset slightly to light", () => {
    const fp = groundedUnitFootprint(8, 0.4, { count: 3 });
    expect(fp.shadow.rx).toBeLessThan(8 * 0.45);
    expect(fp.shadow.ry).toBeLessThan(fp.shadow.rx * 0.35);
    expect(fp.shadow.cx).toBeGreaterThan(0);
  });
});
