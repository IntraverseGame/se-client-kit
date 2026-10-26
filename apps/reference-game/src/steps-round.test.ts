// The steps round the game reads from a Snapshot that is not Coin Flip: Cash or
// Crash `[3,3,4]`, row by row. A round takes a pick only while it is active, on
// the Snapshot's row, with no tile picked in it.

import type { GameStep } from "@intraverse/se-client-shell/controller";
import { describe, expect, it } from "vitest";

import { CASH_OR_CRASH } from "./fixtures/cash-or-crash.ts";
import { stepsRound } from "./steps-round.ts";

const pickInSecondRow = (step: GameStep): GameStep =>
  step.index === 1 ? { ...step, selectedIndex: 0 } : step;

/** `CASH_OR_CRASH.active` with a tile already picked in the row being played. */
const picked = {
  ...CASH_OR_CRASH.active,
  config: {
    kind: "steps",
    steps: CASH_OR_CRASH.active.config.steps.map(pickInSecondRow),
  },
} as const;

describe("stepsRound", () => {
  it("reads the rows and the row being played", () => {
    const round = stepsRound(CASH_OR_CRASH.active);
    expect(round?.steps.map(step => step.optionCount)).toEqual([3, 3, 4]);
    expect(round).toMatchObject({
      status: "active",
      step: 1,
      currentMultiplier: 1.455,
      open: true,
      expired: false,
    });
  });

  it.each<[keyof typeof CASH_OR_CRASH, boolean]>([
    ["idle", false],
    ["active", true],
    ["resolving", false],
    ["lost", false],
    ["wonByCashOut", false],
    ["wonExpired", false],
  ])("%s: open is %s", (name, open) => {
    expect(stepsRound(CASH_OR_CRASH[name])?.open).toBe(open);
  });

  it("is not open on a row whose tile is already picked", () => {
    expect(stepsRound(picked)?.open).toBe(false);
  });

  it("knows a round the time limit ended", () => {
    expect(stepsRound(CASH_OR_CRASH.wonExpired)?.expired).toBe(true);
  });

  it("has no round without rows", () => {
    expect(
      stepsRound({
        ...CASH_OR_CRASH.active,
        config: { kind: "steps", steps: [] },
      }),
    ).toBeUndefined();
  });

  it("is a frozen copy", () => {
    expect(Object.isFrozen(stepsRound(CASH_OR_CRASH.active))).toBe(true);
  });
});
