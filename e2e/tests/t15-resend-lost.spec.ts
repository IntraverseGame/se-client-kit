// T-15, the resend of a move lost offline (AC5, W-16, W-43). The player's move
// is signed and sent while the browser is offline: every attempt (the
// transport's retries) fails, so the send is lost. When the connection returns,
// the Snapshot is read first, and that read decides (W-16's one resend):
//
// - it shows the move not applied (the round still `active`, at the step before
//   the move: the vendored round's own read): the shell sends the same signed
//   bytes with the same `idempotencyKey` once more, and only once, and its
//   answer (the round `won`) is what the Wrapper and the game show;
// - it shows the move applied (`won`): nothing is sent again;
// - the resend is lost too: nothing more is sent, so the move went out twice,
//   every attempt the one signed move, and the round shows the move not
//   confirmed.
//
// What the page sent is read from the harness's `sent`, which sees every
// attempt in every project; the fake's own records agree where its route sees
// an offline request (Chromium and WebKit, not Playwright's Firefox:
// `OFFLINE_ROUTED`, network.spec.ts). The fake refuses, as an unexpected call
// that fails the test, any move after the read that is not the first
// attempt's body field for field, and any move it was not scripted to take.
//
// The not-confirmed state itself (its texts, "check again" and the background
// read sending no move, its audit) is t15-unconfirmed.spec.ts. The player's own
// resend sharing the one resend is the shell's unit test
// (round-resend-lost.test.ts): the Wrapper calls no `resend`. Every other
// state shown passes the accessibility audit here. The Wrapper's timers (the
// transport's retries) run on the page's clock.

import { isDeepStrictEqual } from "node:util";

import type { Page } from "@playwright/test";

