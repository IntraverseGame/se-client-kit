// @vitest-environment node
import { describe, expect, it } from "vitest";

import { testOnlyEntryGuard } from "../test-only-entry-guard.ts";

// The guard reads every module's source. It must stay fast on hostile input
// (an unterminated quote followed by many escaped quotes took about 15 seconds
// with the old regex-over-text scan) and on a large legitimate module. The
// bounds are generous: they catch a return to quadratic behavior, not a slow
// machine.

type Transform = (code: string, id: string) => unknown;

const runTransform = (code: string, id: string): void => {
  const transform = testOnlyEntryGuard().transform as Transform;
  try {
    transform(code, id);
  } catch {
    // A module the guard cannot parse is refused with an error; only the time
    // it takes to decide is under test here.
  }
};

const timed = (action: () => void): number => {
  const start = performance.now();
  action();
  return performance.now() - start;
};

describe("the Wrapper guard's source check is fast", () => {
  it("handles an unterminated quote followed by many escaped quotes", () => {
    const hostile = `const s = "${'\\"'.repeat(80_000)}`;
    expect(timed(() => runTransform(hostile, "/src/hostile.ts"))).toBeLessThan(
      2000,
    );
  });

  it("handles the same input in a CSS module", () => {
    const hostile = `a::after { content: "${'\\"'.repeat(80_000)}`;
    expect(timed(() => runTransform(hostile, "/src/hostile.css"))).toBeLessThan(
      2000,
    );
  });

  it("handles a large legitimate module", () => {
    const large = Array.from(
      { length: 30_000 },
      (_, index) =>
        `export const value${String(index)}: string = "text ${String(index)}";`,
    ).join("\n");
    expect(timed(() => runTransform(large, "/src/large.ts"))).toBeLessThan(
      5000,
    );
  });
});
