// T-45: the delegation check (W-72) through one round's verdict, beside the tip
// check, under W-26's `T_0` rule: a missing (judged only once the round is past
// `starting`), different, or unexpected `proofs.keyDelegation` fails the round
// with `delegation` and requires the one `PlayerCancel` once `T_0` is settled
// and the round `active`; a failure seen before check 5 waits for it; with
// checks 1 to 5 failed nothing is signed; a later different object is
// `changed`, handled as a re-issue. Values are compared by bytes and integer.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import {
  type CarriedDelegation,
  type ExpectedDelegation,
  sameDelegation,
} from "./delegation-check.ts";
import { carriedObject, carrying, expectedOf } from "./fixtures/delegation.ts";
import { TIP_FAILED, TIP_PASSED } from "./fixtures/flow-stand-ins.ts";
import {
  asStarting,
  issueRound,
  type IssuedRound,
  type RoundParts,
  ROUND_REQUEST,
} from "./fixtures/round-auth.ts";
import { HASH, reread } from "./fixtures/round-edits.ts";
import { ROUND_ID } from "./fixtures/vectors.ts";
import {
  createRoundVerification,
  type RoundVerification,
} from "./round-verification.ts";

const tipPassed = TIP_PASSED;
const tipDisagreed = TIP_FAILED;

const ROUND = issueRound();
const SENT: ExpectedDelegation = expectedOf();

/** The round's verification, its start carrying `delegation` (`null`: none). */
const verifying = (
  delegation: ExpectedDelegation | null = SENT,
): RoundVerification =>
  createRoundVerification({
    config: ROUND.config,
    roundId: ROUND_ID,
    request: {
      ...ROUND_REQUEST,
      ...(delegation === null ? {} : { delegation }),
    },
  });

const read = (...edits: ((parts: RoundParts) => void)[]): ValidSnapshot =>
  reread(ROUND.snapshot, parts => {
    for (const edit of edits) edit(parts);
  });

const carried = (
  edit?: (object: Record<string, unknown>) => void,
): ValidSnapshot => read(carrying(edit));

const delegationFailed = (
  delegationFailure: string,
  cancel: boolean,
  round: IssuedRound = ROUND,
): object => ({
  state: "failed",
  failure: "delegation",
  delegationFailure,
  shown: "verification-failed",
  initial: round.initial,
  cancel,
});

describe("a delegated round whose evidence carries what was sent", () => {
  it("is ready once active, the tip check passed", () => {
    const verification = verifying();
    verification.observeTip(tipPassed);
    expect(verification.observe(carried())).toEqual({
      state: "ready",
      initial: ROUND.initial,
    });
  });

  it("passes a checksummed wallet and an uppercase signature, echoed in lowercase", () => {
    const verification = verifying({
      ...SENT,
      wallet: `0x${SENT.wallet.slice(2).toUpperCase()}`,
      signature: `0x${SENT.signature.slice(2).toUpperCase()}`,
    });
    verification.observeTip(tipPassed);
    expect(verification.observe(carried()).state).toBe("ready");
  });

  it("passes the vendored vector's object against the delegation it carries", () => {
    const object = carriedObject();
    expect(
      sameDelegation(expectedOf(object), object as CarriedDelegation),
    ).toBe(true);
  });

  it("an undelegated round without the object passes", () => {
    const verification = verifying(null);
    verification.observeTip(tipPassed);
    expect(verification.observe(ROUND.snapshot).state).toBe("ready");
  });
});

