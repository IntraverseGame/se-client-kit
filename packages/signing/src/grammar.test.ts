import { describe, expect, it } from "vitest";

import { SigningError } from "./errors.ts";
import { actionGrammar } from "./grammar.ts";

describe("actionGrammar", () => {
  it("spells the worked round's moves and cash-out as the vectors do", () => {
    expect(actionGrammar.pick([0], 2)).toEqual({
      action: "pick row 0 tile 2",
      path: [0],
    });
    expect(actionGrammar.pick([0, 1], 2)).toEqual({
      action: "pick row 1 tile 2",
      path: [0, 1],
    });
    expect(actionGrammar.pick([0, 1, 2], 2).action).toBe("pick row 2 tile 2");
    expect(actionGrammar.cashOut([0, 1, 2])).toEqual({
      action: "cash out",
      path: [0, 1, 2],
    });
  });

  it("spells a cancel with an empty path", () => {
    expect(actionGrammar.cancel()).toEqual({ action: "cancel", path: [] });
  });

  it("derives the row from the path: r = len(path) - 1", () => {
    const path = Array.from({ length: 13 }, (_, node) => node);
    expect(actionGrammar.pick(path, 0).action).toBe("pick row 12 tile 0");
  });

  it("copies and freezes the path", () => {
    const path = [0, 1];
    const move = actionGrammar.pick(path, 1);
    path.push(2);
    expect(move.path).toEqual([0, 1]);
    expect(Object.isFrozen(move)).toBe(true);
    expect(Object.isFrozen(move.path)).toBe(true);
  });

  it("refuses a move with no node played", () => {
    expect(() => actionGrammar.pick([], 0)).toThrow(SigningError);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "refuses the tile %d",
    value => {
      expect(() => actionGrammar.pick([0], value)).toThrow(SigningError);
    },
  );

  it.each([-1, 1.5, Number.NaN, 256])("refuses the node id %d", value => {
    expect(() => actionGrammar.pick([value], 0)).toThrow(SigningError);
    expect(() => actionGrammar.cashOut([value])).toThrow(SigningError);
  });
});
