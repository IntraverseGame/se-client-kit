// T-44's window wait (W-66, W-67), on the injected clock as T-9a's case 4
// does it: the 10 s wait for the first valid `ready`, the 500 ms polling of
// `closed` until an answer, the wait's end with no `ready`, or `stop` (a
// `ready` does not stop it); a window first seen closed ending the wait one
// read later, so an answer queued before its close still counts; the one `request`, posted only to the handle
// with the signing page's origin; the source and origin checks; and the
// window closed whenever the wait ends.

import { describe, expect, it } from "vitest";

import {
  type DelegationChannelEnd,
  openDelegationChannel,
} from "./delegation-channel.ts";
import {
  DELEGATION_CLOSED_POLL_MS,
  DELEGATION_READY_TIMEOUT_MS,
  DELEGATION_SCHEMA,
  type DelegationRequest,
} from "./delegation-protocol.ts";
import {
  event,
  failedAnswer,
  type FakeWindow,
  fakeWindow,
  READY,
  result,
  SIGNER,
} from "./fixtures/delegation.ts";
import { createWallClock, type WallClock } from "./fixtures/wall-clock.ts";

const REQUEST: DelegationRequest = Object.freeze({
  schema: DELEGATION_SCHEMA,
  type: "request",
  actionKey: `0x${"90".repeat(20)}`,
  sessionId: `ses_${"ab".repeat(16)}`,
  expiry: 1795000000,
  noticeId: "en-draft-1",
});

type Channel = {
  readonly win: FakeWindow;
  readonly clock: WallClock;
  readonly ends: DelegationChannelEnd[];
  readonly receive: (data: unknown, source?: unknown, origin?: string) => void;
  readonly stop: () => void;
};

const opened = (): Channel => {
  const win = fakeWindow();
  const clock = createWallClock(0);
  const ends: DelegationChannelEnd[] = [];
  const channel = openDelegationChannel({
    handle: win,
    signingPageOrigin: SIGNER,
    clock,
    request: REQUEST,
    onEnd: end => ends.push(end),
  });
  return {
    win,
    clock,
    ends,
    receive: (data, source = win, origin = SIGNER) => {
      channel.receive(event(source, data, origin));
    },
    stop: channel.stop,
  };
};

describe("the wait for ready (W-66)", () => {
  it("ends after 10 s with none: nothing posted, the window closed", () => {
    const channel = opened();
    channel.clock.advance(DELEGATION_READY_TIMEOUT_MS - 1);
    expect(channel.ends).toEqual([]);
    channel.clock.advance(1);
    expect(channel.ends).toEqual([{ kind: "no-ready" }]);
    expect(channel.win.posted).toEqual([]);
    expect(channel.win.closes()).toBe(1);
    expect(channel.clock.dueTimes()).toEqual([]);
  });

  it("answers the first valid ready with the one request, to the handle's origin only", () => {
    const channel = opened();
    channel.receive(READY);
    channel.receive(READY);
    expect(channel.win.posted).toEqual([{ message: REQUEST, origin: SIGNER }]);
    // The wait for `ready` is over: the player's time in the wallet is not
    // bounded.
    channel.clock.advance(60_000);
    expect(channel.ends).toEqual([]);
  });
});

describe("the window's closed (W-66)", () => {
  it("is read every 500 ms: closed with no answer is declined one read after it is first seen", () => {
    const channel = opened();
    channel.clock.advance(DELEGATION_CLOSED_POLL_MS);
    expect(channel.ends).toEqual([]);
    channel.win.shut();
    // The first read that sees it closed waits for a queued answer.
    channel.clock.advance(DELEGATION_CLOSED_POLL_MS);
    expect(channel.ends).toEqual([]);
    expect(channel.win.closes()).toBe(0);
    channel.clock.advance(DELEGATION_CLOSED_POLL_MS - 1);
    expect(channel.ends).toEqual([]);
    channel.clock.advance(1);
    expect(channel.ends).toEqual([{ kind: "closed" }]);
    expect(channel.clock.dueTimes()).toEqual([]);
  });

  it("is still read after ready, while the player signs", () => {
    const channel = opened();
    channel.receive(READY);
    channel.clock.advance(30_000);
    channel.win.shut();
    channel.clock.advance(2 * DELEGATION_CLOSED_POLL_MS);
    expect(channel.ends).toEqual([{ kind: "closed" }]);
  });

  it("takes an answer queued behind a read that saw the window closed (SP-9)", () => {
    const channel = opened();
    channel.receive(READY);
    // The page posts, then closes itself; the read runs before the message.
    channel.win.shut();
    channel.clock.advance(DELEGATION_CLOSED_POLL_MS);
    channel.receive(result());
    expect(channel.ends).toEqual([{ kind: "answer", answer: result() }]);
    expect(channel.clock.dueTimes()).toEqual([]);
    channel.clock.advance(DELEGATION_CLOSED_POLL_MS);
    expect(channel.ends).toHaveLength(1);
  });

  it("takes an answer that arrives with the close in the same tick, before any read", () => {
    const channel = opened();
    channel.receive(READY);
    channel.receive(failedAnswer("rejected"));
    channel.win.shut();
    channel.clock.advance(2 * DELEGATION_CLOSED_POLL_MS);
    expect(channel.ends).toEqual([
      { kind: "answer", answer: failedAnswer("rejected") },
    ]);
  });
});

describe("the answer (W-67)", () => {
  it("is the first valid result after the request: the window closes, polling stops", () => {
    const channel = opened();
    channel.receive(result());
    expect(channel.ends).toEqual([]);
    channel.receive(READY);
    channel.receive(result());
    channel.receive(failedAnswer("rejected"));
    expect(channel.ends).toEqual([{ kind: "answer", answer: result() }]);
    expect(channel.win.closes()).toBe(1);
    expect(channel.clock.dueTimes()).toEqual([]);
  });

  it("is a failed with its reason", () => {
    const channel = opened();
    channel.receive(READY);
    channel.receive(failedAnswer("no-wallet"));
    expect(channel.ends).toEqual([
      { kind: "answer", answer: failedAnswer("no-wallet") },
    ]);
  });

  it.each<[string, (win: FakeWindow) => unknown, string]>([
    ["another source", () => ({}), SIGNER],
    ["the Wrapper's own window", () => globalThis, SIGNER],
    ["another origin", win => win, "https://evil.example.org"],
    ["the origin with a trailing slash", win => win, `${SIGNER}/`],
  ])(
    "ignores a message from %s, and never answers it",
    (_name, sourceOf, origin) => {
      const channel = opened();
      const from = sourceOf(channel.win);
      channel.receive(READY, from, origin);
      expect(channel.win.posted).toEqual([]);
      channel.receive(READY);
      channel.receive(result(), from, origin);
      expect(channel.ends).toEqual([]);
    },
  );

  it("ignores a malformed message, and never answers it", () => {
    const channel = opened();
    channel.receive({ ...READY, extra: 1 });
    channel.receive(JSON.stringify(READY));
    expect(channel.win.posted).toEqual([]);
    channel.receive(READY);
    channel.receive({ ...result(), wallet: `0x${"00".repeat(20)}` });
    expect(channel.ends).toEqual([]);
    expect(channel.win.posted).toHaveLength(1);
  });
});

describe("stop (the session's end)", () => {
  it("closes the window and ends the wait with no outcome", () => {
    const channel = opened();
    channel.receive(READY);
    channel.stop();
    expect(channel.win.closes()).toBe(1);
    expect(channel.clock.dueTimes()).toEqual([]);
    channel.receive(result());
    expect(channel.ends).toEqual([]);
  });
});
