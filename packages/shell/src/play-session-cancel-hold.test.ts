// The required cancel through the session while it holds the round (W-25,
// W-35): while the cancel is `in-flight`, `settling`, or `check-later`, picks
// and the cash-out are refused and nothing is signed, a start is refused
// `round-exists` (also after an `idle` or another round's read), the UI and
// the game get the round's own latest Snapshot, never one from elsewhere, and
// the session's reads are the cancel's counted reads. Scripted Play API, manual
// clock, fake locks, and RPC endpoints that disagree (fixtures/session-cancel).

import { describe, expect, it } from "vitest";

import { SETTLING_READS } from "./cancel-state.ts";
import { deferred, lost, ok } from "./fixtures/fake-play.ts";
import { settleMany } from "./fixtures/play-session.ts";
import { ROUND_REQUEST } from "./fixtures/round-auth.ts";
import { reread } from "./fixtures/round-edits.ts";
import {
  canceled,
  failedRound,
  gameStatuses,
  idle,
  later,
  mounted,
  nothingSigned,
  otherRound,
  resolving,
  ROUND_EXISTS,
  roundId,
  settlingRound,
  shownBy,
  starting,
} from "./fixtures/session-cancel.ts";
import { issued, issuedOther } from "./fixtures/session-round.ts";
import { OTHER_ROUND_ID } from "./fixtures/vectors.ts";

describe("while the cancel is in flight (W-25)", () => {
  it("holds a read while the start's own answer has the cancel in flight", async () => {
    const held = await mounted();
    const answer = deferred();
    held.play.answer("cancelRound", answer.responder);
    held.play.answer("startRound", ok(issued.snapshot));
    // The start's answer fails the tip check: the start signs the cancel.
    const start = held.session.start(ROUND_REQUEST.bet);
    await settleMany();
    expect(held.play.sent("cancelRound")).toHaveLength(1);
    expect(held.session.round()?.cancel).toBe("in-flight");
    const posted = held.game.posted.length;
    held.play.answer("getSnapshot", ok(later(resolving())));
    expect(shownBy(await held.session.read())).toEqual({
      status: "active",
      roundId,
    });
    held.play.answer("getSnapshot", ok(idle()));
    expect(shownBy(await held.session.read())).toEqual({
      status: "active",
      roundId,
    });
    // The game was sent nothing from either read.
    expect(held.game.posted).toHaveLength(posted);
    expect(await held.session.start(ROUND_REQUEST.bet)).toEqual({
      kind: "refused",
      reason: "busy",
    });
    expect(held.play.sent("startRound")).toHaveLength(1);
    held.play.answer("getSnapshot", ok(resolving()));
    answer.release(ok(resolving()));
    expect(shownBy(await start)).toEqual({ status: "resolving", roundId });
    expect(held.session.round()?.cancel).toBe("settling");
    expect(gameStatuses(held).at(-1)).toBe("resolving");
  });

  it("refuses picks, the cash-out, and a start, and holds back every read from elsewhere", async () => {
    const held = await failedRound(starting());
    const answer = deferred();
    held.play.answer("cancelRound", answer.responder);
    // The read that shows the round `active` signs the required cancel.
    held.play.answer("getSnapshot", ok(issued.snapshot));
    const reading = held.session.read();
    await settleMany();
    expect(held.play.sent("cancelRound")).toHaveLength(1);
    expect(held.session.round()?.cancel).toBe("in-flight");
    await nothingSigned(held);
    // An `idle` read and another round's, from elsewhere, show nothing new
    // and release nothing.
    for (const elsewhere of [idle(), otherRound()]) {
      held.play.answer("getSnapshot", ok(elsewhere));
      // oxlint-disable-next-line no-await-in-loop -- one read at a time, in order
      expect(shownBy(await held.session.read())).toEqual({
        status: "active",
        roundId,
      });
      // oxlint-disable-next-line no-await-in-loop -- one read at a time, in order
      expect(await held.session.start(ROUND_REQUEST.bet)).toEqual(ROUND_EXISTS);
    }
    expect(gameStatuses(held)).not.toContain("idle");
    expect(held.game.posted.map(({ message }) => message)).not.toContainEqual(
      expect.objectContaining({
        snapshot: expect.objectContaining({ roundId: OTHER_ROUND_ID }),
      }),
    );
    held.play.answer("getSnapshot", ok(resolving()));
    answer.release(ok(resolving()));
    expect(shownBy(await reading)).toEqual({ status: "resolving", roundId });
    expect(held.session.round()?.cancel).toBe("settling");
  });
});

