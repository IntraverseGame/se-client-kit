// The `verifyApiBaseUrl` field (specs/verify-page.md V-3, V-3a, D-4, D-10;
// specs/wrapper.md, Configuration): required, never derived or defaulted,
// `playApiBaseUrl`'s rule with the `/verify/v1` suffix, on the Wrapper's own
// origin only. The Wrapper validates it and does not use it.

import { describe, expect, it } from "vitest";

import {
  type EnvironmentConfigIssueCode,
  validateEnvironmentConfig,
} from "./environment-config.ts";
import {
  environmentDocument,
  LOCAL_ORIGIN,
  localDocument,
  SE_ORIGIN,
} from "./fixtures/environment.ts";

const codes = (
  document: unknown,
  ownOrigin: string = SE_ORIGIN,
): readonly EnvironmentConfigIssueCode[] => {
  const result = validateEnvironmentConfig(document, ownOrigin);
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
    expect(validateEnvironmentConfig(localDocument(), LOCAL_ORIGIN).ok).toBe(
      true,
    );
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

  it.each([
    ["https://verify-api.example/verify/v1", SE_ORIGIN, "another host"],
    ["https://api.se.example/verify/v1", SE_ORIGIN, "a subdomain"],
    [
      "http://localhost:8080/verify/v1",
      "https://localhost:8080",
      "another scheme",
    ],
    ["https://se.example:8443/verify/v1", SE_ORIGIN, "another port"],
    ["http://localhost:8081/verify/v1", LOCAL_ORIGIN, "another loopback port"],
  ])(
    "refuses verifyApiBaseUrl %s for a Wrapper at %s (%s, V-3a)",
    (value, ownOrigin, _reason) => {
      expect(
        codes(environmentDocument({ verifyApiBaseUrl: value }), ownOrigin),
      ).toEqual(["invalid-verify-api-base"]);
    },
  );

  it("names the field, never the value, when the origin differs", () => {
    const result = validateEnvironmentConfig(
      environmentDocument({
        verifyApiBaseUrl: "https://verify-api.example/verify/v1",
      }),
      SE_ORIGIN,
    );
    expect(result).toEqual({
      ok: false,
      issues: [{ code: "invalid-verify-api-base", field: "verifyApiBaseUrl" }],
    });
    expect(JSON.stringify(result)).not.toContain("verify-api.example");
  });

  it("refuses a document without verifyApiBaseUrl, and derives nothing", () => {
    expect(codes(environmentDocument({ verifyApiBaseUrl: undefined }))).toEqual(
      ["invalid-verify-api-base"],
    );
  });
});
