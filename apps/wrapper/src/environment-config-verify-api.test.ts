// The `verifyApiBaseUrl` field (specs/verify-page.md V-3, D-4; specs/wrapper.md,
// Configuration): required, never derived or defaulted, `playApiBaseUrl`'s rule
// with the `/verify/v1` suffix. The Wrapper validates it and does not use it.

import { describe, expect, it } from "vitest";

import {
  type EnvironmentConfigIssueCode,
  validateEnvironmentConfig,
} from "./environment-config.ts";
import {
  environmentDocument,
  localDocument,
  SE_ORIGIN,
} from "./fixtures/environment.ts";

const codes = (document: unknown): readonly EnvironmentConfigIssueCode[] => {
  const result = validateEnvironmentConfig(document, SE_ORIGIN);
  return result.ok ? [] : result.issues.map(issue => issue.code);
};

describe("verifyApiBaseUrl", () => {
  it.each([
    ["https://se.example/verify/v1", "https"],
    ["https://se.example/api/verify/v1", "a longer path"],
  ])("accepts verifyApiBaseUrl %s (%s)", (value, _reason) => {
    expect(
      validateEnvironmentConfig(
        environmentDocument({ verifyApiBaseUrl: value }),
        SE_ORIGIN,
      ).ok,
    ).toBe(true);
  });

  it("accepts a loopback http verify API base", () => {
    expect(validateEnvironmentConfig(localDocument(), SE_ORIGIN).ok).toBe(true);
  });

  it.each([
    ["https://se.example/verify/v1/", "a trailing slash"],
    ["https://se.example/verify", "no /verify/v1 suffix"],
    ["https://se.example/play/v1", "the Play API path"],
    ["http://se.example/verify/v1", "plain http off loopback"],
    ["https://user@se.example/verify/v1", "credentials"],
    ["https://se.example/verify/v1?x=1", "a query"],
    ["https://se.example/verify/v1#x", "a fragment"],
    ["https://SE.example/verify/v1", "not in its serialized form"],
    ["/verify/v1", "a relative URL"],
    [42, "a number"],
    [null, "null"],
  ])("refuses verifyApiBaseUrl %s (%s)", (value, _reason) => {
    expect(codes(environmentDocument({ verifyApiBaseUrl: value }))).toEqual([
      "invalid-verify-api-base",
    ]);
  });

  it("refuses a document without verifyApiBaseUrl, and derives nothing", () => {
    expect(codes(environmentDocument({ verifyApiBaseUrl: undefined }))).toEqual(
      ["invalid-verify-api-base"],
    );
  });
});
