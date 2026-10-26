// The preview variables' parser (RFC-002): every missing, malformed, wildcard,
// path-bearing, credential-bearing, and non-loopback `http:` origin; a relative
// or non-absolute command; an `http:` or loopback game origin; and that no value
// is in any message. A pure function of the environment it is given: it reads no
// `process.env`, so these tests run in every project.

import { expect, test } from "../harness/worker-browser.ts";
import {
  PREVIEW_VARIABLES,
  PreviewEnvironmentError,
  parsePreviewEnvironment,
  type EnvironmentSource,
} from "../preview-support/preview-environment.ts";

const GOOD: EnvironmentSource = {
  SE_E2E_PREVIEW_ORIGIN: "https://preview.example.test",
  SE_E2E_PREVIEW_LAUNCH_COMMAND: "/opt/runner/launch-hook",
  SE_E2E_PREVIEW_GAME_ORIGIN: "https://game.example-games.test",
};

/** A distinctive value no real configuration would hold. */
const SENTINEL = "SENTINEL-NOT-FOR-A-MESSAGE";

const refusal = (source: EnvironmentSource): PreviewEnvironmentError => {
  try {
    parsePreviewEnvironment(source);
  } catch (error: unknown) {
    if (error instanceof PreviewEnvironmentError) return error;
    throw error;
  }
  throw new Error("expected the environment to be refused");
};

