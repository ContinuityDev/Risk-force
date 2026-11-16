import { describe, expect, it } from "vitest";
import { planAiTurn } from "./ai";
import {
  computeEnergyLedger,
  computeIncome,
  computeSupplyUpkeep,
} from "./economy";
import { createInitialState } from "./init";
import { reduce } from "./reducer";
import type { GameState } from "./state";

/** Advance one full round of player turns (humans end, AIs plan+apply). */
function advanceRound(state: GameState): GameState {
  let cur = state;
  const n = cur.playerOrder.length;
  for (let i = 0; i < n; i++) {
    const pid = cur.playerOrder[cur.activePlayerIndex]!;
    const player = cur.players[pid]!;
    if (player.eliminated) {
      cur = reduce(cur, { type: "END_TURN" });
      continue;
    }
    if (player.kind === "ai") {
      const actions = planAiTurn(cur);
      for (const a of actions) {
        cur = reduce(cur, a);
        if (cur.phase === "battle") {
          // Skip battles in the economy sim so turns keep advancing.
          cur = {
            ...cur,
            battle: null,
            phase: "play",
            screen: "map",
          };
          cur = reduce(cur, { type: "END_TURN" });
          break;
        }
        if (a.type === "END_TURN") break;
      }
      // Ensure rotation if AI returned no END_TURN (interrupted mid-plan)
      if (cur.playerOrder[cur.activePlayerIndex] === pid && cur.phase === "play") {
        cur = reduce(cur, { type: "END_TURN" });
      }
    } else {
      cur = reduce(cur, { type: "END_TURN" });
    }
  }
  return cur;
}

describe("economy balance sim", () => {
  it("one-start turn 1 energy net is clearly positive on both maps", () => {
    for (const mapId of ["world_war", "civil_war"] as const) {
      const state = createInitialState({
        humanCount: 1,
        aiCount: 2,
        multiplayerMode: "solo",
        seed: 42,
        mapId,
      });
      for (const pid of state.playerOrder) {
        const ledger = computeEnergyLedger(state, pid);
        expect(
          ledger.net,
          `${mapId} ${pid} net ${ledger.net} (income ${ledger.income} upkeep ${ledger.upkeep} camp ${ledger.campaign})`,
        ).toBeGreaterThanOrEqual(8);
        expect(
          ledger.income,
          `${mapId} ${pid} income should cover upkeep+campaign`,
        ).toBeGreaterThan(ledger.upkeep + ledger.campaign);
      }
    }
  });

  it("starts with sustainable ledger (income covers upkeep+campaign)", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 4242,
    });
    for (const pid of state.playerOrder) {
      const ledger = computeEnergyLedger(state, pid);
      expect(ledger.net).toBeGreaterThanOrEqual(0);
      const supply = state.players[pid]!.resources.supply;
      const supplyUp = computeSupplyUpkeep(state, pid);
      const supplyIn = computeIncome(state, pid).supply;
      expect(
        supply + supplyIn,
        `${pid} supply collapses immediately`,
      ).toBeGreaterThanOrEqual(supplyUp * 0.5);
    }
  });

  it("20 turns of default AI play — no bankruptcy in first 10 turns", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 91,
    });
    // Human sits passive; AIs act.
    for (let turn = 0; turn < 20; turn++) {
      state = advanceRound(state);
      if (turn < 10) {
        for (const pid of state.playerOrder) {
          const p = state.players[pid]!;
          if (p.eliminated) continue;
          expect(
            p.insolvent,
            `${pid} insolvent at sim turn ${turn + 1}`,
          ).toBe(false);
          expect(
            p.resources.energy,
            `${pid} energy ${p.resources.energy} at turn ${turn + 1}`,
          ).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("seed 77 hard start is energy-positive (capture-script NRG was a fake)", () => {
    const state = createInitialState({
      humanCount: 1,
      aiCount: 1,
      multiplayerMode: "solo",
      seed: 77,
      difficulty: "hard",
    });
    const ledger = computeEnergyLedger(state, "player");
    expect(ledger.net).toBeGreaterThanOrEqual(0);
  });
});
