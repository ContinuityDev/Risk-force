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

  it("keeps garrison inside defender zone, clear of NML and deploy", () => {
    expect(BATTLE_FIELD.garrisonZone.x0).toBeGreaterThanOrEqual(
      BATTLE_FIELD.defenderZone.x0,
    );
    expect(BATTLE_FIELD.garrisonZone.x0).toBeGreaterThanOrEqual(
      BATTLE_FIELD.noMansLand.x1 - 0.01,
    );
    expect(BATTLE_FIELD.garrisonZone.x1).toBeLessThan(
      BATTLE_FIELD.defenderZone.x1,
    );
    expect(BATTLE_FIELD.attackerDeploy.x1).toBeLessThanOrEqual(
      BATTLE_FIELD.noMansLand.x0 + 0.01,
    );
  });
});


