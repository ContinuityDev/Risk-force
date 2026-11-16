import { describe, expect, it } from "vitest";
import { createInitialState } from "./init";
import { checkEliminationsAndVictory } from "./victory";

describe("victory / elimination", () => {
  it("eliminates a faction with no territories and crowns sole owner of all land", () => {
    let state = createInitialState({
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 2,
    });
    // Give everything (including neutrals) to player
    const territories = { ...state.territories };
    for (const id of Object.keys(territories)) {
      territories[id] = { ...territories[id]!, owner: "player" };
    }
    state = checkEliminationsAndVictory({ ...state, territories });
    expect(state.players.faction_a?.eliminated).toBe(true);
    expect(state.players.faction_b?.eliminated).toBe(true);
    expect(state.winner).toBe("player");
    expect(state.phase).toBe("ended");
    expect(state.screen).toBe("victory");
  });
});
