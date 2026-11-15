import { describe, expect, it } from "vitest";
import {
  angleToDirFrame,
  deltaToDirFrame,
  facingFromDelta,
  stepFacing,
  wrapAngle,
} from "./facing";

describe("angleToDirFrame", () => {
  it("maps cardinals to 8-dir frames (0=+X east)", () => {
    // 0° east
    expect(angleToDirFrame(0, 8)).toBe(0);
    // 90° south (+Y down)
    expect(angleToDirFrame(Math.PI / 2, 8)).toBe(2);
    // 180° west
    expect(angleToDirFrame(Math.PI, 8)).toBe(4);
    // -90° / 270° north
    expect(angleToDirFrame(-Math.PI / 2, 8)).toBe(6);
  });

  it("maps diagonals to odd frames", () => {
    expect(angleToDirFrame(Math.PI / 4, 8)).toBe(1);
    expect(angleToDirFrame((3 * Math.PI) / 4, 8)).toBe(3);
    expect(angleToDirFrame((-3 * Math.PI) / 4, 8)).toBe(5);
    expect(angleToDirFrame(-Math.PI / 4, 8)).toBe(7);
  });

  it("wraps past ±π consistently", () => {
    expect(angleToDirFrame(Math.PI * 2, 8)).toBe(0);
    expect(angleToDirFrame(-Math.PI, 8)).toBe(4);
  });

  it("supports 16 directions", () => {
    expect(angleToDirFrame(0, 16)).toBe(0);
    expect(angleToDirFrame(Math.PI / 2, 16)).toBe(4);
    expect(angleToDirFrame(Math.PI, 16)).toBe(8);
  });

  it("single direction always returns 0", () => {
    expect(angleToDirFrame(1.23, 1)).toBe(0);
  });
});

describe("deltaToDirFrame", () => {
  it("faces right / left / down / up from deltas", () => {
    expect(deltaToDirFrame(1, 0, 8)).toBe(0);
    expect(deltaToDirFrame(0, 1, 8)).toBe(2);
    expect(deltaToDirFrame(-1, 0, 8)).toBe(4);
    expect(deltaToDirFrame(0, -1, 8)).toBe(6);
  });

  it("zero delta defaults to east frame", () => {
    expect(deltaToDirFrame(0, 0, 8)).toBe(0);
  });
});

describe("stepFacing", () => {
  it("approaches desired without overshooting on small steps", () => {
    const next = stepFacing(0, 0.2, 1 / 60, 5.5);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThanOrEqual(0.2);
  });

  it("takes the short way around", () => {
    const next = stepFacing(3.0, -3.0, 0.5, 10);
    // Should go toward ±π, not through 0
    expect(Math.abs(wrapAngle(next))).toBeGreaterThan(2.5);
  });
});

describe("facingFromDelta", () => {
  it("matches atan2(dy, dx)", () => {
    expect(facingFromDelta(2, 2)).toBeCloseTo(Math.PI / 4);
  });
});
