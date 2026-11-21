// T-47: the signing page's configuration validator (SP-3). Each field's
// refusals, by code and field, never a value.

import { describe, expect, it } from "vitest";

import { validateSignerConfig } from "./environment-config.ts";

const OWN = "https://signer.example-signer.test";
const WRAPPER = "https://wrapper.example.test";

const valid = {
  environment: "preview",
  wrapperOrigins: [WRAPPER],
} as const;

const issuesOf = (document: unknown, own = OWN): unknown => {
  const result = validateSignerConfig(document, own);
  return result.ok ? [] : result.issues;
};

describe("validateSignerConfig (SP-3)", () => {
  it("accepts the minimal document, acceptPendingNotices absent reading false", () => {
    expect(validateSignerConfig(valid, OWN)).toEqual({
      ok: true,
      config: {
        environment: "preview",
        wrapperOrigins: [WRAPPER],
        acceptPendingNotices: false,
      },
    });
  });

  it("accepts acceptPendingNotices true outside production, and false in production", () => {
    const pending = validateSignerConfig(
      { ...valid, acceptPendingNotices: true },
      OWN,
    );
    expect(pending).toMatchObject({
      ok: true,
      config: { acceptPendingNotices: true },
    });
    expect(
      validateSignerConfig(
        { ...valid, environment: "production", acceptPendingNotices: false },
        OWN,
      ).ok,
    ).toBe(true);
  });

  it("refuses acceptPendingNotices true in production", () => {
    expect(
      issuesOf({
        ...valid,
        environment: "production",
        acceptPendingNotices: true,
      }),
    ).toEqual([
      {
        code: "pending-notices-in-production",
        field: "acceptPendingNotices",
      },
    ]);
  });

  it.each([["yes"], [1], [null], [[]]])(
    "refuses acceptPendingNotices %j",
    value => {
      expect(issuesOf({ ...valid, acceptPendingNotices: value })).toEqual([
        {
          code: "invalid-accept-pending-notices",
          field: "acceptPendingNotices",
        },
      ]);
    },
  );

  it("refuses an unknown field, naming it", () => {
    expect(issuesOf({ ...valid, signingPageOrigin: OWN })).toEqual([
      { code: "unknown-field", field: "signingPageOrigin" },
    ]);
  });

  it.each([[undefined], ["staging"], ["Production"], [3]])(
    "refuses environment %j",
    environment => {
      expect(issuesOf({ ...valid, environment })).toEqual([
        { code: "invalid-environment", field: "environment" },
      ]);
    },
  );

  it.each([[undefined], [[]], [WRAPPER], [{ 0: WRAPPER }]])(
    "refuses wrapperOrigins %j as a whole",
    wrapperOrigins => {
      expect(issuesOf({ ...valid, wrapperOrigins })).toEqual([
        { code: "invalid-wrapper-origins", field: "wrapperOrigins" },
      ]);
    },
  );

  it.each([
    ["a path", `${WRAPPER}/`],
    ["uppercase", "https://Wrapper.example.test"],
    ["http off loopback", "http://wrapper.example.test"],
    ["http on loopback outside local", "http://localhost:5173"],
    ["a default port written", "https://wrapper.example.test:443"],
    ["not a URL", "wrapper"],
    ["not a string", 7],
  ])("refuses an entry: %s", (_name, entry) => {
    expect(issuesOf({ ...valid, wrapperOrigins: [WRAPPER, entry] })).toEqual([
      { code: "invalid-wrapper-origins", field: "wrapperOrigins.1" },
    ]);
  });

  it("refuses a repeated entry", () => {
    expect(issuesOf({ ...valid, wrapperOrigins: [WRAPPER, WRAPPER] })).toEqual([
      { code: "invalid-wrapper-origins", field: "wrapperOrigins.1" },
    ]);
  });

  it("refuses the page's own origin", () => {
    expect(issuesOf({ ...valid, wrapperOrigins: [WRAPPER, OWN] })).toEqual([
      { code: "overlapping-origins", field: "wrapperOrigins.1" },
    ]);
  });

  it("accepts http on a loopback host in local only", () => {
    const local = {
      environment: "local",
      wrapperOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"],
    };
    expect(validateSignerConfig(local, "http://localhost:4173").ok).toBe(true);
  });

  it.each([[null], ["text"], [[valid]]])(
    "refuses a document that is not an object (%j), field by field",
    document => {
      expect(issuesOf(document)).toEqual([
        { code: "invalid-environment", field: "environment" },
        { code: "invalid-wrapper-origins", field: "wrapperOrigins" },
      ]);
    },
  );

  it("names no value in any issue", () => {
    const secretish = "https://secret-host.example.test";
    const result = validateSignerConfig(
      {
        environment: secretish,
        wrapperOrigins: [`${secretish}/x`],
        acceptPendingNotices: secretish,
      },
      OWN,
    );
    expect(JSON.stringify(result)).not.toContain("secret-host");
  });
});
