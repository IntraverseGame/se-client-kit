// T-31's configuration half, the optional `autoplay` field (RFC-005 section 6,
// specs/wrapper.md, Configuration): without it there is no autoplay (fail
// closed); a well-formed one is kept, frozen; a malformed one refuses the
// whole document as `invalid-autoplay`, naming the field only. The verify page
// judges the same documents alike (tools/config-parity.test.ts, V-3).

import { describe, expect, it } from "vitest";

import {
  type EnvironmentConfig,
  validateEnvironmentConfig,
} from "./environment-config.ts";
import { environmentDocument, SE_ORIGIN } from "./fixtures/environment.ts";

/** The accepted document's configuration; a refusal fails the test. */
const configOf = (
  result: ReturnType<typeof validateEnvironmentConfig>,
): EnvironmentConfig => {
  if (!result.ok) throw new Error("refused");
  return result.config;
};

const autoplayOf = (
  config: EnvironmentConfig,
): NonNullable<EnvironmentConfig["autoplay"]> => {
  if (config.autoplay === undefined) throw new Error("no autoplay");
  return config.autoplay;
};

const validate = (autoplay: unknown) =>
  validateEnvironmentConfig(environmentDocument({ autoplay }), SE_ORIGIN);

describe("the autoplay field (T-31)", () => {
  it("is absent from a document without it: no autoplay", () => {
    expect(
      configOf(validateEnvironmentConfig(environmentDocument(), SE_ORIGIN))
        .autoplay,
    ).toBeUndefined();
  });

  it("keeps a well-formed field, frozen", () => {
    const result = validate({ counts: [10, 25, 50, 100], minIntervalMs: 2500 });
    expect(result).toMatchObject({
      ok: true,
      config: { autoplay: { counts: [10, 25, 50, 100], minIntervalMs: 2500 } },
    });
    const autoplay = autoplayOf(configOf(result));
    expect(Object.isFrozen(autoplay)).toBe(true);
    expect(Object.isFrozen(autoplay.counts)).toBe(true);
  });

  it.each([
    ["not an object", [10]],
    ["null", null],
    ["no counts", { minIntervalMs: 2500 }],
    ["no interval", { counts: [10] }],
    ["an extra field", { counts: [10], minIntervalMs: 2500, turbo: true }],
    ["no count", { counts: [], minIntervalMs: 2500 }],
    ["nine counts", { counts: [1, 2, 3, 4, 5, 6, 7, 8, 9], minIntervalMs: 0 }],
    ["a count of 0", { counts: [0], minIntervalMs: 2500 }],
    ["a count over 1000", { counts: [1001], minIntervalMs: 2500 }],
    ["a fractional count", { counts: [2.5], minIntervalMs: 2500 }],
    ["counts out of order", { counts: [25, 10], minIntervalMs: 2500 }],
    ["a repeated count", { counts: [10, 10], minIntervalMs: 2500 }],
    ["a negative interval", { counts: [10], minIntervalMs: -1 }],
    ["an interval over 600 000", { counts: [10], minIntervalMs: 600_001 }],
  ])("refuses the document for %s, naming the field only", (_, autoplay) => {
    expect(validate(autoplay)).toEqual({
      ok: false,
      issues: [{ code: "invalid-autoplay", field: "autoplay" }],
    });
  });
});
