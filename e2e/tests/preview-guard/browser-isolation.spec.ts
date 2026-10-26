// What the preview project's browser receives (RFC-002): a minimal explicit
// environment, never the runner's (a source that holds a sentinel credential
// name, an `SE_E2E_*` name, and a proxy name yields none of them, and every name
// in the result is on the allow-list), and the host-resolver rules derived from
// the allow-list (every host resolves to nothing except the allow-list's hosts;
// Chromium applies the rules to an IP literal too, so a literal is excluded as
// well, an IPv6 one without its brackets). The fake projects' block is a constant of its
// own and is not computed from any of this.

import { BLOCK_HOST_RESOLUTION } from "../harness/browser-flags.ts";
import { expect, test } from "../harness/worker-browser.ts";
import {
  BROWSER_ENVIRONMENT_NAMES,
  browserEnvironment,
} from "../preview-support/browser-environment.ts";
import { hostResolverRules } from "../preview-support/preview-browser-flags.ts";

const RUNNER_ENVIRONMENT = {
  PATH: "/usr/bin",
  HOME: "/home/runner",
  TMPDIR: "/tmp",
  LANG: "C.UTF-8",
  BACKEND_FUNDING_CREDENTIAL: "SENTINEL-CREDENTIAL",
  AWS_SECRET_ACCESS_KEY: "SENTINEL-CLOUD",
  SE_E2E_PREVIEW_ORIGIN: "https://preview.example.test",
  SE_E2E_PREVIEW_LAUNCH_COMMAND: "/opt/hook",
  SE_E2E_PREVIEW_ENTRY: "script",
  HTTPS_PROXY: "http://proxy.example.test:3128",
  http_proxy: "http://proxy.example.test:3128",
  NO_PROXY: "localhost",
  NODE_OPTIONS: "--require /opt/x.js",
};

test.describe("the browser's environment", () => {
  test("holds only allow-listed names, none of the runner's credentials, SE_E2E_* names, or proxy names", () => {
    const result = browserEnvironment(RUNNER_ENVIRONMENT);
    expect(result).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/runner",
      TMPDIR: "/tmp",
      LANG: "C.UTF-8",
    });
    for (const name of Object.keys(result)) {
      expect(BROWSER_ENVIRONMENT_NAMES).toContain(name);
    }
    const text = JSON.stringify(result);
    for (const leaked of [
      "SENTINEL",
      "SE_E2E",
      "PROXY",
      "proxy",
      "NODE_OPTIONS",
    ]) {
      expect(text).not.toContain(leaked);
    }
  });

  test("leaves out an allow-listed name the source does not have", () => {
    expect(browserEnvironment({ PATH: "/usr/bin" })).toEqual({
      PATH: "/usr/bin",
    });
    expect(browserEnvironment({})).toEqual({});
  });

  test("is frozen", () => {
    expect(Object.isFrozen(browserEnvironment(RUNNER_ENVIRONMENT))).toBe(true);
  });
});

test.describe("the host-resolver rules", () => {
  test("keep the block and exclude exactly the allow-list's host names", () => {
    expect(
      hostResolverRules([
        "https://preview.example.test",
        "https://rpc1.example.test:8545",
        "https://rpc1.example.test",
      ]),
    ).toBe(
      `${BLOCK_HOST_RESOLUTION}, EXCLUDE preview.example.test, EXCLUDE rpc1.example.test`,
    );
  });

  test("exclude an IP literal too, an IPv6 one without its brackets", () => {
    expect(
      hostResolverRules([
        "http://127.0.0.1:3000",
        "http://[::1]:3000",
        "https://10.1.2.3",
      ]),
    ).toBe(
      `${BLOCK_HOST_RESOLUTION}, EXCLUDE 127.0.0.1, EXCLUDE ::1, EXCLUDE 10.1.2.3`,
    );
  });

  test("exclude localhost, which is a name", () => {
    expect(hostResolverRules(["http://localhost:3000"])).toBe(
      `${BLOCK_HOST_RESOLUTION}, EXCLUDE localhost`,
    );
  });

  test("the fake projects' block is still the constant it was", () => {
    expect(BLOCK_HOST_RESOLUTION).toBe("--host-resolver-rules=MAP * ~NOTFOUND");
  });
});
