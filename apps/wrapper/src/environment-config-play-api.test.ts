// The `playApiBaseUrl` field (specs/wrapper.md, Configuration): an absolute
// `https:` URL (or `http:` on a loopback host) with no credentials, query, or
// fragment, whose path ends with `/play/v1`.

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

const codes = (document: unknown): readonly EnvironmentConfigIssueCode[] => {
  const result = validateEnvironmentConfig(document, SE_ORIGIN);
  return result.ok ? [] : result.issues.map(issue => issue.code);
};

describe("playApiBaseUrl", () => {
  it.each([
    ["https://se.example/play/v1/", "a trailing slash"],
    ["https://se.example/api", "another path"],
    ["http://se.example/play/v1", "plain http off loopback"],
    ["https://user@se.example/play/v1", "credentials"],
    ["https://se.example/play/v1?x=1", "a query"],
    ["/play/v1", "a relative URL"],
    [42, "a number"],
  ])("refuses playApiBaseUrl %s (%s)", (value, _reason) => {
    expect(codes(environmentDocument({ playApiBaseUrl: value }))).toEqual([
      "invalid-play-api-base",
    ]);
  });

  it("accepts a loopback http Play API base", () => {
    expect(validateEnvironmentConfig(localDocument(), LOCAL_ORIGIN)).toEqual({
      ok: true,
      config: expect.objectContaining({
        playApiBaseUrl: "http://localhost:8080/play/v1",
      }),
    });
  });
});
