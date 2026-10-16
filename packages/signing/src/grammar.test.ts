import { describe, expect, it } from "vitest";

import { SigningError } from "./errors.ts";
import { provisionalGrammar } from "./grammar.ts";

describe("provisionalGrammar", () => {
  it("spells a pick and a cash-out as the vectors do", () => {
    expect(provisionalGrammar.pick(0, 2)).toBe("pick row 0 tile 2");
    expect(provisionalGrammar.pick(12, 0)).toBe("pick row 12 tile 0");
    expect(provisionalGrammar.cashOut()).toBe("cash out");
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "refuses the index %d",
    value => {
      expect(() => provisionalGrammar.pick(value, 0)).toThrow(SigningError);
      expect(() => provisionalGrammar.pick(0, value)).toThrow(SigningError);
    },
  );
});
