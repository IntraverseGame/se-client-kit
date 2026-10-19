// Driving the Wrapper's release bundle as a player would: launching it through
// the fake's launch URL (the code in the fragment), and reading its status
// heading, alert, and live region. The texts are the Wrapper's English
// catalogue, the session language of every vector.

import type { Page } from "@playwright/test";

import type { FakePlayApi } from "./fake-play-types.ts";
import { WRAPPER_ORIGIN } from "./origins.ts";

/** The Wrapper's page, without a fragment. */
export const WRAPPER_PAGE = `${WRAPPER_ORIGIN}/`;

/** Texts of the Wrapper's English catalogue the tests look for. */
export const TEXT = {
  idle: "Place your bet",
  starting: "Preparing the round",
  active: "Your round is in play",
  resolving: "Resolving",
  start: "Start round",
  sessionEnded: "Your session has ended",
  otherTab: "This session is open in another tab",
  unsupported: "This browser cannot keep your session safe",
  connection: "Connection problem",
  offline: "Your device is offline.",
  error: "Something went wrong",
  verificationFailed: "This round failed verification",
  chainNotIndependent: "Chain check not independent (development)",
  configuration: "The game cannot start",
  won: "You won",
  payout: "Payout",
  lost: "You lost",
  canceled: "Round canceled",
  canceledUnverified: "This round failed verification and was canceled.",
  unverified: "This round failed verification.",
  closedBeforeCancel:
    "This round failed verification; it closed before the cancel arrived.",
  expired: "The time limit ended this round.",
  ended: "Round ended",
  checkLater: "Still resolving — contact support",
  moveUnconfirmed: "Your move hasn't been confirmed",
  unconfirmedDetail: "If it never arrives, the round ends by its time limit.",
  checkAgain: "Check again",
  chainUnverified: "Could not verify the chain",
  outOfSync: "This round is out of sync",
  rejected: "The game state could not be read",
  verify: "Verify this round",
  lobby: "Back to the lobby",
} as const;

/**
 * Opens the Wrapper with the fake's launch URL. When `scan` is given, the
 * launch navigation is allowed in the secret scan (the code is in the fragment,
 * which the Wrapper removes before any request).
 */
export const launch = async (
  page: Page,
  fake: FakePlayApi,
  scan?: { readonly allowLaunchNavigation: (url: string) => void },
): Promise<void> => {
  const url = fake.launchUrl(WRAPPER_PAGE);
  scan?.allowLaunchNavigation(url);
  await page.goto(url);
};

/** The status section's heading. */
export const statusHeading = (page: Page): ReturnType<Page["locator"]> =>
  page.locator(".se-status h1");

/** The `role="alert"` panel. */
export const alertPanel = (page: Page): ReturnType<Page["locator"]> =>
  page.locator('[role="alert"]');

/** The polite live region. */
export const liveRegion = (page: Page): ReturnType<Page["locator"]> =>
  page.locator('[aria-live="polite"]');

/** The calls the fake served for `id`. */
export const servedFor = (
  fake: FakePlayApi,
  id: string,
): readonly FakePlayApi["served"][number][] =>
  fake.served.filter(entry => entry.operationId === id);

/**
 * Scripts a session at `idle` whose start is answered with a `starting` round
 * that carries no `CreateRoundAuth` yet (W-26 waits), read again as `starting`
 * by every later poll.
 */
export const scriptStartingRound = (fake: FakePlayApi): void => {
  fake.answer("getSnapshot", { kind: "snapshot", vector: "coinflip-idle" });
  fake.answerEvery("getSnapshot", {
    kind: "snapshot",
    vector: "coinflip-starting-created",
  });
  fake.answer("startRound", {
    kind: "snapshot",
    vector: "coinflip-starting-created",
  });
};

/** Launches the Wrapper, waits for the bet selector, and starts the round. */
export const launchAndStart = async (
  page: Page,
  fake: FakePlayApi,
  scan?: { readonly allowLaunchNavigation: (url: string) => void },
): Promise<void> => {
  await launch(page, fake, scan);
  await page.getByRole("button", { name: TEXT.start }).click();
};
