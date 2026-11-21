// T-50, the signing page's half (S6b; W-66 to W-72, SP-4 to SP-13): the
// delegation in a browser, on the release bundle, against the fake Play API,
// with the signing page served from the release's `signer/` at its own origin
// and the replay wallet (harness/delegation-round.ts). The confirm opens the
// window; the page lists the wallet and passes the audit; the wallet's
// signature reaches the Wrapper, the window closes (the page closes itself
// after its answer, SP-9; the Wrapper's close is the fallback, W-66), and the
// Wrapper says "Wallet linked"; the next start carries the vector's `keyDelegation`; the round's
// Snapshots echo it as `proofs.keyDelegation` and the round passes the check,
// or leave it out and the round fails verification and the shell sends one
// `PlayerCancel`; a window closed before the signature leaves the entry
// offered and the start undelegated; a 422 `KEY_DELEGATION_INVALID` shows
// "Sign again" and "Continue without"; and T-13's scan finds no wallet
// address, signature, or session id in storage, a URL, or the console.

import type { Page } from "@playwright/test";

import { auditAccessibility } from "./harness/accessibility.ts";
import {
  DELEGATION_TEXT,
  expect,
  openConsent,
  openSigningWindow,
  signInWindow,
  test,
  vectorKeyDelegation,
} from "./harness/delegation-round.ts";
import type { FakePlayApi } from "./harness/fake-play-types.ts";
import { delegationVector } from "./harness/replay-wallet.ts";
import { advanceUntil, snapshotAnswer } from "./harness/round-play.ts";
import {
  cancelCheck,
  ROUND_VECTOR,
  startCheck,
} from "./harness/round-vector.ts";
import {
  alertPanel,
  isPlayable,
  launch,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

const KEY_DELEGATED = "coinflip-active-key-delegation";

/** Waits until `count` starts have reached the fake (the click does not). */
const startsServed = async (fake: FakePlayApi, count = 1): Promise<void> => {
  await expect.poll(() => servedFor(fake, "startRound").length).toBe(count);
};

/** The start's `keyDelegation`, its wallet compared without case. */
const sentDelegation = (fake: FakePlayApi): unknown => {
  const [start] = servedFor(fake, "startRound");
  const body = start?.body as
    | { readonly keyDelegation?: { wallet: string } }
    | undefined;
  const sent = body?.keyDelegation;
  return sent === undefined
    ? undefined
    : { ...sent, wallet: sent.wallet.toLowerCase() };
};

/** Launches at `idle` (read as often as asked) and links the wallet. */
const launchAndLink = async (
  page: Page,
  fake: FakePlayApi,
  scan?: Parameters<typeof launch>[2],
): Promise<void> => {
  fake.answerEvery("getSnapshot", snapshotAnswer("coinflip-idle"));
  await launch(page, fake, scan);
  await expect(statusHeading(page)).toHaveText(TEXT.idle);
  await openConsent(page);
  const signing = await openSigningWindow(page);
  expect(await auditAccessibility(signing)).toEqual([]);
  await signInWindow(page, signing);
};

const placeBet = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: TEXT.placeBet }).click();
};

