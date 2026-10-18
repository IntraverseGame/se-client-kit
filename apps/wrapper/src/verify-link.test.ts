import { describe, expect, it } from "vitest";

import { verifyUrlFor } from "./verify-link.ts";

// The verify link's URL (W-39): `<verifyBaseUrl>/rounds/{roundId}`, with one
// trailing `/` of the base removed.

const ROUND_ID = "0192f0a4-8b1c-7d2e-9f3a-4b5c6d7e8f90";

describe("verifyUrlFor", () => {
  it.each([
    ["https://wrapper.example/verify", "a base without a trailing slash"],
    ["https://wrapper.example/verify/", "a base with one trailing slash"],
  ])("appends /rounds/{roundId} to %s (%s)", base => {
    expect(verifyUrlFor(base, ROUND_ID)).toBe(
      `https://wrapper.example/verify/rounds/${ROUND_ID}`,
    );
  });

  it("removes one trailing slash only", () => {
    expect(verifyUrlFor("https://wrapper.example/verify//", ROUND_ID)).toBe(
      `https://wrapper.example/verify//rounds/${ROUND_ID}`,
    );
  });

  it("puts the round id in the path of an origin-only base", () => {
    expect(verifyUrlFor("https://verify.example/", ROUND_ID)).toBe(
      `https://verify.example/rounds/${ROUND_ID}`,
    );
  });
});
