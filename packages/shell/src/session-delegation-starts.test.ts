// T-44's starts (W-22, W-70, W-71) and T-45's receipt reason (W-72): every
// start of a registered session carries the same `keyDelegation` (the
// canonical signature, lowercase), W-22's resend included, and an unregistered
// one carries no such field; a 422 `KEY_DELEGATION_*` makes the state
// `refused` with the delegation kept, and later starts are refused
// `delegation-refused` with nothing sent until "Continue without" or a new
// registration, and also while a "Sign again" attempt is open; a new attempt
// from `refused` that is declined or fails returns to `refused`; another
// refusal, a non-422 status carrying one of the codes included, keeps the
// delegation registered.

import { describe, expect, it } from "vitest";

import type { DelegationState } from "./delegation-types.ts";
import {
  ACCEPTED,
  answered,
  carrying,
  event,
  failedAnswer,
  fakeWindow,
  keyDelegationOf,
  READY,
  refusedSignature,
  registered,
  result,
} from "./fixtures/delegation.ts";
import { lost, ok, problem } from "./fixtures/fake-play.ts";
import type { Opened } from "./fixtures/play-session.ts";
import { issueRound } from "./fixtures/round-auth.ts";
import { reread } from "./fixtures/round-edits.ts";
import type { PlaySession } from "./session-types.ts";

const BET = { value: "100", unit: "EUR" } as const;
const ROUND = issueRound();
/** The round's Snapshot carrying the vector's delegation. */
const DELEGATED_ROUND = reread(ROUND.snapshot, carrying());

/** The accepted vector's `keyDelegation`, as every delegated start sends it. */
const SENT = {
  wallet: ACCEPTED.wallet,
  expiry: ACCEPTED.expiry,
  noticeHash: ACCEPTED.noticeHash,
  signature: ACCEPTED.signature.toLowerCase(),
};

type Session = Opened & { readonly session: PlaySession };

const starts = (opened: Session): readonly unknown[] =>
  opened.play.sent("startRound").map(request => keyDelegationOf(request));

/** A registered session whose first start was refused with `code`. */
const refusedWith = async (code: string): Promise<Session> => {
  const opened = await registered();
  opened.play.answer("startRound", problem(422, code));
  await opened.session.start(BET);
  return opened;
};

describe("every start of a registered session carries it (W-70)", () => {
  it("carries the canonical signature, whatever form the window sent", async () => {
    const opened = await registered();
    const session = sessionWithHighS(opened);
    opened.play.answer("startRound", ok(DELEGATED_ROUND));
    await session.start(BET);
    expect(starts(opened)).toEqual([SENT]);
    expect(session.round()?.verdict).toBe("ready");
  });

  it("repeats the same body in W-22's resend", async () => {
    const opened = await registered();
    opened.play.answer("startRound", lost, ok(DELEGATED_ROUND));
    await opened.session.start(BET);
    const [first, again] = opened.play.sent("startRound");
    expect(again?.body).toEqual(first?.body);
    expect(starts(opened)).toEqual([SENT, SENT]);
  });

  it("an unregistered session's start has no keyDelegation field, never null", async () => {
    const opened = await registered();
    opened.session.dropDelegation();
    opened.play.answer("startRound", ok(ROUND.snapshot));
    await opened.session.start(BET);
    const [request] = opened.play.sent("startRound");
    expect(Object.hasOwn(request?.body as object, "keyDelegation")).toBe(false);
  });
});

/** Registers the vector's high-`s` form again on a fresh window. */
const sessionWithHighS = (opened: Session): PlaySession => {
  opened.session.dropDelegation();
  answered(opened.session, result(refusedSignature("high-s twin")));
  return opened.session;
};

