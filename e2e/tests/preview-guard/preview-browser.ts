// A Chromium browser of the preview-guard tests' own, launched with the preview
// project's block derived from an allow-list (`hostResolverRules`), through the
// start lock like the suite's other extra browsers (`harness/browser-start.ts`).
// The fake Chromium project's block resolves no host at all, loopback included,
// so a guard test that needs an allowed origin to answer launches its own with
// the preview project's flags; that also proves the derivation end to end.

import type { Browser, BrowserType } from "@playwright/test";

import { startBrowser } from "../harness/browser-start.ts";
import { hostResolverRules } from "../preview-support/preview-browser-flags.ts";

export const launchPreviewBrowser = (
  chromium: BrowserType,
  allowedOrigins: readonly string[],
): Promise<Browser> =>
  startBrowser(timeout =>
    chromium.launch({
      timeout,
      args: [hostResolverRules(allowedOrigins)],
    }),
  );