describe("a read that a new round's start overtakes (W-25)", () => {
  it("is held by the new round's cancel, though it read the previous round", async () => {
    const otherResolving = reread(
      issuedOther.snapshot,
      p => (p.input["status"] = "resolving"),
    );
    // The previous round failed its tip check at `starting`; an `idle` read
    // lets a new round start beside it.
    const held = await failedRound(starting());
    held.play.answer("getSnapshot", ok(idle()));
    await held.session.read();
    const startAnswer = deferred();
    const previousCancel = deferred();
    const newCancel = deferred();
    held.play.answer("startRound", startAnswer.responder);
    held.play.answer(
      "cancelRound",
      previousCancel.responder,
      newCancel.responder,
    );
    const start = held.session.start(ROUND_REQUEST.bet);
    // The previous round's `active` read signs its cancel, and waits on it.
    held.play.answer("getSnapshot", ok(issued.snapshot));
    const reading = held.session.read();
    await settleMany();
    expect(held.play.sent("cancelRound")).toHaveLength(1);
    // The new round starts meanwhile, and its own cancel goes in flight.
    startAnswer.release(ok(issuedOther.snapshot));
    await settleMany();
    expect(held.play.sent("cancelRound")).toHaveLength(2);
    expect(held.session.round()).toMatchObject({
      roundId: OTHER_ROUND_ID,
      cancel: "in-flight",
    });
    const posted = held.game.posted.length;
    held.play.answer("getSnapshot", ok(resolving()));
    previousCancel.release(ok(resolving()));
    // The new round holds: its latest Snapshot, and nothing for the game.
    expect(shownBy(await reading)).toEqual({
      status: "active",
      roundId: OTHER_ROUND_ID,
    });
    expect(held.game.posted).toHaveLength(posted);
    held.play.answer("getSnapshot", ok(otherResolving));
    newCancel.release(ok(otherResolving));
    expect(shownBy(await start)).toEqual({
      status: "resolving",
      roundId: OTHER_ROUND_ID,
    });
  });
});

describe("a read that a settled new round overtakes (W-25)", () => {
  it("passes on as the previous round's read once the new round's cancel settled", async () => {
    const otherCanceled = reread(issuedOther.snapshot, p => {
      p.input["status"] = "canceled";
      p.input["step"] = 0;
    });
    const held = await failedRound(starting());
    held.play.answer("getSnapshot", ok(idle()));
    await held.session.read();
    const startAnswer = deferred();
    const previousCancel = deferred();
    held.play.answer("startRound", startAnswer.responder);
    held.play.answer(
      "cancelRound",
      previousCancel.responder,
      ok(otherCanceled),
    );
    const start = held.session.start(ROUND_REQUEST.bet);
    held.play.answer("getSnapshot", ok(issued.snapshot));
    const reading = held.session.read();
    await settleMany();
    // The new round starts, and its cancel is answered `canceled` at once.
    startAnswer.release(ok(issuedOther.snapshot));
    expect(shownBy(await start)).toEqual({
      status: "canceled",
      roundId: OTHER_ROUND_ID,
    });
    expect(held.session.round()?.cancel).toBe("sent");
    held.play.answer("getSnapshot", ok(resolving()));
    previousCancel.release(ok(resolving()));
    // Not the new round's result: the previous round's read, as it is.
    expect(shownBy(await reading)).toEqual({ status: "active", roundId });
  });
});