describe("a refused delegated start (W-71)", () => {
  it.each([
    "KEY_DELEGATION_INVALID",
    "KEY_DELEGATION_EXPIRED",
    "KEY_DELEGATION_NOTICE_UNKNOWN",
  ])(
    "%s: refused with the code, the delegation kept, no start sent until the player chooses",
    async code => {
      const opened = await refusedWith(code);
      const { session } = opened;
      expect(session.delegation()).toEqual({ state: "refused", code });
      expect(await session.start(BET)).toEqual({
        kind: "refused",
        reason: "delegation-refused",
      });
      expect(opened.play.sent("startRound")).toHaveLength(1);
      // "Sign again" may begin from `refused`.
      expect(session.delegationOffer().kind).toBe("offered");
    },
  );

  it("Continue without: the delegation is forgotten and the next start carries none", async () => {
    const opened = await refusedWith("KEY_DELEGATION_EXPIRED");
    opened.session.dropDelegation();
    expect(opened.session.delegation()).toEqual({ state: "offered" });
    opened.play.answer("startRound", ok(ROUND.snapshot));
    await opened.session.start(BET);
    expect(starts(opened)).toEqual([SENT, undefined]);
  });

  it("Sign again: a new registration replaces it and the next start carries it", async () => {
    const opened = await refusedWith("KEY_DELEGATION_INVALID");
    answered(opened.session);
    expect(opened.session.delegation()).toEqual({
      state: "registered",
      wallet: ACCEPTED.wallet,
    });
    opened.play.answer("startRound", ok(DELEGATED_ROUND));
    await opened.session.start(BET);
    expect(starts(opened)).toEqual([SENT, SENT]);
  });

  it.each<[string, (session: PlaySession) => void, DelegationState]>([
    [
      "declined",
      session => {
        const win = fakeWindow();
        session.beginDelegation(win);
        win.shut();
      },
      { state: "declined" },
    ],
    [
      "failed",
      session => {
        answered(session, failedAnswer("rejected"));
      },
      { state: "failed", reason: "rejected" },
    ],
    [
      "blocked",
      session => {
        session.beginDelegation(null);
      },
      { state: "failed", reason: "blocked" },
    ],
  ])(
    "a new attempt that is %s returns to refused, its own outcome first",
    async (_name, attempt, outcome) => {
      const opened = await refusedWith("KEY_DELEGATION_NOTICE_UNKNOWN");
      const seen: DelegationState[] = [];
      opened.session.onDelegation(state => seen.push(state));
      attempt(opened.session);
      // Two reads of `closed` for the declined attempt (W-66).
      opened.clock.advance(1000);
      const refused = {
        state: "refused",
        code: "KEY_DELEGATION_NOTICE_UNKNOWN",
      };
      expect(seen.slice(-2)).toEqual([outcome, refused]);
      expect(opened.session.delegation()).toEqual(refused);
      // The kept delegation is the refused one: dropping it is still the choice.
      opened.session.dropDelegation();
      expect(opened.session.delegation()).toEqual({ state: "offered" });
    },
  );

  it.each<[string, number, string]>([
    ["a 400 INVALID_ARGUMENT", 400, "INVALID_ARGUMENT"],
    ["a 409 CONFLICT", 409, "CONFLICT"],
    ["a 422 of another code", 422, "FAILED_PRECONDITION"],
  ])(
    "another refusal (%s) keeps the delegation registered",
    async (_name, status, code) => {
      const opened = await registered();
      opened.play.answer(
        "startRound",
        problem(status, code),
        ok(DELEGATED_ROUND),
      );
      await opened.session.start(BET);
      expect(opened.session.delegation()).toMatchObject({
        state: "registered",
      });
      await opened.session.start(BET);
      expect(starts(opened)).toEqual([SENT, SENT]);
    },
  );
});

describe("the round's receipt reason (W-72)", () => {
  it("is delegation when the round's evidence does not carry what was sent", async () => {
    const opened = await registered();
    opened.play.answer("startRound", ok(ROUND.snapshot));
    opened.play.answer("cancelRound", problem(422, "FAILED_PRECONDITION"));
    await opened.session.start(BET);
    expect(opened.session.round()).toMatchObject({
      verdict: "failed",
      shown: "verification-failed",
      failure: "delegation",
      delegationFailure: "missing",
    });
    expect(opened.play.sent("cancelRound")).toHaveLength(1);
    // A failed check does not change the delegation's state (W-72).
    expect(opened.session.delegation()).toMatchObject({ state: "registered" });
  });
});

describe("the window's messages", () => {
  it("reach the use case only through receiveDelegation, from the handle", async () => {
    const opened = await registered();
    opened.session.dropDelegation();
    const win = fakeWindow();
    opened.session.beginDelegation(win);
    opened.session.receiveDelegation(event({}, READY));
    expect(win.posted).toEqual([]);
  });
});

describe("the refusal's match and the held starts (W-71)", () => {
  it("a non-422 status carrying a KEY_DELEGATION_* code is not a delegation refusal", async () => {
    const opened = await registered();
    opened.play.answer(
      "startRound",
      problem(409, "KEY_DELEGATION_INVALID"),
      ok(DELEGATED_ROUND),
    );
    expect(await opened.session.start(BET)).toMatchObject({
      kind: "problem",
      problem: { status: 409, code: "KEY_DELEGATION_INVALID" },
    });
    expect(opened.session.delegation()).toMatchObject({ state: "registered" });
    await opened.session.start(BET);
    expect(starts(opened)).toEqual([SENT, SENT]);
  });

  it("holds starts while a Sign again attempt is open, until it registers", async () => {
    const opened = await refusedWith("KEY_DELEGATION_INVALID");
    const win = fakeWindow();
    opened.session.beginDelegation(win);
    expect(opened.session.delegation()).toEqual({ state: "signing" });
    expect(await opened.session.start(BET)).toEqual({
      kind: "refused",
      reason: "delegation-refused",
    });
    expect(opened.play.sent("startRound")).toHaveLength(1);
    opened.session.receiveDelegation(event(win, READY));
    opened.session.receiveDelegation(event(win, result()));
    expect(opened.session.delegation()).toMatchObject({ state: "registered" });
    opened.play.answer("startRound", ok(DELEGATED_ROUND));
    await opened.session.start(BET);
    expect(starts(opened)).toEqual([SENT, SENT]);
  });

  it("Continue without during a Sign again attempt releases the starts, the window still open", async () => {
    const opened = await refusedWith("KEY_DELEGATION_INVALID");
    const win = fakeWindow();
    opened.session.beginDelegation(win);
    opened.session.dropDelegation();
    // The attempt goes on: the state stays `signing`, and nothing is carried.
    expect(opened.session.delegation()).toEqual({ state: "signing" });
    opened.play.answer("startRound", ok(ROUND.snapshot));
    await opened.session.start(BET);
    expect(starts(opened)).toEqual([SENT, undefined]);
    expect(opened.session.delegation()).toEqual({ state: "signing" });
  });
});
