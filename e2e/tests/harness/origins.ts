// The origins the suite serves, all under the reserved `.test` top-level domain
// (RFC 6761), so none can resolve to a real host. Every one is a Playwright
// route on the browser context; anything else is refused (hermetic.ts).

import { fileURLToPath } from "node:url";

/** The Wrapper's release bundle, `apps/wrapper/dist`, unmodified. */
export const WRAPPER_ORIGIN = "https://wrapper.e2e.test";

/** The suite's own test pages (`tests/pages`), such as the leaking page. */
export const PAGES_ORIGIN = "https://pages.e2e.test";

/**
 * The game origin D of the suite, a different registrable domain from every
 * other origin (W-37): the one the fake Play API's redeem answers as
 * `gameOrigin`, the only one on the environment configuration's `gameOrigins`,
 * and where the reference game's build is served.
 */
export const GAME_ORIGIN = "https://game.e2e-games.test";

/**
 * Where the fake Play API's redeem answer places the game: D, and the page path
 * `/` (D's root, where the reference game is served). The document's server
 * always sends `gamePath`, so the fake does too (W-37).
 */
export const REDEEM_GAME = { gameOrigin: GAME_ORIGIN, gamePath: "/" } as const;

/**
 * The fake operator page A (T-9a): on `operatorOrigins` when a test lists it,
 * with its lobby and deposit pages (`tests/operator`). A registrable domain of
 * its own.
 */
export const OPERATOR_ORIGIN = "https://casino.e2e-operator.test";

/** The same pages on an origin no configuration lists (T-9a). */
export const UNLISTED_ORIGIN = "https://pages.e2e-unlisted.test";

export const WRAPPER_DIST = fileURLToPath(
  new URL("../../../apps/wrapper/dist/", import.meta.url),
);

/** The reference game's build, `apps/reference-game/dist`, unmodified. */
export const REFERENCE_GAME_DIST = fileURLToPath(
  new URL("../../../apps/reference-game/dist/", import.meta.url),
);

export const TEST_PAGES = fileURLToPath(new URL("../pages/", import.meta.url));

/** The fake operator's pages (`tests/operator`). */
export const OPERATOR_PAGES = fileURLToPath(
  new URL("../operator/", import.meta.url),
);

/** The fixed server time of the fake Play API. */
export const FAKE_NOW = new Date("2026-10-16T12:00:00.000Z");
