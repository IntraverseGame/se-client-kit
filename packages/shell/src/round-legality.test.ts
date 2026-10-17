// W-23 and W-24 legality, each check on its own: the Snapshot must be the
// round's `active` one at the shell's own progress, the step picked the next
// one, and the option in range.

import { describe, expect, it } from "vitest";

import { snapshot } from "./fixtures/vectors.ts";
import { isPick, legalCashOut, legalMove } from "./round-legality.ts";

// The fixture's round: three steps (indexes 0, 1, 2) of 3, 3, and 4 options.
const AT_ONE = snapshot("active", { step: 1 });

describe("legalMove", () => {
  it("builds the move at the shell's own progress", () => {
    expect(legalMove(AT_ONE, 1, { step: 1, option: 2 })).toEqual({
      legal: true,
      request: { kind: "action", action: "pick row 1 tile 2", path: [0, 1] },
      row: 1,
    });
  });

  it("refuses a Snapshot behind or ahead of the moves the shell saw applied", () => {
    expect(legalMove(AT_ONE, 0, { step: 1, option: 0 })).toEqual({
      legal: false,
      reason: "not_legal",
    });
    expect(legalMove(AT_ONE, 2, { step: 1, option: 0 })).toEqual({
      legal: false,
      reason: "not_legal",
    });
    // The step the shell's own progress names, in a Snapshot at another step.
    expect(legalMove(AT_ONE, 0, { step: 0, option: 0 })).toEqual({
      legal: false,
      reason: "not_legal",
    });
    expect(legalMove(AT_ONE, 2, { step: 2, option: 0 })).toEqual({
      legal: false,
      reason: "not_legal",
    });
  });

  it("refuses another step, and an option out of range", () => {
    expect(legalMove(AT_ONE, 1, { step: 2, option: 0 }).legal).toBe(false);
    expect(legalMove(AT_ONE, 1, { step: 1, option: 3 }).legal).toBe(false);
  });

  it("refuses a round that is not active", () => {
    expect(legalMove(snapshot("won"), 1, { step: 1, option: 0 })).toEqual({
      legal: false,
      reason: "not_active",
    });
    expect(legalMove(undefined, 0, { step: 0, option: 0 }).legal).toBe(false);
  });
});

describe("legalCashOut", () => {
  it("cashes out over the steps survived", () => {
    expect(legalCashOut(AT_ONE, 1)).toEqual({
      legal: true,
      request: { kind: "cash-out", action: "cash out", path: [0] },
      row: 1,
    });
  });

  it("refuses before a step is survived, and off the shell's progress", () => {
    expect(legalCashOut(snapshot("active", { step: 0 }), 0).legal).toBe(false);
    expect(legalCashOut(AT_ONE, 0).legal).toBe(false);
  });
});

describe("isPick", () => {
  it.each([
    [{ step: 0, option: 1 }, true],
    [{ step: -1, option: 1 }, false],
    [{ step: 0 }, false],
    [null, false],
  ])("%j is a pick: %s", (value, expected) => {
    expect(isPick(value)).toBe(expected);
  });
});
