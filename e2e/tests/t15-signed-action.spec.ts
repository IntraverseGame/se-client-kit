// T-15, the signed action (AC5, W-16, W-43): the network fails while the
// player's move is in flight. A lost response is repeated with the same bytes
// and `idempotencyKey`, never a new signature. With the browser offline, every
// attempt of the move (the transport's retries) is the same signed bytes and
// key and fails, the connection-problem state shows, and the round is kept;
// when the connection returns, the Snapshot is read first. What is sent after
// that read (the one resend of a move it shows not applied, W-16) is a pending
// row (pending.spec.ts). The connection-problem state passes the
// accessibility audit. The Wrapper's timers (the transport's retries, the
// polls) run on the page's clock.

import { isDeepStrictEqual } from "node:util";

import { auditAccessibility } from "./harness/accessibility.ts";
import type { BodyCheck } from "./harness/fake-play-wire.ts";
import {
  advanceUntil,
  callTails,
  expect,
  shows,
  test,
  toReady,
} from "./harness/round-play.ts";
import { pickCheck, ROUND_VECTOR } from "./harness/round-vector.ts";
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

test.describe("T-15: offline during a signed action", () => {
  test("a lost response to the move is repeated with the same bytes and key", async ({
    page,
    fakePlayApi,
  }) => {
    await toReady(page, fakePlayApi);
    fakePlayApi.answer(
      "continueRound",
      { kind: "network-failure", expect: pickCheck },
      { kind: "snapshot", vector: "coinflip-won", expect: pickCheck },
    );
    await callTails(page);
    // The transport repeats it after its backoff, on the page's clock.
    await advanceUntil(
      page,
      async () => (await statusHeading(page).textContent()) === TEXT.won,
    );
    const moves = servedFor(fakePlayApi, "continueRound").map(
      call => call.body,
    );
    expect(moves).toHaveLength(2);
    expect(pickCheck(moves[0])).toBeUndefined();
    // The same signed bytes, signature, and idempotency key (W-16).
    expect(moves[1]).toEqual(moves[0]);
  });

  test("offline: the attempts are one signed move, and the Snapshot is read first", async ({
    page,
    fakePlayApi,
    network,
  }) => {
    await toReady(page, fakePlayApi);
    await network.goOffline();
    await callTails(page);
    // The transport's attempts fail offline, one backoff after another.
    await advanceUntil(page, shows(alertPanel(page), TEXT.connection));
    await expect(alertPanel(page)).toContainText(TEXT.offline);
    await expect(statusHeading(page)).toHaveText(TEXT.active);
    // Every attempt failed offline, and each is the one signed move (W-16).
    const attempts = servedFor(fakePlayApi, "continueRound").map(
      call => call.body,
    );
    expect(attempts.length).toBeGreaterThan(0);
    expect(pickCheck(attempts[0])).toBeUndefined();
    for (const attempt of attempts) expect(attempt).toEqual(attempts[0]);
    expect(await auditAccessibility(page)).toEqual([]);
    // Any move sent after the read (the one resend, W-16, once the resend
    // change lands) is answered with the round as the read shows it, and must
    // be the first attempt's body, field for field: the same typedData,
    // signature, idempotencyKey, and round. Nothing here asserts whether it is
    // sent.
    const [first] = attempts;
    fakePlayApi.answerEvery("continueRound", {
      kind: "snapshot",
      vector: ROUND_VECTOR,
      expect: sameMoveAs(first),
    });
    const before = fakePlayApi.served.length;
    await network.goOnline();
    // The Snapshot is read first (W-43): the round, still at its first step.
    await expect.poll(() => fakePlayApi.served.length).toBeGreaterThan(before);
    expect(fakePlayApi.served[before]?.operationId).toBe("getSnapshot");
    await expect(alertPanel(page)).not.toContainText(TEXT.connection);
    await expect(statusHeading(page)).toHaveText(TEXT.active);
  });
});