import { auditAccessibility } from "./harness/accessibility.ts";
import type { FakePlayApi } from "./harness/fake-play-types.ts";
import type { BodyCheck } from "./harness/fake-play-wire.ts";
import { type NetworkControl, OFFLINE_ROUTED } from "./harness/network.ts";
import {
  advanceUntil,
  callTails,
  expect,
  gameFrame,
  shows,
  snapshotAnswer,
  test,
  toReady,
} from "./harness/round-play.ts";
import { pickCheck } from "./harness/round-vector.ts";
import {
  alertPanel,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

/** A move whose body is `first`'s, field for field, or a refusal. */
const sameMoveAs =
  (first: unknown): BodyCheck =>
  body =>
    isDeepStrictEqual(body, first)
      ? undefined
      : "a move after the read that is not the first attempt's signed move";

/** Refuses every move: none may be sent. */
const noMove =
  (why: string): BodyCheck =>
  () =>
    why;

/** `body`'s `idempotencyKey`. */
const keyOf = (body: unknown): unknown =>
  typeof body === "object" && body !== null
    ? Reflect.get(body, "idempotencyKey")
    : undefined;

/** Whether the page has sent at least `count` moves (for `advanceUntil`). */
const movesSent =
  (network: NetworkControl, count: number) => (): Promise<boolean> =>
    Promise.resolve(network.sent("continueRound").length >= count);

/** The operations the fake was asked for from `from` on, in order. */
const servedSince = (
  fake: FakePlayApi,
  from: number,
): readonly (string | undefined)[] =>
  fake.served.slice(from).map(entry => entry.operationId);

/** How many moves the fake's route saw: the offline ones per project. */
const routedMoves = (
  browserName: keyof typeof OFFLINE_ROUTED,
  offline: number,
  online: number,
): number => (OFFLINE_ROUTED[browserName] ? offline : 0) + online;

/**
 * Plays the round to the move with the browser offline, until every attempt
 * failed and the connection problem shows, and returns the attempts: each the
 * one signed move.
 */
const loseMoveOffline = async (
  page: Page,
  fake: FakePlayApi,
  network: NetworkControl,
  browserName: keyof typeof OFFLINE_ROUTED,
): Promise<readonly unknown[]> => {
  await toReady(page, fake);
  await network.goOffline();
  await callTails(page);
  // The transport's attempts fail offline, one backoff after another.
  await advanceUntil(page, shows(alertPanel(page), TEXT.connection));
  await expect(alertPanel(page)).toContainText(TEXT.offline);
  await expect(statusHeading(page)).toHaveText(TEXT.active);
  await expect
    .poll(() => network.sent("continueRound").length)
    .toBeGreaterThan(0);
  const attempts = network.sent("continueRound");
  expect(pickCheck(attempts[0])).toBeUndefined();
  for (const attempt of attempts) expect(attempt).toEqual(attempts[0]);
  // Where the fake's route sees an offline request, it records it after the
  // page saw it fail (its record waits on a round trip): wait for the record,
  // so every later read of it starts from a settled count.
  await expect
    .poll(() => servedFor(fake, "continueRound").length)
    .toBe(routedMoves(browserName, attempts.length, 0));
  expect(await auditAccessibility(page)).toEqual([]);
  return attempts;
};

test.describe("T-15: the resend of a move lost offline (W-16)", () => {
  test("the read shows the move not applied: the same signed move is sent once more", async ({
    page,
    fakePlayApi,
    network,
    browserName,
  }) => {
    const attempts = await loseMoveOffline(
      page,
      fakePlayApi,
      network,
      browserName,
    );
    const [first] = attempts;
    // The read is the round's own (`active` at step 0, the step before the
    // move). The resend is answered with the move applied; a third send would
    // be refused.
    fakePlayApi.answer(
      "continueRound",
      snapshotAnswer("coinflip-won", sameMoveAs(first)),
    );
    fakePlayApi.answerEvery("continueRound", {
      kind: "snapshot",
      vector: "coinflip-won",
      expect: noMove("a third send of the move"),
    });
    const before = fakePlayApi.served.length;
    await network.goOnline();
    await advanceUntil(page, movesSent(network, attempts.length + 1));
    const sent = network.sent("continueRound");
    expect(sent).toHaveLength(attempts.length + 1);
    const resend = sent.at(-1);
    // The same signed bytes, signature, round, and idempotency key.
    expect(resend).toEqual(first);
    expect(keyOf(resend)).toBe(keyOf(first));
    // The resend's answer is what the Wrapper and the game show.
    await advanceUntil(
      page,
      async () => (await statusHeading(page).textContent()) === TEXT.won,
    );
    await expect(gameFrame(page).locator("#rg-heading")).toHaveText(TEXT.won);
    // The fake's record, read only now: it records a call before it answers
    // it, and "You won" is the resend's answer, so the record is complete
    // (the page's `sent` sees a request before the fake's route records it).
    // The Snapshot is read first, and then the move is sent once more.
    expect(servedSince(fakePlayApi, before)).toEqual([
      "getSnapshot",
      "continueRound",
    ]);
    // Every move the fake saw is the one signed move.
    await expect
      .poll(() => servedFor(fakePlayApi, "continueRound").length)
      .toBe(routedMoves(browserName, attempts.length, 1));
    for (const call of servedFor(fakePlayApi, "continueRound")) {
      expect(call.body).toEqual(first);
    }
    // Only once: more time on the clock sends nothing more.
    await page.clock.runFor(30_000);
    expect(network.sent("continueRound")).toHaveLength(attempts.length + 1);
    await expect(alertPanel(page)).not.toContainText(TEXT.connection);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("the read shows the move applied: nothing is resent", async ({
    page,
    fakePlayApi,
    network,
    browserName,
  }) => {
    const attempts = await loseMoveOffline(
      page,
      fakePlayApi,
      network,
      browserName,
    );
    fakePlayApi.answerEvery("getSnapshot", snapshotAnswer("coinflip-won"));
    fakePlayApi.answerEvery("continueRound", {
      kind: "snapshot",
      vector: "coinflip-won",
      expect: noMove("a resend after a read that shows the move applied"),
    });
    const before = fakePlayApi.served.length;
    await network.goOnline();
    await advanceUntil(
      page,
      async () => (await statusHeading(page).textContent()) === TEXT.won,
    );
    expect(servedSince(fakePlayApi, before)[0]).toBe("getSnapshot");
    await page.clock.runFor(30_000);
    expect(servedSince(fakePlayApi, before)).not.toContain("continueRound");
    expect(network.sent("continueRound")).toHaveLength(attempts.length);
    await expect(alertPanel(page)).not.toContainText(TEXT.connection);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("the resend is lost too: the move is sent twice, never a third time", async ({
    page,
    fakePlayApi,
    network,
    browserName,
  }) => {
    const attempts = await loseMoveOffline(
      page,
      fakePlayApi,
      network,
      browserName,
    );
    const [first] = attempts;
    // Every attempt of the resend gets no answer either.
    fakePlayApi.answerEvery("continueRound", {
      kind: "network-failure",
      expect: sameMoveAs(first),
    });
    const before = fakePlayApi.served.length;
    await network.goOnline();
    // The resend is one send: its attempts are the transport's, as many as the
    // first send's, each the same signed move.
    await advanceUntil(page, movesSent(network, 2 * attempts.length));
    expect(servedSince(fakePlayApi, before)[0]).toBe("getSnapshot");
    await page.clock.runFor(30_000);
    const sent = network.sent("continueRound");
    expect(sent).toHaveLength(2 * attempts.length);
    for (const move of sent) expect(move).toEqual(first);
    // The state the move is left in (audited in t15-unconfirmed.spec.ts). It
    // shows once the resend's last attempt failed, which the fake records
    // before it fails it, so the fake's record is complete only from here.
    await expect(statusHeading(page)).toHaveText(TEXT.moveUnconfirmed);
    await expect
      .poll(() => servedFor(fakePlayApi, "continueRound").length)
      .toBe(routedMoves(browserName, attempts.length, attempts.length));
    for (const call of servedFor(fakePlayApi, "continueRound")) {
      expect(call.body).toEqual(first);
    }
  });
});
