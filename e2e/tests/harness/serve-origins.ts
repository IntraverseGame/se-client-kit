// Everything the suite serves: the Wrapper's release bundle, the test pages,
// the fake operator's pages (at a listed and an unlisted origin), and the
// reference game's build at their static origins (the game at D, so a
// Wrapper session mounts it), and the Wrapper's environment configuration
// document (which the SuperEngine side serves in a real environment). A test
// that serves another game at D registers its route after these, so it wins.

import type { BrowserContext } from "@playwright/test";

import {
  environmentConfig,
  serveEnvironmentConfig,
} from "./environment-config.ts";
import {
  GAME_ORIGIN,
  OPERATOR_ORIGIN,
  OPERATOR_PAGES,
  PAGES_ORIGIN,
  REFERENCE_GAME_DIST,
  TEST_PAGES,
  UNLISTED_ORIGIN,
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
  await serveDirectory(context, OPERATOR_ORIGIN, OPERATOR_PAGES);
  await serveDirectory(context, UNLISTED_ORIGIN, OPERATOR_PAGES);
  await serveDirectory(context, GAME_ORIGIN, REFERENCE_GAME_DIST);
  await serveEnvironmentConfig(context, environmentConfig(playApiBaseUrl));
};
