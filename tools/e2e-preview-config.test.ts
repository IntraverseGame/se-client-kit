// The Playwright config and the preview project (RFC-002): without the launcher's
// entry marker the config has no `preview` project, and it throws the refusal
// when the project is asked for (a bare `--project=preview`, `--project preview`,
// or `SE_E2E_PROJECT=preview`); with the marker it defines the project, with a
// global setup and its own bound; the fake projects ignore the preview specs and keep
// the launch options they had (no `env`, no `EXCLUDE`), marker or not; and the
// preview browser gets the block, the allow-list's hosts, and a minimal
// environment.

import { afterEach, describe, expect, it } from "vitest";

import {
  browserNamesOf,
  ENTERED,
  fakeProjects,
  launchOptionsOf,
  loadConfig,
  PREVIEW_VARIABLES,
  previewProject,
  restoreProcess,
  suppliedBrowserNames,
  SPAWN_TIMEOUT_MS,
  testsDirectory,
} from "./e2e-preview-support.ts";

afterEach(restoreProcess);

const FAKE_LAUNCH_OPTIONS = [
  { args: ["--host-resolver-rules=MAP * ~NOTFOUND"] },
  {
    proxy: { server: "http://127.0.0.1:9" },
    firefoxUserPrefs: {
      "media.peerconnection.enabled": false,
      "network.proxy.allow_hijacking_localhost": true,
    },
  },
  { proxy: { server: "http://127.0.0.1:9" } },
];

describe("the Playwright config without the marker", () => {
  it(
    "has no preview project, whatever the variables",
    async () => {
      const config = await loadConfig(PREVIEW_VARIABLES, ["test"]);
      expect(config.projects.map(project => project.name)).toEqual([
        "chromium",
        "firefox",
        "webkit",
      ]);
      expect(config.globalSetup).toBeUndefined();
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "does not read the variables",
    async () => {
      const config = await loadConfig(
        { SE_E2E_PREVIEW_ORIGIN: "not an origin" },
        ["test", "--project=chromium"],
      );
      expect(config.projects).toHaveLength(3);
    },
    SPAWN_TIMEOUT_MS,
  );

  it.each([
    ["a bare --project=preview", {}, ["test", "--project=preview"]],
    ["--project preview", {}, ["test", "--project", "preview"]],
    [
      "SE_E2E_PROJECT=preview",
      { SE_E2E_PROJECT: "preview" },
      ["test", "--project=chromium"],
    ],
    [
      "the variables set but no marker",
      PREVIEW_VARIABLES,
      ["test", "--project=preview"],
    ],
  ])(
    "throws the refusal for %s",
    async (_name, environment, argv) => {
      await expect(loadConfig(environment, argv)).rejects.toThrow(
        "pnpm test:e2e:preview",
      );
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "has the fake projects' launch options as they were",
    async () => {
      const config = await loadConfig({}, ["test"]);
      expect(launchOptionsOf(fakeProjects(config))).toEqual(
        FAKE_LAUNCH_OPTIONS,
      );
    },
    SPAWN_TIMEOUT_MS,
  );
});

describe("the Playwright config with the marker", () => {
  it(
    "defines the preview project, with a global setup and its own bound",
    async () => {
      const config = await loadConfig(ENTERED, ["test", "--project=preview"]);
      expect(config.projects.map(project => project.name)).toEqual([
        "chromium",
        "firefox",
        "webkit",
        "preview",
      ]);
      expect(config.globalSetup).toBe(
        "./tests/preview-support/global-setup.ts",
      );
      expect(config.globalTimeout).toBeGreaterThan(10 * 60 * 1000);
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "fails, before any browser, naming the variable that is missing",
    async () => {
      await expect(
        loadConfig({ SE_E2E_PREVIEW_ENTRY: "script" }, ["test"]),
      ).rejects.toThrow("SE_E2E_PREVIEW_ORIGIN");
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "makes the fake projects ignore the preview specs and the preview project match only them, anchored to the tests directory",
    async () => {
      const config = await loadConfig(ENTERED, ["test"]);
      const pattern = previewProject(config)?.testMatch;
      expect(pattern).toBeInstanceOf(RegExp);
      expect(fakeProjects(config).map(project => project.testIgnore)).toEqual([
        pattern,
        pattern,
        pattern,
      ]);
      expect(previewProject(config)?.testIgnore).toBeUndefined();
      // Anchored to this checkout's tests directory: the preview specs only,
      // whatever else the path holds (the checkout-path test runs Playwright).
      const selects = (path: string): boolean => (pattern as RegExp).test(path);
      expect(selects(`${testsDirectory}/preview/t12-cash-out.spec.ts`)).toBe(
        true,
      );
      expect(selects(`${testsDirectory}/preview/nested/a.spec.ts`)).toBe(true);
      expect(selects(`${testsDirectory}/preview/helper.ts`)).toBe(false);
      expect(selects(`${testsDirectory}/preview-guard/a.spec.ts`)).toBe(false);
      expect(selects(`${testsDirectory}/preview-support/a.spec.ts`)).toBe(
        false,
      );
      expect(selects(`${testsDirectory}/hermetic.spec.ts`)).toBe(false);
      expect(selects("/runner/preview/kit/e2e/tests/hermetic.spec.ts")).toBe(
        false,
      );
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "keeps the fake projects' launch options the constants they were",
    async () => {
      const config = await loadConfig(ENTERED, ["test"]);
      const options = launchOptionsOf(fakeProjects(config));
      expect(options).toEqual(FAKE_LAUNCH_OPTIONS);
      expect(JSON.stringify(options)).not.toContain("EXCLUDE");
      expect(JSON.stringify(options)).not.toContain('"env"');
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "gives the preview browser the block, the allow-list's hosts, and a minimal environment",
    async () => {
      process.env["SECRET_RUNNER_CREDENTIAL"] = "SENTINEL";
      const config = await loadConfig(
        { ...ENTERED, HTTPS_PROXY: "http://proxy.example.test" },
        ["test"],
      );
      const options = previewProject(config)?.use?.launchOptions;
      expect(options?.args).toEqual([
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE preview.example.test, EXCLUDE rpc.example.test",
      ]);
      expect(browserNamesOf(previewProject(config))).toEqual(
        suppliedBrowserNames(),
      );
      expect(JSON.stringify(options?.env)).not.toContain("SENTINEL");
      expect(JSON.stringify(options?.env)).not.toContain("proxy.example.test");
    },
    SPAWN_TIMEOUT_MS,
  );
});