test.describe("T-50: the wallet delegation, the signing page's half (S6b)", () => {
  test("signed in the window: linked, the start delegated, the round checked and played", async ({
    page,
    fakePlayApi,
  }) => {
    await launchAndLink(page, fakePlayApi);
    await page.getByRole("button", { name: TEXT.menu }).click();
    await expect(page.getByText(DELEGATION_TEXT.linkedLine)).toBeVisible();
    await page.keyboard.press("Escape");
    fakePlayApi.answer(
      "startRound",
      snapshotAnswer("coinflip-starting", startCheck),
    );
    fakePlayApi.answerEvery("getSnapshot", snapshotAnswer(KEY_DELEGATED));
    await placeBet(page);
    await startsServed(fakePlayApi);
    expect(sentDelegation(fakePlayApi)).toEqual(vectorKeyDelegation());
    await advanceUntil(page, () => isPlayable(page));
    await expect(alertPanel(page)).not.toContainText(TEXT.verificationFailed);
    expect(servedFor(fakePlayApi, "cancelRound")).toHaveLength(0);
  });

  test("the window closed once the answer arrives (SP-9, W-66)", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answerEvery("getSnapshot", snapshotAnswer("coinflip-idle"));
    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    await openConsent(page);
    const signing = await openSigningWindow(page);
    const closed = signing.waitForEvent("close", { timeout: 10_000 });
    await signInWindow(page, signing);
    await closed;
    expect(signing.isClosed()).toBe(true);
  });

  test("proofs.keyDelegation left out: the round fails verification, one PlayerCancel", async ({
    page,
    fakePlayApi,
  }) => {
    await launchAndLink(page, fakePlayApi);
    fakePlayApi.answer("startRound", snapshotAnswer(ROUND_VECTOR, startCheck));
    fakePlayApi.answer("cancelRound", {
      kind: "snapshot",
      vector: "coinflip-resolving-cancel",
      expect: cancelCheck,
    });
    fakePlayApi.answerEvery("getSnapshot", snapshotAnswer("coinflip-canceled"));
    await placeBet(page);
    await startsServed(fakePlayApi);
    expect(sentDelegation(fakePlayApi)).toEqual(vectorKeyDelegation());
    await advanceUntil(
      page,
      async () => (await statusHeading(page).textContent()) === TEXT.canceled,
    );
    await expect(page.getByText(TEXT.canceledUnverified)).toBeVisible();
    expect(servedFor(fakePlayApi, "cancelRound")).toHaveLength(1);
  });

  test("the window closed before the signature: the entry still offered, the start undelegated", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answerEvery("getSnapshot", snapshotAnswer("coinflip-idle"));
    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    await openConsent(page);
    const signing = await openSigningWindow(page);
    await signing.close();
    // Two reads of `closed`, 500 ms apart, on the installed clock (W-66).
    await page.clock.runFor(1000);
    await page.getByRole("button", { name: TEXT.menu }).click();
    await expect(
      page.getByRole("button", { name: DELEGATION_TEXT.link }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    fakePlayApi.answer(
      "startRound",
      snapshotAnswer("coinflip-starting", startCheck),
    );
    await placeBet(page);
    await expect(statusHeading(page)).toHaveText(TEXT.starting);
    await startsServed(fakePlayApi);
    expect(sentDelegation(fakePlayApi)).toBeUndefined();
  });

  test("a 422 KEY_DELEGATION_INVALID: Sign again and Continue without", async ({
    page,
    fakePlayApi,
  }) => {
    await launchAndLink(page, fakePlayApi);
    fakePlayApi.answer(
      "startRound",
      { kind: "own-problem", code: "KEY_DELEGATION_INVALID", status: 422 },
      snapshotAnswer("coinflip-starting", startCheck),
    );
    await placeBet(page);
    await expect(alertPanel(page)).toContainText(
      "Your wallet link was refused, and the round did not start.",
    );
    await expect(alertPanel(page)).toContainText(
      "The wallet's signature was not accepted.",
    );
    const signAgain = alertPanel(page).getByRole("button", {
      name: "Sign again",
    });
    const without = alertPanel(page).getByRole("button", {
      name: "Continue without",
    });
    await expect(signAgain).toBeVisible();
    await expect(without).toBeVisible();
    await expect(
      page.getByRole("button", { name: TEXT.placeBet }),
    ).toBeDisabled();
    expect(await auditAccessibility(page)).toEqual([]);
    await signAgain.click();
    const dialog = page.getByRole("dialog", { name: DELEGATION_TEXT.heading });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Not now" }).click();
    await without.click();
    await expect(alertPanel(page)).not.toContainText("Your wallet link");
    await placeBet(page);
    await expect(statusHeading(page)).toHaveText(TEXT.starting);
    await startsServed(fakePlayApi, 2);
    const [, second] = servedFor(fakePlayApi, "startRound");
    expect(second?.body).not.toHaveProperty("keyDelegation");
  });

  test("T-13's scan: no wallet address, signature, or session id stored, in a URL, or logged", async ({
    page,
    fakePlayApi,
    secretScan,
  }) => {
    await launchAndLink(page, fakePlayApi, secretScan);
    fakePlayApi.answer(
      "startRound",
      snapshotAnswer("coinflip-starting", startCheck),
    );
    fakePlayApi.answerEvery("getSnapshot", snapshotAnswer(KEY_DELEGATED));
    await placeBet(page);
    await advanceUntil(page, () => isPlayable(page));
    const vector = delegationVector();
    secretScan.addSecret("delegated wallet", vector.wallet);
    secretScan.addSecret("delegation signature", vector.signature);
    secretScan.addSecret("session id", vector.sessionId);
    await secretScan.expectClean();
  });
});
