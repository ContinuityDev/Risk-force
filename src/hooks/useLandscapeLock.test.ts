import { describe, expect, it } from "vitest";
import { isTouchDevice } from "./useLandscapeLock";

describe("useLandscapeLock helpers", () => {
  it("isTouchDevice is false in jsdom (no coarse pointer)", () => {
    expect(isTouchDevice()).toBe(false);
  });
});
