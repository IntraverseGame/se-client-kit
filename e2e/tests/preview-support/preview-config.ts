// What `playwright.config.ts` needs to define the `preview` project (RFC-002),
// as plain data. The config calls this with `process.env` and `process.argv`;
// nothing here reads either, so the tools check can run it with its own.
//
// The project exists only when the launcher's entry marker is set. Asked for
// without the marker (a bare `--project=preview`, or `SE_E2E_PROJECT=preview`
// through `pnpm test:e2e`), the config throws the refusal below. With the marker
// the variables are parsed here, so a missing or malformed one fails before any
// browser starts. A run of the fake projects (no marker, no request for
// `preview`) never reads the variables.
//
// Playwright (1.64.0, verified for RFC-002) loads the config in the runner
// process and again in every worker process; the marker is an environment
// variable the workers inherit, and the check is the same in each. A worker has
// no `--project` argument, but the runner has already refused.

import { browserEnvironment } from "./browser-environment.ts";
import { hostResolverRules } from "./preview-browser-flags.ts";
import {
  type EnvironmentSource,
  PREVIEW_ENTRY_VALUE,
  PREVIEW_ENTRY_VARIABLE,
  type PreviewEnvironment,
  parsePreviewEnvironment,
} from "./preview-environment.ts";

export const PREVIEW_PROJECT = "preview";

/** The script that is the one way to run the project. */
export const PREVIEW_SCRIPT = "pnpm test:e2e:preview";

/**
 * Per test: a real stack and a real clock, with a bounded loop of rounds. The
 * first real run took 1.3 to 1.6 s per preview spec, so 2 minutes is about 75
 * times the slowest, headroom for a cold stack (see the runbook, "Timeouts").
 */
export const PREVIEW_TEST_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * The whole run. The first real run took 19 s in all, so 15 minutes is about 47
 * times that, and above the fake projects' CI bound of 10 minutes, as the RFC
 * has it (three tests that each use their 2 minutes still fit).
 */
export const PREVIEW_GLOBAL_TIMEOUT_MS = 15 * 60 * 1000;

/** The global setup, relative to `playwright.config.ts`. */
export const PREVIEW_GLOBAL_SETUP = "./tests/preview-support/global-setup.ts";

const escapeForRegExp = (text: string): string =>
  text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, "\\$&");

/**
 * The preview specs and nothing else: every `*.spec.ts` under `preview/` of
 * `testDirectory` (an absolute path). The fake projects ignore the same
 * pattern, so one definition says which specs are the preview's.
 *
 * It is a regular expression anchored to the absolute path of the directory,
 * not a glob string. Playwright matches a string pattern against the absolute
 * path of the file with `**` in front of it, so `"preview/**"` also matches any
 * checkout whose own path has a `preview` directory (a runner may check the kit
 * out anywhere): every spec would then be a preview spec, and the fake projects
 * would run none. A path with a glob character in it would be matched wrongly
 * too. The expression is escaped, and Playwright converts a Windows path to
 * forward slashes before it tests one.
 */
export const previewSpecPattern = (testDirectory: string): RegExp =>
  new RegExp(
    `^${escapeForRegExp(testDirectory.replaceAll("\\", "/"))}/preview/.*\\.spec\\.ts$`,
    "u",
  );

export type PreviewSetup =
  | { readonly active: false }
  | {
      readonly active: true;
      readonly environment: PreviewEnvironment;
      /** Chromium's launch arguments: the block, with the allow-list's hosts. */
      readonly browserArgs: readonly string[];
      /** The browser's whole environment (never the runner's). */
      readonly browserEnv: Readonly<Record<string, string>>;
    };

const isPreviewName = (name: string): boolean =>
  name.toLowerCase() === PREVIEW_PROJECT;

/** Whether the command line or `SE_E2E_PROJECT` asks for the project. */
export const requestsPreview = (
  argv: readonly string[],
  env: EnvironmentSource,
): boolean => {
  if (
    env["SE_E2E_PROJECT"] !== undefined &&
    isPreviewName(env["SE_E2E_PROJECT"])
  ) {
    return true;
  }
  return argv.some((argument, index) => {
    if (argument.startsWith("--project=")) {
      return isPreviewName(argument.slice("--project=".length));
    }
    // `--project a b` takes several names; `-p` is its short form.
    const flagged = argv.slice(0, index).findLast(item => item.startsWith("-"));
    return (
      (flagged === "--project" || flagged === "-p") && isPreviewName(argument)
    );
  });
};

export const previewRefusal = (): Error =>
  new Error(
    `The "${PREVIEW_PROJECT}" project runs a real stack with real money flows and is reachable only through \`${PREVIEW_SCRIPT}\`; the generic routes (\`pnpm test:e2e\`, \`SE_E2E_PROJECT=${PREVIEW_PROJECT}\`, \`--project=${PREVIEW_PROJECT}\`) refuse it.`,
  );

/** The preview project's setup, `{ active: false }` when it is not defined. */
export const previewSetup = (
  env: EnvironmentSource,
  argv: readonly string[],
): PreviewSetup => {
  if (env[PREVIEW_ENTRY_VARIABLE] !== PREVIEW_ENTRY_VALUE) {
    if (requestsPreview(argv, env)) throw previewRefusal();
    return { active: false };
  }
  const environment = parsePreviewEnvironment(env);
  return {
    active: true,
    environment,
    browserArgs: [hostResolverRules(environment.allowedOrigins)],
    browserEnv: browserEnvironment(env),
  };
};
