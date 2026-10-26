// The preview fixtures' network, in one place (RFC-002): the preview guard
// (deny by default, with the allow-list) and, after it so its route takes the
// game's requests, the shared game origin served by a route from the reference
// game's build. The game origin never reaches the network: a route fulfils it.

import type { BrowserContext } from "@playwright/test";

import { REFERENCE_GAME_DIST } from "../harness/origins.ts";
import { serveDirectory } from "../harness/static-origin.ts";
import { guardPreview, type PreviewGuard } from "./guard-preview.ts";
import type { PreviewEnvironment } from "./preview-environment.ts";

export const installPreviewNetwork = async (
  context: BrowserContext,
  environment: PreviewEnvironment,
): Promise<PreviewGuard> => {
  const guard = await guardPreview(context, environment.allowedOrigins);
  await serveDirectory(context, environment.gameOrigin, REFERENCE_GAME_DIST);
  return guard;
};

export type { PreviewGuard };