describe("while the cancel is settling or checked later (W-25, W-35)", () => {
  it("refuses picks, the cash-out, and a start while settling", async () => {
    const held = await settlingRound();
    await nothingSigned(held);
    expect(held.session.round()?.cancel).toBe("settling");
  });

  it("reads through the cancel's counted reads, and another round's read settles nothing", async () => {
    const held = await settlingRound();
    const reads = held.play.sent("getSnapshot").length;
    held.play.answer("getSnapshot", ok(otherRound()));
    expect(shownBy(await held.session.read())).toEqual({
      status: "resolving",
      roundId,
    });
    expect(held.play.sent("getSnapshot")).toHaveLength(reads + 1);
    expect(held.session.round()?.cancel).toBe("settling");
    expect(await held.session.start(ROUND_REQUEST.bet)).toEqual(ROUND_EXISTS);
    expect(held.game.posted.map(({ message }) => message)).not.toContainEqual(
      expect.objectContaining({
        snapshot: expect.objectContaining({ roundId: OTHER_ROUND_ID }),
      }),
    );
  });

  it("refuses a start after an idle read from elsewhere, before the cancel's reads decide", async () => {
    const held = await failedRound(starting());
    // Before the round's `active` read, an `idle` read was the latest seen.
    held.play.answer("getSnapshot", ok(idle()));
    await held.session.read();
    held.play.answer("cancelRound", ok(resolving()));
    held.play.answer("getSnapshot", ok(issued.snapshot), ok(resolving()));
    expect(shownBy(await held.session.read())).toEqual({
      status: "resolving",
      roundId,
    });
    expect(held.session.round()?.cancel).toBe("settling");
    expect(await held.session.start(ROUND_REQUEST.bet)).toEqual(ROUND_EXISTS);
    expect(held.play.sent("startRound")).toHaveLength(1);
  });

  it("answers a failed counted read with its failure, and the next one with the round", async () => {
    const held = await settlingRound();
    held.play.answer("getSnapshot", lost);
    expect(await held.session.read()).toEqual({ kind: "network" });
    expect(held.session.round()?.cancel).toBe("settling");
    // The earlier failure is the flow's last one still, but not this answer.
    held.play.answer("getSnapshot", ok(resolving()));
    expect(shownBy(await held.session.read())).toEqual({
      status: "resolving",
      roundId,
    });
    expect(held.session.round()?.cancel).toBe("settling");
  });

  it(`refuses picks, the cash-out, and a start in check-later, and "check again" reads once`, async () => {
    const held = await settlingRound();
    held.play.answer(
      "getSnapshot",
      ...Array.from({ length: SETTLING_READS - 1 }, () => ok(resolving())),
    );
    for (let read = 1; read < SETTLING_READS; read += 1) {
      // oxlint-disable-next-line no-await-in-loop -- the counted reads run one at a time
      await held.session.read();
    }
    expect(held.session.round()?.cancel).toBe("check-later");
    await nothingSigned(held);
    const reads = held.play.sent("getSnapshot").length;
    held.play.answer("getSnapshot", ok(otherRound()));
    expect(shownBy(await held.session.checkAgain())).toEqual({
      status: "resolving",
      roundId,
    });
    expect(held.play.sent("getSnapshot")).toHaveLength(reads + 1);
    expect(held.session.round()?.cancel).toBe("check-later");
    expect(await held.session.start(ROUND_REQUEST.bet)).toEqual(ROUND_EXISTS);
    held.play.answer("getSnapshot", ok(canceled()));
    expect(shownBy(await held.session.checkAgain())).toEqual({
      status: "canceled",
      roundId,
    });
    expect(held.session.round()?.cancel).toBe("sent");
  });
});
