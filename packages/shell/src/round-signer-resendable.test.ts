// What a W-16 resend may send (`resendable`): the pending move or cash-out in
// the `open`, `adopted`, and `reissued` phases, and nothing in any other phase
// (W-19's hold, a failed check, out of sync, closed, the session ended) or for
// a cancel. The flow's one resend after a lost send (round-flow.ts) and the
// player actions' `resend` both ask it first.

import { describe, expect, it } from "vitest";

import { openTestSession, openWorkedRound } from "./fixtures/session.ts";
import { snapshot } from "./fixtures/vectors.ts";
import { firstMove, playMoves, secondMove } from "./fixtures/worked-round.ts";

describe("resendable (W-16)", () => {
  it("gives the pending move while open, after an adopted read, and after a re-issue (W-26)", async () => {
    const round = openWorkedRound(await openTestSession());
    const action = round.sign(firstMove);
    expect(round.phase()).toBe("open");
    expect(round.resendable()).toBe(action);
    round.reissue();
    expect(round.phase()).toBe("reissued");
    expect(round.resendable()).toBe(action);
  });

  it("gives the pending move once a held round adopted it and signed the next", async () => {
    const round = openWorkedRound(await openTestSession());
    round.sign(firstMove);
    round.stale();
    round.observe(snapshot("active", { step: 1 }));
    expect(round.phase()).toBe("adopted");
    const next = round.sign(secondMove);
    expect(round.resendable()).toBe(next);
  });

  it("gives nothing while held after W-19 (stale)", async () => {
    const round = openWorkedRound(await openTestSession());
    round.sign(firstMove);
    round.stale();
    expect(round.phase()).toBe("stale");
    expect(round.resendable()).toBeUndefined();
  });

  it("gives nothing once a check failed (failed)", async () => {
    const round = openWorkedRound(await openTestSession());
    round.sign(firstMove);
    round.fail();
    expect(round.phase()).toBe("failed");
    expect(round.resendable()).toBeUndefined();
  });

  it("gives nothing out of sync, once closed, or once the session ended", async () => {
    const outOfSync = openWorkedRound(await openTestSession());
    outOfSync.sign(firstMove);
    outOfSync.observe(snapshot("active", { step: 2 }));
    expect(outOfSync.phase()).toBe("out-of-sync");
    expect(outOfSync.resendable()).toBeUndefined();

    const closed = openWorkedRound(await openTestSession());
    playMoves(closed, 1);
    closed.sign(secondMove);
    closed.observe(snapshot("canceled", { step: 1 }));
    expect(closed.phase()).toBe("closed");
    expect(closed.resendable()).toBeUndefined();

    const session = await openTestSession();
    const ended = openWorkedRound(session);
    ended.sign(firstMove);
    session.end();
    expect(ended.phase()).toBe("ended");
    expect(ended.resendable()).toBeUndefined();
  });

  it("never gives a cancel, which is sent again only after a read (W-25)", async () => {
    const round = openWorkedRound(await openTestSession());
    round.signCancel();
    expect(round.resendable()).toBeUndefined();
  });
});