describe("a delegation check that fails with T_0 settled", () => {
  it.each<[string, (object: Record<string, unknown>) => void]>([
    ["wallet", o => (o["wallet"] = `0x${"12".repeat(20)}`)],
    ["actionKey", o => (o["actionKey"] = `0x${"34".repeat(20)}`)],
    [
      "sessionId",
      o => (o["sessionId"] = `0x${"56".repeat(16)}${"00".repeat(16)}`),
    ],
    ["expiry", o => (o["expiry"] = 1795000001)],
    ["noticeId", o => (o["noticeId"] = "en-other-1")],
    ["noticeHash", o => (o["noticeHash"] = HASH)],
    ["notice", o => (o["notice"] = "Another text.")],
    ["signature", o => (o["signature"] = `0x${"ab".repeat(64)}1b`)],
  ])("a different %s is a mismatch: one cancel once active", (_field, edit) => {
    const verification = verifying();
    verification.observeTip(tipPassed);
    expect(verification.observe(carried(edit))).toEqual(
      delegationFailed("mismatch", true),
    );
  });

  it("a missing object is judged past starting, never on a starting read", () => {
    const verification = verifying();
    verification.observeTip(tipPassed);
    expect(verification.observe(read(asStarting))).toEqual({
      state: "checking",
    });
    expect(verification.observe(ROUND.snapshot)).toEqual(
      delegationFailed("missing", true),
    );
  });

  it("an object on a round started without one is unexpected", () => {
    const verification = verifying(null);
    verification.observeTip(tipPassed);
    expect(verification.observe(carried())).toEqual(
      delegationFailed("unexpected", true),
    );
  });

  it("requires the cancel only once active", () => {
    const verification = verifying();
    verification.observeTip(tipPassed);
    expect(
      verification.observe(
        read(
          asStarting,
          carrying(o => (o["expiry"] = 2)),
        ),
      ),
    ).toEqual(delegationFailed("mismatch", false));
    expect(verification.observe(carried(o => (o["expiry"] = 2)))).toEqual(
      delegationFailed("mismatch", true),
    );
  });

  it("does not wait for the tip check, and one cancel serves both", () => {
    const verification = verifying();
    expect(verification.observe(carried(o => (o["notice"] = "x")))).toEqual(
      delegationFailed("mismatch", true),
    );
    // The tip check failing too changes nothing: the cancel is the same one.
    expect(verification.observeTip(tipDisagreed)).toEqual(
      delegationFailed("mismatch", true),
    );
  });

  it("after the tip check failed first, the round names the tip check", () => {
    const verification = verifying();
    verification.observeTip(tipDisagreed);
    expect(
      verification.observe(carried(o => (o["notice"] = "x"))),
    ).toMatchObject({ state: "failed", failure: "tip-check", cancel: true });
  });
});

describe("a delegation check that fails with T_0 not settled", () => {
  it("waits for check 5, and signs nothing when check 5 then fails", () => {
    const verification = verifying();
    verification.observeTip(tipPassed);
    const early = read(
      asStarting,
      p => delete p.fairnessProof["readyHash"],
      carrying(o => (o["wallet"] = `0x${"12".repeat(20)}`)),
    );
    expect(verification.observe(early)).toEqual({ state: "checking" });
    const later = read(
      p => (p.fairnessProof["readyHash"] = HASH),
      carrying(o => (o["wallet"] = `0x${"12".repeat(20)}`)),
    );
    expect(verification.observe(later)).toMatchObject({
      state: "failed",
      failure: "ready-mismatch",
      cancel: false,
    });
  });

  it("with checks 1 to 4 failed: nothing is signed, not even a cancel", () => {
    const verification = verifying();
    verification.observeTip(tipPassed);
    const refused = read(
      p => (p.auth["signer"] = `0x${"5e".repeat(20)}`),
      carrying(o => (o["notice"] = "x")),
    );
    expect(verification.observe(refused)).toEqual({
      state: "failed",
      failure: "pinned-mismatch",
      shown: "verification-failed",
      cancel: false,
    });
  });
});

describe("a later read with another object (changed)", () => {
  it("an object appearing after an undelegated round was judged without one is changed", () => {
    const verification = verifying(null);
    verification.observeTip(tipPassed);
    expect(verification.observe(ROUND.snapshot).state).toBe("ready");
    expect(verification.observe(carried())).toEqual(
      delegationFailed("changed", false),
    );
  });

  it("an object first seen on the first judged read, after a starting one without, is unexpected", () => {
    const verification = verifying(null);
    verification.observeTip(tipPassed);
    expect(verification.observe(read(asStarting))).toEqual({
      state: "checking",
    });
    expect(verification.observe(carried())).toEqual(
      delegationFailed("unexpected", true),
    );
  });

  it("fails the round as a re-issue: nothing more is signed", () => {
    const verification = verifying();
    verification.observeTip(tipPassed);
    expect(verification.observe(carried()).state).toBe("ready");
    expect(
      verification.observe(carried(o => (o["acceptedAt"] = 1794990001))),
    ).toEqual(delegationFailed("changed", false));
  });

  it("is changed whether or not the first passed", () => {
    const verification = verifying(null);
    verification.observeTip(tipPassed);
    expect(verification.observe(carried()).state).toBe("failed");
    expect(verification.observe(carried(o => (o["expiry"] = 3)))).toMatchObject(
      {
        delegationFailure: "changed",
        cancel: false,
      },
    );
  });

  it("a later read without the object is not a change", () => {
    const verification = verifying();
    verification.observeTip(tipPassed);
    verification.observe(carried());
    expect(verification.observe(ROUND.snapshot).state).toBe("ready");
  });

  it("keeps each distinct object read in the round's evidence", () => {
    const verification = verifying();
    verification.observeTip(tipPassed);
    verification.observe(carried());
    verification.observe(carried());
    verification.observe(carried(o => (o["acceptedAt"] = 1794990001)));
    expect(verification.delegationEvidence()).toEqual([
      carriedObject(),
      { ...carriedObject(), acceptedAt: 1794990001 },
    ]);
  });
});
