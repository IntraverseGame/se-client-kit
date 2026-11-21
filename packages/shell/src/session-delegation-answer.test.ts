// T-44 (W-68, W-69, W-73): the signing window's answer in a session of the
// vector's session and expiry, on the manual clock that starts before the
// vector's expiry: the vector's `result` registered as it is and in its
// high-`s` and `v` 0 forms, as the canonical signature; a signer that is not
// `wallet`; each `failed` reason; the window closed on every answer and at the
// session's end; and nothing logged.

import { afterEach, describe, expect, it, vi } from "vitest";

import type { DelegationState } from "./delegation-types.ts";
import {
  ACCEPTED,
  answered,
  event,
  failedAnswer,
  fakeWindow,
  openDelegated,
  READY,
  refusedSignature,
  result,
} from "./fixtures/delegation.ts";
import { sessionOf } from "./fixtures/play-session.ts";
import type { PlaySession } from "./session-types.ts";

const delegated = async (): Promise<PlaySession> =>
  sessionOf(await openDelegated());

const states = (session: PlaySession): DelegationState[] => {
  const seen: DelegationState[] = [];
  session.onDelegation(state => seen.push(state));
  return seen;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the answer (W-68, W-69)", () => {
  it("registers the vector's result: the wallet in lowercase, the window closed", async () => {
    const session = await delegated();
    const seen = states(session);
    const win = answered(session);
    expect(session.delegation()).toEqual({
      state: "registered",
      wallet: ACCEPTED.wallet,
    });
    expect(seen.map(state => state.state)).toEqual(["signing", "registered"]);
    expect(win.closes()).toBe(1);
    expect(session.delegationOffer()).toMatchObject({ reason: "in-progress" });
  });

  it.each(["high-s twin", "v as 0"])(
    "registers its %s form, as the canonical signature",
    async name => {
      const session = await delegated();
      answered(session, result(refusedSignature(name)));
      expect(session.delegation()).toEqual({
        state: "registered",
        wallet: ACCEPTED.wallet,
      });
    },
  );

  it.each<[string, () => Record<string, unknown>]>([
    [
      "another wallet named",
      () => result(ACCEPTED.signature, `0x${"12".repeat(20)}`),
    ],
    ["v as 1, another signer", () => result(refusedSignature("v as 1"))],
    ["a signature recovery refuses", () => result(`0x${"00".repeat(65)}`)],
  ])(
    "refuses %s: wallet-mismatch, nothing registered",
    async (_name, answer) => {
      const session = await delegated();
      const win = answered(session, answer());
      expect(session.delegation()).toEqual({
        state: "failed",
        reason: "wallet-mismatch",
      });
      expect(win.closes()).toBe(1);
    },
  );

  it.each([
    "no-wallet",
    "rejected",
    "unknown-notice",
    "invalid-request",
    "wallet-error",
  ])(
    "a failed %s is failed with that reason, the window closed",
    async reason => {
      const session = await delegated();
      const win = answered(session, failedAnswer(reason));
      expect(session.delegation()).toEqual({ state: "failed", reason });
      expect(win.closes()).toBe(1);
      expect(session.delegationOffer().kind).toBe("offered");
    },
  );

  it("the session's end while signing closes the window: failed session-ended", async () => {
    const session = await delegated();
    const win = fakeWindow();
    session.beginDelegation(win);
    session.receiveDelegation(event(win, READY));
    session.end();
    expect(win.closes()).toBe(1);
    expect(session.delegation()).toEqual({
      state: "failed",
      reason: "session-ended",
    });
    session.receiveDelegation(event(win, result()));
    expect(session.delegation()).toEqual({
      state: "failed",
      reason: "session-ended",
    });
  });

  it("the session's end forgets a registered delegation", async () => {
    const session = await delegated();
    answered(session);
    session.end();
    expect(session.delegation()).toEqual({ state: "offered" });
  });

  it("logs nothing (W-73)", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      name => vi.spyOn(console, name).mockImplementation(() => {}),
    );
    const session = await delegated();
    answered(session);
    answered(session, failedAnswer("rejected"));
    session.end();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
