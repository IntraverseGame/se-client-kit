// The required cancel through the session once it settled (W-25, W-33): an
// `ended` cancel lets a new round start and passes an `idle` read on, and a
// settled cancel answers with its Snapshot, not an earlier failure of its call
// or of a read (#61 review). Scripted Play API, manual clock, fake locks, and
// RPC endpoints that disagree (fixtures/session-cancel).

import { describe, expect, it } from "vitest";

import { lost, ok, problem } from "./fixtures/fake-play.ts";
import { open, sessionOf } from "./fixtures/play-session.ts";
import { ROUND_REQUEST } from "./fixtures/round-auth.ts";
import {
  canceled,
  failedRound,
  gameStatuses,
  idle,
  resolving,
  roundId,
  settlingRound,
  shownBy,
  starting,
} from "./fixtures/session-cancel.ts";
import { disagreeingRpc, issued } from "./fixtures/session-round.ts";

describe("once the cancel settled (W-25, W-33)", () => {
  it("lets a new round start once the cancel is ended", async () => {
    const held = await settlingRound();
    held.play.answer("getSnapshot", ok(idle()));
    await held.session.read();
    expect(held.session.round()?.cancel).toBe("ended");
    held.play.answer("startRound", ok(issued.snapshot));
    held.play.answer("cancelRound", ok(resolving()));
    held.play.answer("getSnapshot", ok(resolving()));
    await held.session.start(ROUND_REQUEST.bet);
    expect(held.play.sent("startRound")).toHaveLength(2);
  });

  it("passes an idle read on once the cancel is ended, to the game too", async () => {
    const held = await settlingRound();
    held.play.answer("getSnapshot", ok(idle()));
    await held.session.read();
    expect(held.session.round()?.cancel).toBe("ended");
    // The read that ended the cancel gives the game the round's latest.
    expect(gameStatuses(held).at(-1)).toBe("resolving");
    // The Wrapper's one read after `ended` (W-33) is the normal read.
    held.play.answer("getSnapshot", ok(idle()));
    expect(await held.session.read()).toEqual({
      kind: "snapshot",
      snapshot: idle(),
    });
    expect(gameStatuses(held).at(-1)).toBe("idle");
  });

  it("answers the start with the canceled Snapshot, not the cancel call's failure", async () => {
    const opened = await open({ rpc: disagreeingRpc });
    const session = sessionOf(opened);
    opened.play.answer("cancelRound", lost);
    opened.play.answer("getSnapshot", ok(canceled()));
    opened.play.answer("startRound", ok(issued.snapshot));
    const read = await session.start(ROUND_REQUEST.bet);
    expect(session.round()?.cancel).toBe("sent");
    expect(shownBy(read)).toEqual({ status: "canceled", roundId });
  });

  it.each([
    [
      "a 400 and an active read: not-taken",
      problem(400, "INVALID_ARGUMENT"),
      issued.snapshot,
      "not-taken",
      "active",
    ],
    ["a lost answer and an idle read: ended", lost, idle(), "ended", "active"],
  ] as const)(
    "answers the start with the round, not the cancel call's failure, after %s",
    async (_what, call, read, cancel, status) => {
      const opened = await open({ rpc: disagreeingRpc });
      const session = sessionOf(opened);
      opened.play.answer("cancelRound", call);
      opened.play.answer("getSnapshot", ok(read));
      opened.play.answer("startRound", ok(issued.snapshot));
      const answer = await session.start(ROUND_REQUEST.bet);
      expect(session.round()?.cancel).toBe(cancel);
      expect(shownBy(answer)).toEqual({ status, roundId });
    },
  );

  it("answers the start with the round, not the cancel call's failure, while it settles", async () => {
    const opened = await open({ rpc: disagreeingRpc });
    const session = sessionOf(opened);
    opened.play.answer("cancelRound", lost);
    opened.play.answer("getSnapshot", ok(resolving()));
    opened.play.answer("startRound", ok(issued.snapshot));
    const read = await session.start(ROUND_REQUEST.bet);
    expect(session.round()?.cancel).toBe("settling");
    expect(shownBy(read)).toEqual({ status: "resolving", roundId });
  });

  it("answers the read that signed the cancel with the cancel's result", async () => {
    const held = await failedRound(starting());
    held.play.answer("cancelRound", ok(canceled()));
    held.play.answer("getSnapshot", ok(issued.snapshot));
    expect(shownBy(await held.session.read())).toEqual({
      status: "canceled",
      roundId,
    });
    expect(held.session.round()?.cancel).toBe("sent");
    expect(gameStatuses(held).at(-1)).toBe("canceled");
  });

  it("answers the settling read with the canceled Snapshot, not an earlier read's failure", async () => {
    const held = await settlingRound();
    held.play.answer("getSnapshot", lost);
    expect(await held.session.read()).toEqual({ kind: "network" });
    held.play.answer("getSnapshot", ok(canceled()));
    expect(shownBy(await held.session.read())).toEqual({
      status: "canceled",
      roundId,
    });
    expect(held.session.round()?.cancel).toBe("sent");
    expect(gameStatuses(held).at(-1)).toBe("canceled");
  });
});
