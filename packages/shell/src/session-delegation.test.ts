// T-44 (W-9, W-62 to W-67): the session's delegation use case over the
// scripted Play API, on the manual clock that starts before the vector's
// expiry: the key drawn at the open; the offer and its first failing
// condition; `begin` with `null` (blocked), with a handle (signing), and while
// signing (busy); the request's exact content; a window closed before an
// answer (declined) and one that sends no `ready` (no-ready). The answer is in
// session-delegation-answer.test.ts.

import { describe, expect, it } from "vitest";

import { DELEGATION_SCHEMA } from "./delegation-protocol.ts";
import { bookSnapshot } from "./fixtures/book.ts";
import {
  ACCEPTED,
  event,
  fakeWindow,
  openDelegated,
  READY,
  SIGNER,
} from "./fixtures/delegation.ts";
import { ok } from "./fixtures/fake-play.ts";
import { open, sessionOf } from "./fixtures/play-session.ts";
import { issueRound } from "./fixtures/round-auth.ts";
import type { PlaySession } from "./session-types.ts";

const delegated = async (): Promise<PlaySession> =>
  sessionOf(await openDelegated());

describe("the action key (W-9)", () => {
  it("is drawn at the open: its address is known before any start", async () => {
    const opened = await openDelegated();
    const session = sessionOf(opened);
    const win = fakeWindow();
    session.beginDelegation(win);
    session.receiveDelegation(event(win, READY));
    expect(win.posted[0]?.message).toMatchObject({
      actionKey: expect.any(String),
    });
    expect(opened.play.sent("startRound")).toHaveLength(0);
  });
});

describe("the offer (W-62 to W-64)", () => {
  it("offers the chosen notice with its exact text and status", async () => {
    const session = await delegated();
    expect(session.delegation()).toEqual({ state: "offered" });
    expect(session.delegationOffer()).toEqual({
      kind: "offered",
      notice: {
        id: ACCEPTED.noticeId,
        text: ACCEPTED.notice,
        status: "pending",
      },
    });
  });

  it("offers nothing with no accepted notice, or no signingPageOrigin (fail closed)", async () => {
    const noPending = sessionOf(
      await openDelegated({ acceptPendingNotices: false }),
    );
    expect(noPending.delegationOffer()).toEqual({
      kind: "not-offered",
      reason: "no-notice",
    });
    const noOrigin = sessionOf(await open({ acceptPendingNotices: true }));
    expect(noOrigin.delegationOffer()).toEqual({
      kind: "not-offered",
      reason: "not-configured",
    });
    const neither = sessionOf(await open());
    expect(neither.delegationOffer()).toMatchObject({ kind: "not-offered" });
    expect(neither.beginDelegation(fakeWindow())).toEqual({
      kind: "refused",
      reason: "not-offered",
    });
  });

  it("offers nothing while a round is open", async () => {
    const opened = await openDelegated();
    const session = sessionOf(opened);
    opened.play.answer("startRound", ok(issueRound().snapshot));
    await session.start({ value: "100", unit: "EUR" });
    expect(session.delegationOffer()).toEqual({
      kind: "not-offered",
      reason: "round-open",
    });
  });

  it("offers nothing on a book game, and begin answers not-offered", async () => {
    const opened = await openDelegated();
    const session = sessionOf(opened);
    opened.play.answer("getSnapshot", ok(bookSnapshot("idle")));
    await session.read();
    expect(session.delegationOffer()).toEqual({
      kind: "not-offered",
      reason: "book",
    });
    const win = fakeWindow();
    expect(session.beginDelegation(win)).toEqual({
      kind: "refused",
      reason: "not-offered",
    });
    expect(win.closes()).toBe(1);
  });

  it("offers nothing once the session ended", async () => {
    const session = await delegated();
    session.end();
    expect(session.delegationOffer()).toEqual({
      kind: "not-offered",
      reason: "ended",
    });
    expect(session.beginDelegation(fakeWindow())).toMatchObject({
      reason: "session-ended",
    });
  });
});

describe("begin (W-66)", () => {
  it("with null is failed blocked, and the entry is offered again", async () => {
    const session = await delegated();
    expect(session.beginDelegation(null)).toEqual({ kind: "started" });
    expect(session.delegation()).toEqual({
      state: "failed",
      reason: "blocked",
    });
    expect(session.delegationOffer().kind).toBe("offered");
  });

  it("takes one window at a time: a second is refused busy and closed, never the first", async () => {
    const session = await delegated();
    const first = fakeWindow();
    const second = fakeWindow();
    expect(session.beginDelegation(first)).toEqual({ kind: "started" });
    expect(session.delegation()).toEqual({ state: "signing" });
    expect(session.delegationOffer()).toEqual({
      kind: "not-offered",
      reason: "in-progress",
    });
    expect(session.beginDelegation(second)).toEqual({
      kind: "refused",
      reason: "busy",
    });
    expect(second.closes()).toBe(1);
    expect(second.posted).toEqual([]);
    expect(session.beginDelegation(first)).toMatchObject({ reason: "busy" });
    expect(first.closes()).toBe(0);
  });

  it("posts the one request: the EIP-55 key, the redeem's session, floor(sessionExpiresAt), the notice id", async () => {
    const session = await delegated();
    const win = fakeWindow();
    session.beginDelegation(win);
    session.receiveDelegation(event(win, READY));
    session.receiveDelegation(event(win, READY));
    expect(win.posted).toHaveLength(1);
    const [posted] = win.posted;
    expect(posted?.origin).toBe(SIGNER);
    expect(posted?.message).toStrictEqual({
      schema: DELEGATION_SCHEMA,
      type: "request",
      actionKey: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      sessionId: ACCEPTED.sessionId,
      expiry: ACCEPTED.expiry,
      noticeId: ACCEPTED.noticeId,
    });
    expect(Object.keys(posted?.message as object)).toHaveLength(6);
  });

  it("closed before an answer is declined, with no error, and the entry is offered again", async () => {
    const opened = await openDelegated();
    const session = sessionOf(opened);
    const win = fakeWindow();
    session.beginDelegation(win);
    session.receiveDelegation(event(win, READY));
    win.shut();
    // Two reads of `closed`: the first sight, then the end (W-66).
    opened.clock.advance(1000);
    expect(session.delegation()).toEqual({ state: "declined" });
    expect(session.delegationOffer().kind).toBe("offered");
  });

  it("with no ready in 10 s is failed no-ready, the window closed", async () => {
    const opened = await openDelegated();
    const session = sessionOf(opened);
    const win = fakeWindow();
    session.beginDelegation(win);
    opened.clock.advance(10_000);
    expect(session.delegation()).toEqual({
      state: "failed",
      reason: "no-ready",
    });
    expect(win.closes()).toBe(1);
    expect(win.posted).toEqual([]);
  });
});
