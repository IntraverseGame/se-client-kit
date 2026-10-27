// What the preview project's browser receives (RFC-002, "Who receives which
// environment"). Playwright gives a browser `process.env` unless
// `launchOptions.env` is set, and the runner's environment can hold credentials
// the launch hook needs. So the browser gets a minimal explicit environment: a
// fixed allow-list of the operating-system names a headless browser needs to
// start. No `SE_E2E_*`, no proxy variable, no credential: a name that is not on
// the list is never copied, whatever it is called.

import type { EnvironmentSource } from "./preview-environment.ts";

/**
 * The names the browser may receive. A headless Chromium started with only
 * these four in the preview runs so far, none of which was in the backend's CI
 * job; they are not yet measured on that job's runner. A name is added only for
 * a runner that needs one (runbook, Troubleshooting).
 */
export const BROWSER_ENVIRONMENT_NAMES: readonly string[] = Object.freeze([
  "PATH",
  "HOME",
  "TMPDIR",
  "LANG",
]);

/** The browser's environment: the allow-listed names `source` holds. */
export const browserEnvironment = (
  source: EnvironmentSource,
): Readonly<Record<string, string>> => {
  const out: Record<string, string> = {};
  for (const name of BROWSER_ENVIRONMENT_NAMES) {
    const value = source[name];
    if (value !== undefined) out[name] = value;
  }
  return Object.freeze(out);
};
