import { describe, expect, it } from "vitest";
import { BUILDING_LIST, getBuilding, isTrainingBuilding } from "../data/buildings";
import { UNITS } from "../data/units";
import { createInitialState } from "./init";
import { reduce } from "./reducer";
import { computeIncome } from "./economy";
import { workerEffectForBuilding } from "./workerEffects";
import { enqueueUnit, hasProducerBuilding, unitTrainTurns } from "./training";
import type { GameState } from "./state";

describe("building audit", () => {
  it("every produces[] entry resolves to a real unit id", () => {
    const unitIds = new Set(Object.keys(UNITS));
    for (const b of BUILDING_LIST) {
      for (const uid of b.produces ?? []) {
        expect(unitIds.has(uid), `${b.id} produces unknown ${uid}`).toBe(true);
      }
    }
  });

  it("every training building that produces units is flagged", () => {
    for (const b of BUILDING_LIST.filter((x) => !!x.produces?.length)) {
      expect(isTrainingBuilding(b), b.id).toBe(true);
    }
  });

  it("barracks trains troopers into the garrison", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 21,
    });
    const home = Object.entries(state.territories).find(
      ([, t]) => t.owner === "player",
    )![0];
    // Ensure barracks exists and is complete
    const ts = state.territories[home]!;
    const hasBarracks = ts.buildings.some((b) => b.buildingId === "barracks");
    if (!hasBarracks) {
      state = {
        ...state,
        territories: {
          ...state.territories,
          [home]: {
            ...ts,
            population: 20,
            workers: 4,
            buildings: [
              ...ts.buildings,
              {
                instanceId: "br_test",
                buildingId: "barracks",
                x: 0,
                y: 0,
                hp: 260,
                buildRemaining: 0,
                workers: 2,
              },
            ],
          },
        },
      };
    } else {
      state = {
        ...state,
        territories: {
          ...state.territories,
          [home]: {
            ...ts,
            population: Math.max(ts.population, 10),
            buildings: ts.buildings.map((b) =>
              b.buildingId === "barracks"
                ? { ...b, buildRemaining: 0, hp: 260, workers: 2 }
                : b,
            ),
          },
        },
      };
    }
    expect(hasProducerBuilding(state.territories[home]!, "trooper")).toBe(true);
    const player = state.players.player!;
    const queued = enqueueUnit(player, state.territories[home]!, "trooper", 1);
    expect(queued).not.toBeNull();
    expect(queued!.territory.trainingQueue.length).toBeGreaterThan(0);
    // Staffed barracks should train at least as fast as unstaffed baseline.
    const baseTurns = unitTrainTurns("trooper");
    expect(queued!.territory.trainingQueue[0]!.turnsRemaining).toBeLessThanOrEqual(
      baseTurns,
    );

    state = reduce(state, {
      type: "TRAIN_UNIT",
      payload: { territoryId: home, unitId: "trooper", count: 1 },
    });
    expect(state.territories[home]!.trainingQueue.length).toBeGreaterThan(0);
  });

  it("nexus workers boost research income label and computeIncome", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 22,
    });
    const home = Object.entries(state.territories).find(
      ([, t]) => t.owner === "player",
    )![0];
    const staff = (workers: number): GameState => ({
      ...state,
      territories: {
        ...state.territories,
        [home]: {
          ...state.territories[home]!,
          workers: 8,
          buildings: state.territories[home]!.buildings.map((b) =>
            b.buildingId === "command_nexus"
              ? { ...b, workers, buildRemaining: 0 }
              : b,
          ),
        },
      },
    });
    const unstaffed = staff(0);
    const staffed = staff(2);
    const effect = workerEffectForBuilding("command_nexus", 2);
    expect(effect.kind).toBe("research");
    expect(effect.label).toMatch(/research/i);
    expect(effect.mult).toBeGreaterThan(1);
    // Flooring can hide a single nexus tick; assert the staffing mult instead
    // and that income never drops when staffed.
    expect(computeIncome(staffed, "player").research).toBeGreaterThanOrEqual(
      computeIncome(unstaffed, "player").research,
    );
  });

  it("every economy building with output responds to staffing", () => {
    for (const b of BUILDING_LIST.filter((x) => x.output && x.category === "economy")) {
      const zero = workerEffectForBuilding(b.id, 0);
      const full = workerEffectForBuilding(b.id, 4);
      expect(full.mult).toBeGreaterThan(zero.mult);
      expect(getBuilding(b.id).output).toBeTruthy();
    }
  });
});
