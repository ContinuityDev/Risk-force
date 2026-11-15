import { describe, expect, it } from "vitest";
import {
  BATTLE_FIELD,
  clampToGround,
  clampToZone,
  isOnGround,
  mapBaseCellToBattle,
} from "./battleField";

describe("battleField ground plane", () => {
  it("clamps points onto the playable ground", () => {
    expect(isOnGround(-1, -1)).toBe(false);
    expect(isOnGround(7, 4)).toBe(true);
    const c = clampToGround(-5, 99);
    expect(isOnGround(c.x, c.y)).toBe(true);
  });

  it("maps base cells into the defender zone only", () => {
    const z = BATTLE_FIELD.defenderZone;
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 6; x++) {
        const p = mapBaseCellToBattle(x, y, 1, 1, 6, 5);
        expect(p.x).toBeGreaterThanOrEqual(z.x0);
        expect(p.x).toBeLessThanOrEqual(z.x1);
        expect(p.y).toBeGreaterThanOrEqual(z.y0);
        expect(p.y).toBeLessThanOrEqual(z.y1);
        expect(isOnGround(p.x, p.y)).toBe(true);
      }
    }
  });

  it("keeps attacker deploy clamps inside the deploy strip", () => {
    const z = BATTLE_FIELD.attackerDeploy;
    const p = clampToZone(0, 0, z);
    expect(p.x).toBeGreaterThanOrEqual(z.x0);
    expect(p.y).toBeGreaterThanOrEqual(z.y0);
    expect(isOnGround(p.x, p.y)).toBe(true);
  });
});
