// T-19 (W-25, W-26, W-33, W-35): the required cancel in the browser. A tip
// check the fake RPC endpoints make fail (another hash at `h_low`, another
// chain id, or no answer) fails the round with `T_0` settled, so the Wrapper
// signs the one `PlayerCancel`, whose bytes and signature are the vendored
// vectors'. The fake then answers it `resolving`, and the cancel's own reads
// settle it: `canceled` ("this round failed verification and was canceled"),
// `idle` (a neutral "round ended", with one more read), `active` at a version
// no lower than the answer's (it did not take; the round stays failed; a lower
// one is stale, W-29), or 30 reads of `resolving` ("still resolving
// — contact support", then a "check again" that finds the result of a round
// that had closed before the cancel arrived). A round that had closed before
// the cancel arrived (se-backend b47b286) is never shown as canceled by the
// player: `canceled` with `closeReason: "expired"` reads "this round failed
// verification" and the time limit's line, and `won` or `lost` its result with
// "this round failed verification; it closed before the cancel arrived". Every
// state passes the accessibility audit. The Wrapper's timers run on the page's clock; the
// `check-later` test moves it 2 s at a time and counts the reads.

import type { Page } from "@playwright/test";

import { auditAccessibility } from "./harness/accessibility.ts";
import type { FakePlayApi } from "./harness/fake-play-types.ts";
import type { ProviderBehavior } from "./harness/fake-rpc.ts";
import {
  expect,
  scriptCancel,
  snapshotAnswer,
  test,
} from "./harness/round-play.ts";
import { ROUND } from "./harness/round-vector.ts";
import {
  alertPanel,
  launchAndStart,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

const resolving = snapshotAnswer("coinflip-resolving-cancel");

/** W-35: the counted reads before the cancel is `check-later`. */
const SETTLING_READS = 30;

/** The most clock ticks the 30 counted reads may take (500 ms rising to 2 s). */
const MAX_TICKS = 40;

/**
 * Moves the page's clock 2 s at a time, each tick waiting for the read it
 * starts, until the cancel is `check-later` ("still resolving"). The last
 * read's answer can still be on its way to the screen when a tick starts, and
 * `check-later` makes no read for 30 s, so a tick also ends when that text
 * shows.
 */
const untilCheckLater = async (
  page: Page,
  fake: FakePlayApi,
): Promise<void> => {
  const checkLater = page.getByText(TEXT.checkLater);
  for (let tick = 0; tick < MAX_TICKS; tick += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each tick lets one read run
    if ((await checkLater.count()) > 0) return;
    const reads = servedFor(fake, "getSnapshot").length;
    // oxlint-disable-next-line no-await-in-loop -- one tick at a time
    await page.clock.runFor(2_000);
    // oxlint-disable-next-line no-await-in-loop -- the tick's read arrives
    await expect
      .poll(
        async () =>
          servedFor(fake, "getSnapshot").length > reads ||
          (await checkLater.count()) > 0,
      )
      .toBe(true);
  }
};

/** Each way the fake RPC endpoints fail the tip check, and what is shown. */
const FAILURES: readonly (readonly [ProviderBehavior, string])[] = [
  ["other-hash", TEXT.verificationFailed],
  ["other-chain", TEXT.verificationFailed],
  ["error", TEXT.chainUnverified],
];

test.describe("T-19: the required cancel", () => {
  for (const [behavior, shown] of FAILURES) {
    test(`a tip check failed by ${behavior} signs the cancel, which settles`, async ({
      page,
      fakePlayApi,
      fakeRpc,
    }) => {
      fakeRpc.behave("p2", behavior);
      scriptCancel(fakePlayApi, [resolving]);
      fakePlayApi.answerEvery("getSnapshot", resolving);
      await launchAndStart(page, fakePlayApi);
      await expect(alertPanel(page)).toContainText(shown, { timeout: 15_000 });
      // Signed once, with the vendored bytes (the answer's check).
      expect(servedFor(fakePlayApi, "cancelRound")).toHaveLength(1);
      await expect(page.locator("iframe")).toHaveAttribute("inert", "");
      await expect(
        page.locator('.se-overlay[data-form="cover"]'),
      ).toBeVisible();
      await expect(page.getByText(TEXT.canceled)).toHaveCount(0);
      expect(await auditAccessibility(page)).toEqual([]);
    });
  }

  test("a canceled read: the round failed verification and was canceled", async ({
    page,
    fakePlayApi,
    fakeRpc,
  }) => {
    fakeRpc.behave("p2", "other-hash");
    scriptCancel(fakePlayApi, [snapshotAnswer("coinflip-canceled")]);
    await launchAndStart(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.canceled, {
      timeout: 15_000,
    });
    await expect(page.getByText(TEXT.canceledUnverified)).toBeVisible();
    await expect(page.getByText(ROUND.roundId)).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("a canceled read the time limit closed: failed verification, never canceled by the player", async ({
    page,
    fakePlayApi,
    fakeRpc,
  }) => {
    fakeRpc.behave("p2", "other-hash");
    scriptCancel(fakePlayApi, [
      snapshotAnswer("coinflip-canceled-expired-no-action"),
    ]);
    await launchAndStart(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.canceled, {
      timeout: 15_000,
    });
    await expect(page.getByText(TEXT.unverified)).toBeVisible();
    await expect(page.getByText(TEXT.expired)).toBeVisible();
    await expect(page.getByText(TEXT.canceledUnverified)).toHaveCount(0);
    await expect(page.getByText(ROUND.roundId)).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("a won read: the result, closed before the cancel arrived", async ({
    page,
    fakePlayApi,
    fakeRpc,
  }) => {
    fakeRpc.behave("p2", "other-hash");
    scriptCancel(fakePlayApi, [snapshotAnswer("coinflip-won")]);
    await launchAndStart(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.won, {
      timeout: 15_000,
    });
    await expect(page.getByText(TEXT.closedBeforeCancel)).toBeVisible();
    await expect(page.getByText(ROUND.roundId)).toBeVisible();
    await expect(page.getByRole("link", { name: TEXT.verify })).toBeVisible();
    await expect(
      page.getByRole("button", { name: TEXT.playAgain }),
    ).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("an idle read: a neutral round ended, after one more read", async ({
    page,
    fakePlayApi,
    fakeRpc,
  }) => {
    fakeRpc.behave("p2", "other-hash");
    const idle = snapshotAnswer("coinflip-idle");
    scriptCancel(fakePlayApi, [idle, idle]);
    await launchAndStart(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.ended, {
      timeout: 15_000,
    });
    await expect(page.getByText(ROUND.roundId)).toBeVisible();
    await expect(page.getByRole("link", { name: TEXT.verify })).toBeVisible();
    await expect(
      page.getByRole("button", { name: TEXT.playAgain }),
    ).toBeVisible();
    await Promise.all(
      [TEXT.won, TEXT.lost, TEXT.canceled].map(claim =>
        expect(page.getByText(claim)).toHaveCount(0),
      ),
    );
    // The launch read, the cancel's read, and the one read after `ended`.
    await expect
      .poll(() => servedFor(fakePlayApi, "getSnapshot").length)
      .toBe(3);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("an active read: the cancel did not take, and the round stays failed", async ({
    page,
    fakePlayApi,
    fakeRpc,
  }) => {
    fakeRpc.behave("p2", "other-hash");
    // The read is `active` at the `resolving` answer's version (3): a lower
    // one, the vendored vector's 2, would be stale and decide nothing (W-29).
    scriptCancel(fakePlayApi, [
      { kind: "snapshot-version", vector: "coinflip-active", version: 3 },
    ]);
    await launchAndStart(page, fakePlayApi);
    await expect(alertPanel(page)).toContainText(TEXT.verificationFailed, {
      timeout: 15_000,
    });
    await expect
      .poll(() => servedFor(fakePlayApi, "getSnapshot").length)
      .toBe(2);
    expect(servedFor(fakePlayApi, "cancelRound")).toHaveLength(1);
    await expect(page.locator("iframe")).toHaveAttribute("inert", "");
    await expect(page.locator('.se-overlay[data-form="cover"]')).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("30 resolving reads: still resolving, and check again settles it", async ({
    page,
    fakePlayApi,
    fakeRpc,
  }) => {
    fakeRpc.behave("p2", "other-hash");
    scriptCancel(fakePlayApi, []);
    fakePlayApi.answerEvery("getSnapshot", resolving);
    await launchAndStart(page, fakePlayApi);
    await expect(alertPanel(page)).toContainText(TEXT.verificationFailed, {
      timeout: 15_000,
    });
    await untilCheckLater(page, fakePlayApi);
    // Exactly W-35's 30 counted reads (the first inside the start), after the
    // launch read: "still resolving" comes at the 30th, not before or after.
    expect(servedFor(fakePlayApi, "getSnapshot")).toHaveLength(
      1 + SETTLING_READS,
    );
    await expect(statusHeading(page)).toHaveText(TEXT.checkLater);
    await expect(page.getByText(ROUND.roundId)).toBeVisible();
    await expect(page.getByRole("link", { name: TEXT.verify })).toBeVisible();
    await expect(
      page.getByRole("button", { name: TEXT.playAgain }),
    ).toHaveCount(0);
    expect(await auditAccessibility(page)).toEqual([]);
    // A round still resolving after the cancel had closed before it arrived:
    // "check again" finds its result (`lost`, a later version than the
    // `resolving` reads; W-25, W-29).
    fakePlayApi.answer("getSnapshot", snapshotAnswer("coinflip-lost"));
    await page.getByRole("button", { name: TEXT.checkAgain }).click();
    await expect(statusHeading(page)).toHaveText(TEXT.lost);
    await expect(page.getByText(TEXT.closedBeforeCancel)).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
