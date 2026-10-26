// What the preview specs do on the Wrapper's page and in the game's frame, and
// what they assert about a round that ended (RFC-002, "What each row asserts in
// preview mode"). A real stack draws its own rounds, so the assertions are the
// properties the contracts promise, read from the Snapshot the browser actually
// received (never logged) and the verify API's answer. The Wrapper's own rules
// are the Wrapper's: nothing here relaxes one. Every amount is a string or a
// `bigint`, never a JS `number`.

import type { FrameLocator, Locator, Page } from "@playwright/test";

import { auditAccessibility } from "../harness/accessibility.ts";
import { expect } from "../harness/worker-browser.ts";
import { statusHeading, TEXT } from "../harness/wrapper-page.ts";
import type { PreviewSession } from "./preview-session.ts";
import { payoutsAgree } from "./preview-snapshots.ts";
import type { RoundOutcome } from "./round-loop.ts";

/**
 * How long the stack may take to answer a step of a round (the round's
 * preparation, the chain read, the settlement), in real time: a quarter of a
 * test's timeout, since a test waits for several steps (runbook, "Timeouts").
 */
export const STACK_STEP_TIMEOUT_MS = 30_000;

const stack = { timeout: STACK_STEP_TIMEOUT_MS } as const;

/** The game frame. */
export const gameFrame = (page: Page): FrameLocator =>
  page.frameLocator("iframe");

/** Starts a round with the bet the Wrapper offers (it never chooses one). */
export const startRound = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: TEXT.start }).click(stack);
};

/** Waits until the Wrapper shows the round `active` (W-26 passed) with its game. */
export const awaitActive = async (page: Page): Promise<void> => {
  await expect(statusHeading(page)).toHaveText(TEXT.active, stack);
  await expect(page.locator("iframe")).toBeVisible(stack);
};

/** Waits until a tile or a call of the game takes a pick, then clicks it. */
export const pickIn = async (control: Locator): Promise<void> => {
  await expect(control).toHaveAttribute("aria-disabled", "false", stack);
  await control.click();
};

/** Coin Flip's pick: heads. */
export const callHeads = async (page: Page): Promise<void> => {
  await pickIn(gameFrame(page).getByRole("button", { name: "Heads" }));
};

/** The first tile of the first row of a Cash or Crash round. */
export const pickFirstTile = async (page: Page): Promise<void> => {
  const row = gameFrame(page).getByRole("group", { name: "Row 1" });
  await pickIn(row.getByRole("button", { name: "Tile 1" }));
};

/** Waits until a Coin Flip round ends and returns how. */
export const awaitSettled = async (page: Page): Promise<RoundOutcome> => {
  const heading = statusHeading(page);
  await expect(heading).toHaveText(
    new RegExp(`^(?:${TEXT.won}|${TEXT.lost})$`, "u"),
    stack,
  );
  return (await heading.textContent()) === TEXT.won ? "won" : "lost";
};

/**
 * What every round that ended must show (T-10, T-11, T-12): the heading agrees
 * with the Snapshot; the round id shown is the settled Snapshot's `roundId`;
 * the verify link is present; the verify API's answer for the round id is 200
 * with a `status` that agrees and a `payout` equal to the Snapshot's (as
 * `bigint`); and the payout line is shown, with the Snapshot's `formatted`,
 * exactly when the payout is above 0 (W-34). `endedBefore` is how many rounds
 * had ended when this one began. Returns the settled round's id.
 */
export const expectSettledRound = async (
  page: Page,
  session: PreviewSession,
  outcome: RoundOutcome,
  endedBefore: number,
): Promise<{ readonly roundId: string }> => {
  // The Snapshot of this round, not an earlier one: one more round has ended.
  await expect
    .poll(() => session.settledCount(), stack)
    .toBeGreaterThan(endedBefore);
  const settled = session.lastSettled();
  const roundId = settled?.roundId;
  if (settled === undefined || roundId === undefined) {
    throw new Error("no settled Snapshot was read");
  }
  expect(settled.status).toBe(outcome);
  await expect(page.getByText(roundId)).toBeVisible();
  await expect(page.getByRole("link", { name: TEXT.verify })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  const verification = await session.verify(roundId);
  expect(verification.roundId).toBe(roundId);
  expect(verification.status).toBe(outcome);
  expect(
    payoutsAgree({
      snapshot: settled.payout,
      verification: verification.payout,
    }),
  ).toBe(true);
  const paid = (settled.payout?.value ?? 0n) > 0n;
  const line = page.locator(".se-status");
  await (paid && settled.payout !== undefined
    ? expect(line).toContainText(`${TEXT.payout} ${settled.payout.formatted}`)
    : expect(line).not.toContainText(TEXT.payout));
  return { roundId };
};

/** The accessibility audit on the result state (`axe`, as in T-10 today). */
export const expectAccessibleResult = async (page: Page): Promise<void> => {
  expect(await auditAccessibility(page)).toEqual([]);
};

/**
 * One full Coin Flip round: start with the offered bet, wait for `active`, call
 * heads, wait for the end, and check it (`expectSettledRound`). Returns how it
 * ended.
 */
export const playCoinFlipRound = async (
  page: Page,
  session: PreviewSession,
): Promise<RoundOutcome> => {
  const endedBefore = session.settledCount();
  await startRound(page);
  await awaitActive(page);
  await callHeads(page);
  const outcome = await awaitSettled(page);
  await expectSettledRound(page, session, outcome, endedBefore);
  return outcome;
};

/**
 * Where the first pick of a Cash or Crash round stands now: `survived` when the
 * Wrapper offers the cash-out (W-24), `lost` when the status heading says the
 * round was lost, `waiting` otherwise. Every read is bounded: an absent heading
 * is `waiting`, never a wait until the test's timeout.
 */
export const firstPickState = async (
  page: Page,
): Promise<"lost" | "survived" | "waiting"> => {
  if (await page.getByRole("button", { name: TEXT.cashOut }).isVisible()) {
    return "survived";
  }
  const lost = await statusHeading(page)
    .filter({ hasText: TEXT.lost })
    .isVisible();
  return lost ? "lost" : "waiting";
};

/** Waits until the first pick of a Cash or Crash round is answered. */
export const awaitFirstPick = async (
  page: Page,
): Promise<"lost" | "survived"> => {
  await expect.poll(() => firstPickState(page), stack).not.toBe("waiting");
  const result = await firstPickState(page);
  return result === "survived" ? "survived" : "lost";
};

/**
 * One Cash or Crash round up to its first pick: start, wait for `active`, pick
 * the first tile of row 0. Returns `won` when the pick survived and the Wrapper
 * now offers the cash-out (W-24; the round has not ended), or `lost` when the
 * pick ended the round (checked like any ended round).
 */
export const playCashOrCrashFirstPick = async (
  page: Page,
  session: PreviewSession,
): Promise<RoundOutcome> => {
  const endedBefore = session.settledCount();
  await startRound(page);
  await awaitActive(page);
  await pickFirstTile(page);
  const result = await awaitFirstPick(page);
  if (result === "lost") {
    await expectSettledRound(page, session, "lost", endedBefore);
    return "lost";
  }
  return "won";
};

/** Nothing more is offered after the close (W-24): no cash-out, no open tile. */
export const expectNothingOffered = async (page: Page): Promise<void> => {
  await expect(page.getByRole("button", { name: TEXT.cashOut })).toHaveCount(0);
  const tiles = await gameFrame(page)
    .getByRole("button", { name: /^Tile \d/u })
    .all();
  await Promise.all(
    tiles.map(tile => expect(tile).toHaveAttribute("aria-disabled", "true")),
  );
};
