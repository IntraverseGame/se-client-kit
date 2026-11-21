// T-46's configuration half (W-62, W-63, ADR-012; specs/wrapper.md,
// Configuration): `signingPageOrigin` and `acceptPendingNotices`. A document
// without either is valid and offers nothing; a malformed signing origin, one
// on the Wrapper's comparison key, the verify page's origin, or an operator's
// or a game's is refused with its code; a loopback pair is accepted in `local`
// only; `acceptPendingNotices` that is not a boolean, or `true` in production,
// is refused. Each issue names the field, never the value. The verify page
// judges the same documents alike (tools/config-parity.test.ts, V-3).

import { describe, expect, it } from "vitest";

import { validateEnvironmentConfig } from "./environment-config.ts";
import {
  environmentDocument,
  LOCAL_ORIGIN,
  localDocument,
  SE_ORIGIN,
} from "./fixtures/environment.ts";

const SIGNER = "https://signer.example-signing.org";

/** The accepted document's configuration; a refusal fails the test. */
const configOf = (document: Readonly<Record<string, unknown>>) => {
  const result = validateEnvironmentConfig(document, SE_ORIGIN);
  if (!result.ok) throw new Error("refused");
  return result.config;
};

const issuesOf = (
  document: Readonly<Record<string, unknown>>,
  ownOrigin = SE_ORIGIN,
): readonly string[] => {
  const result = validateEnvironmentConfig(document, ownOrigin);
  return result.ok
    ? []
    : result.issues.map(issue => `${issue.code} ${issue.field}`);
};

describe("the wallet delegation's configuration (T-46)", () => {
  it("accepts a document without either field, and keeps neither", () => {
    const config = configOf(environmentDocument());
    expect(Object.hasOwn(config, "signingPageOrigin")).toBe(false);
    expect(Object.hasOwn(config, "acceptPendingNotices")).toBe(false);
  });

  it("keeps a valid signing page and the pending flag outside production", () => {
    const config = configOf(
      environmentDocument({
        environment: "preview",
        signingPageOrigin: SIGNER,
        acceptPendingNotices: true,
      }),
    );
    expect(config.signingPageOrigin).toBe(SIGNER);
    expect(config.acceptPendingNotices).toBe(true);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it.each([
    ["not a string", 1],
    ["with a path", `${SIGNER}/signer`],
    ["with a trailing slash", `${SIGNER}/`],
    ["in upper case", "https://Signer.example-signing.org"],
    ["over plain http", "http://signer.example-signing.org"],
    ["with credentials", "https://user@signer.example-signing.org"],
    ["with a query", `${SIGNER}?a=1`],
    ["with the default port", `${SIGNER}:443`],
    ["not a URL", "signer"],
  ])("refuses a signing origin %s", (_name, signingPageOrigin) => {
    expect(issuesOf(environmentDocument({ signingPageOrigin }))).toEqual([
      "invalid-signing-page-origin signingPageOrigin",
    ]);
  });

  it.each([
    ["the Wrapper's own origin", SE_ORIGIN],
    ["a host on the Wrapper's comparison key", "https://signer.se.example"],
    ["another port of the Wrapper's host", "https://se.example:8443"],
  ])("refuses %s as the same site (ADR-012)", (_name, signingPageOrigin) => {
    expect(issuesOf(environmentDocument({ signingPageOrigin }))).toEqual([
      "signing-page-same-site signingPageOrigin",
    ]);
  });

  it.each([
    ["the verify page's origin", "https://verify.example"],
    ["an operator origin", "https://operator.example"],
    ["a game origin", "https://game.example"],
  ])("refuses %s as overlapping", (_name, signingPageOrigin) => {
    expect(issuesOf(environmentDocument({ signingPageOrigin }))).toEqual([
      "overlapping-origins signingPageOrigin",
    ]);
  });

  it("accepts a loopback pair in local only", () => {
    const local = localDocument({ signingPageOrigin: "http://localhost:8090" });
    expect(issuesOf(local, LOCAL_ORIGIN)).toEqual([]);
    expect(
      issuesOf({ ...local, environment: "preview" }, LOCAL_ORIGIN),
    ).toContain("invalid-signing-page-origin signingPageOrigin");
    expect(
      issuesOf(
        localDocument({ signingPageOrigin: "https://localhost:8090" }),
        LOCAL_ORIGIN,
      ),
    ).toEqual([]);
    expect(
      issuesOf(
        {
          ...localDocument({ signingPageOrigin: "https://localhost:8090" }),
          environment: "preview",
        },
        LOCAL_ORIGIN,
      ),
    ).toContain("signing-page-same-site signingPageOrigin");
  });

  it("refuses the signing page on the local Wrapper's own origin", () => {
    expect(
      issuesOf(
        localDocument({ signingPageOrigin: LOCAL_ORIGIN }),
        LOCAL_ORIGIN,
      ),
    ).toEqual(["signing-page-same-site signingPageOrigin"]);
  });

  it.each([["true"], [1], [null], [{}]])(
    "refuses acceptPendingNotices %j",
    acceptPendingNotices => {
      expect(
        issuesOf(
          environmentDocument({ environment: "preview", acceptPendingNotices }),
        ),
      ).toEqual(["invalid-accept-pending-notices acceptPendingNotices"]);
    },
  );

  it("refuses acceptPendingNotices true in production, with or without a signing page", () => {
    for (const signing of [{}, { signingPageOrigin: SIGNER }]) {
      expect(
        issuesOf(
          environmentDocument({ ...signing, acceptPendingNotices: true }),
        ),
      ).toEqual(["pending-notices-in-production acceptPendingNotices"]);
    }
    expect(
      issuesOf(environmentDocument({ acceptPendingNotices: false })),
    ).toEqual([]);
  });

  it("allows acceptPendingNotices without a signing page", () => {
    expect(
      issuesOf(
        environmentDocument({
          environment: "preview",
          acceptPendingNotices: true,
        }),
      ),
    ).toEqual([]);
  });

  it("names the field, never the value", () => {
    const value = "https://Secretish.example-signing.org";
    const result = validateEnvironmentConfig(
      environmentDocument({ signingPageOrigin: value }),
      SE_ORIGIN,
    );
    expect(JSON.stringify(result)).not.toContain("Secretish");
  });
});
