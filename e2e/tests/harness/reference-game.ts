// The reference game's build (`apps/reference-game/dist`, unmodified), served
// at its own origin, a different registrable domain from every other origin of
// the suite (W-37), through a context route like the other static origins. It
// is served by the specs that use it, after the hermetic guard, so its route
// takes its own requests.

import { fileURLToPath } from "node:url";

import type { BrowserContext } from "@playwright/test";

import { serveDirectory } from "./static-origin.ts";

/** The game origin D of the suite. */
export const GAME_ORIGIN = "https://game.e2e-games.test";

export const REFERENCE_GAME_DIST = fileURLToPath(
  new URL("../../../apps/reference-game/dist/", import.meta.url),
);

export const serveReferenceGame = async (
  context: BrowserContext,
): Promise<void> => {
  await serveDirectory(context, GAME_ORIGIN, REFERENCE_GAME_DIST);
};