test.describe("the preview environment", () => {
  test("parses the required variables into one frozen object", () => {
    const environment = parsePreviewEnvironment(GOOD);
    expect(environment).toEqual({
      origin: "https://preview.example.test",
      launchCommand: "/opt/runner/launch-hook",
      gameOrigin: "https://game.example-games.test",
      allowedOrigins: ["https://preview.example.test"],
    });
    expect(Object.isFrozen(environment)).toBe(true);
    expect(Object.isFrozen(environment.allowedOrigins)).toBe(true);
  });

  test("lists the preview origin first, then the allowed ones, once each", () => {
    const environment = parsePreviewEnvironment({
      ...GOOD,
      SE_E2E_PREVIEW_ALLOWED_ORIGINS:
        "https://rpc1.example.test,http://127.0.0.1:8545,https://preview.example.test",
    });
    expect(environment.allowedOrigins).toEqual([
      "https://preview.example.test",
      "https://rpc1.example.test",
      "http://127.0.0.1:8545",
    ]);
  });

  test.describe("a missing variable", () => {
    for (const variable of [
      PREVIEW_VARIABLES.origin,
      PREVIEW_VARIABLES.launchCommand,
      PREVIEW_VARIABLES.gameOrigin,
    ]) {
      for (const value of [undefined, ""]) {
        test(`${variable} = ${JSON.stringify(value)}`, () => {
          const error = refusal({ ...GOOD, [variable]: value });
          expect(error.variable).toBe(variable);
          expect(error.reason).toBe("missing");
          expect(error.message).toContain(variable);
        });
      }
    }
  });

  test.describe("a malformed origin", () => {
    const BAD: readonly [string, string, string][] = [
      ["not a URL", "preview.example.test", "not-an-origin"],
      ["a path", "https://preview.example.test/play", "not-an-origin"],
      ["a trailing slash", "https://preview.example.test/", "not-an-origin"],
      ["a query", "https://preview.example.test?x=1", "not-an-origin"],
      ["a fragment", "https://preview.example.test#x", "not-an-origin"],
      ["credentials", "https://user:pw@preview.example.test", "not-an-origin"],
      ["a wildcard", "https://*.example.test", "wildcard"],
      ["a bare wildcard", "*", "wildcard"],
      ["the wrong scheme", "ftp://preview.example.test", "scheme"],
      ["http on a named host", "http://preview.example.test", "scheme"],
      ["http on a non-loopback address", "http://10.0.0.5:8080", "scheme"],
      [
        "a default port spelled out",
        "https://preview.example.test:443",
        "not-an-origin",
      ],
      ["upper case", "https://Preview.Example.test", "not-an-origin"],
    ];
    for (const [name, value, reason] of BAD) {
      test(`${name}: ${reason}, and the value is not in the message`, () => {
        const error = refusal({
          ...GOOD,
          SE_E2E_PREVIEW_ORIGIN: `${value}`,
        });
        expect(error.variable).toBe(PREVIEW_VARIABLES.origin);
        expect(error.reason).toBe(reason);
        expect(error.message).not.toContain(value);
      });
    }

    test("accepts http on a loopback host for the preview origin", () => {
      for (const origin of [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://[::1]:3000",
      ]) {
        expect(
          parsePreviewEnvironment({ ...GOOD, SE_E2E_PREVIEW_ORIGIN: origin })
            .origin,
        ).toBe(origin);
      }
    });
  });

  test.describe("the game origin", () => {
    test("refuses http, even on loopback", () => {
      for (const origin of ["http://127.0.0.1:4000", "http://localhost:4000"]) {
        const error = refusal({ ...GOOD, SE_E2E_PREVIEW_GAME_ORIGIN: origin });
        expect(error.variable).toBe(PREVIEW_VARIABLES.gameOrigin);
        expect(error.reason).toBe("scheme");
      }
    });

    test("refuses the preview origin", () => {
      const error = refusal({
        ...GOOD,
        SE_E2E_PREVIEW_GAME_ORIGIN: GOOD["SE_E2E_PREVIEW_ORIGIN"],
      });
      expect(error.reason).toBe("same-origin-as-preview");
    });
  });

  test.describe("the allowed origins", () => {
    const BAD: readonly [string, string, string][] = [
      [
        "a wildcard",
        "https://rpc.example.test,https://*.example.test",
        "wildcard",
      ],
      ["a path", "https://rpc.example.test/key", "not-an-origin"],
      ["credentials", "https://u:p@rpc.example.test", "not-an-origin"],
      ["a non-loopback http origin", "http://rpc.example.test", "scheme"],
      [
        "an empty entry",
        "https://rpc.example.test,,https://rpc2.example.test",
        "empty-entry",
      ],
      ["a trailing comma", "https://rpc.example.test,", "empty-entry"],
    ];
    for (const [name, value, reason] of BAD) {
      test(`${name}: ${reason}`, () => {
        const error = refusal({
          ...GOOD,
          SE_E2E_PREVIEW_ALLOWED_ORIGINS: value,
        });
        expect(error.variable).toBe(PREVIEW_VARIABLES.allowedOrigins);
        expect(error.reason).toBe(reason);
        expect(error.message).not.toContain("rpc.example.test");
      });
    }

    test("is optional", () => {
      expect(
        parsePreviewEnvironment({ ...GOOD, SE_E2E_PREVIEW_ALLOWED_ORIGINS: "" })
          .allowedOrigins,
      ).toEqual(["https://preview.example.test"]);
    });
  });

  test.describe("the launch command", () => {
    for (const [name, value] of [
      ["a relative path", "bin/launch-hook"],
      ["a dot-relative path", "./launch-hook"],
      ["a name to find on PATH", "launch-hook"],
      ["a path with a NUL", "/opt/runner/launch\0hook"],
    ] as const) {
      test(`refuses ${name}, without the value in the message`, () => {
        const error = refusal({
          ...GOOD,
          SE_E2E_PREVIEW_LAUNCH_COMMAND: value,
        });
        expect(error.variable).toBe(PREVIEW_VARIABLES.launchCommand);
        expect(error.reason).toBe("not-an-absolute-path");
        expect(error.message).not.toContain(value);
      });
    }
  });

  test("never puts a value in a message", () => {
    const messages = [
      { SE_E2E_PREVIEW_ORIGIN: `https://${SENTINEL}/x` },
      { SE_E2E_PREVIEW_LAUNCH_COMMAND: `${SENTINEL}/hook` },
      { SE_E2E_PREVIEW_GAME_ORIGIN: `http://${SENTINEL}` },
      { SE_E2E_PREVIEW_ALLOWED_ORIGINS: `https://${SENTINEL}/key` },
    ].map(change => refusal({ ...GOOD, ...change }).message);
    expect(messages.join("\n")).not.toContain(SENTINEL);
  });
});
