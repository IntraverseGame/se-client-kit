// Everything the suite serves: the Wrapper's release bundle and the test pages
// at their static origins, and the Wrapper's environment configuration
// document (which the SuperEngine side serves in a real environment).

import type { BrowserContext } from "@playwright/test";

import {
  environmentConfig,
  serveEnvironmentConfig,
} from "./environment-config.ts";
import {
  PAGES_ORIGIN,
  TEST_PAGES,
  WRAPPER_DIST,
  WRAPPER_ORIGIN,
} from "./origins.ts";
import { serveDirectory } from "./static-origin.ts";

export const serveOrigins = async (
  context: BrowserContext,
  playApiBaseUrl: string,
): Promise<void> => {
  await serveDirectory(context, WRAPPER_ORIGIN, WRAPPER_DIST);
  await serveDirectory(context, PAGES_ORIGIN, TEST_PAGES);
  await serveEnvironmentConfig(context, environmentConfig(playApiBaseUrl));
};
