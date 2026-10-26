// The generic routes refuse the `preview` project and the launcher fails fast
// (RFC-002, acceptance criteria 1 and 2): a bare `playwright test
// --project=preview` is refused naming the script; the launcher, with the
// variables unset or malformed, fails before any browser starts, naming the
// variable and holding no value that could be a secret; and with the variables
// valid but no stack to reach, it stops in the global setup. The project is
// listed only under the marker, and the fake projects never list a preview spec.

import { describe, expect, it } from "vitest";

import {
  cleanEnvironment,
  ENTERED,
  listed,
  PREVIEW_VARIABLES,
  playwrightCli,
  run,
  tsx,
  SPAWN_TIMEOUT_MS,
} from "./e2e-preview-support.ts";

const LAUNCHER = ["tests/preview-support/run-preview.ts"];

describe("the generic routes", () => {
  it(
    "refuse a bare playwright test --project=preview, naming the script",
    () => {
      const outcome = listed(cleanEnvironment(), "preview");
      expect(outcome.status).not.toBe(0);
      expect(outcome.output).toContain("pnpm test:e2e:preview");
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "refuse SE_E2E_PROJECT=preview, the variables set",
    () => {
      const outcome = run(
        process.execPath,
        [playwrightCli, "test", "--list"],
        cleanEnvironment({ ...PREVIEW_VARIABLES, SE_E2E_PROJECT: "preview" }),
      );
      expect(outcome.status).not.toBe(0);
      expect(outcome.output).toContain("pnpm test:e2e:preview");
    },
    SPAWN_TIMEOUT_MS,
  );
});

describe("the launcher", () => {
  it(
    "fails before any browser, naming the missing variable",
    () => {
      const outcome = run(tsx, LAUNCHER, cleanEnvironment());
      expect(outcome.status).not.toBe(0);
      expect(outcome.output).toContain("SE_E2E_PREVIEW_ORIGIN");
      expect(outcome.output).not.toContain("Running");
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "fails naming a malformed variable and holding no value",
    () => {
      const outcome = run(
        tsx,
        LAUNCHER,
        cleanEnvironment({
          ...PREVIEW_VARIABLES,
          SE_E2E_PREVIEW_GAME_ORIGIN:
            "http://SENTINEL-KEY-IN-A-VALUE.example.test",
        }),
      );
      expect(outcome.status).not.toBe(0);
      expect(outcome.output).toContain("SE_E2E_PREVIEW_GAME_ORIGIN");
      expect(outcome.output).not.toContain("SENTINEL-KEY-IN-A-VALUE");
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "stops in the global setup, before any browser, when the stack cannot be reached",
    () => {
      // Loopback, a port nothing listens on: refused at once, no real network.
      const outcome = run(
        tsx,
        LAUNCHER,
        cleanEnvironment({
          ...PREVIEW_VARIABLES,
          SE_E2E_PREVIEW_ORIGIN: "http://127.0.0.1:9",
        }),
      );
      expect(outcome.status).not.toBe(0);
      expect(outcome.output).toContain(
        "the environment document check failed (fetch)",
      );
      expect(outcome.output).not.toContain("Running");
    },
    SPAWN_TIMEOUT_MS,
  );
});

describe("the listing", () => {
  it(
    "shows the preview specs only under the marker and the project",
    () => {
      expect(listed(cleanEnvironment(ENTERED), "preview").output).toContain(
        "T-12 (preview)",
      );
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "never shows a preview spec in a fake project, marker or not",
    () => {
      expect(
        listed(cleanEnvironment(ENTERED), "chromium").output,
      ).not.toContain("(preview)");
      expect(listed(cleanEnvironment(), "chromium").output).not.toContain(
        "(preview)",
      );
    },
    SPAWN_TIMEOUT_MS,
  );
});
