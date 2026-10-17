// T-8: one round's verification over its Snapshots and its tip check (W-25,
// W-26): when `T_0` is settled, when the game may be shown, when a
// `PlayerCancel` may be signed (only with `T_0` settled and only the tip check
// failed, once `active`), and the re-issue rule.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import { type ChainDecision, decideChain } from "./chain-decision.ts";
import {
  asStarting,
  issueRound,
  type IssuedRound,
  type RoundParts,
  ROUND_REQUEST,
} from "./fixtures/round-auth.ts";
import { HASH, reread } from "./fixtures/round-edits.ts";
import { OTHER_ROUND_ID, ROUND_ID } from "./fixtures/vectors.ts";
import {
  createRoundVerification,
  type RoundVerification,
} from "./round-verification.ts";
import type { TipCheckFailure, TipCheckRecord } from "./tip-check.ts";

const record = (failure?: TipCheckFailure): TipCheckRecord =>
  Object.freeze({
    source: "ethereum:block",
    passed: failure === undefined,
    ...(failure === undefined ? {} : { failure }),
    tipCheck: "independent",
    tip: 21000100n,
    low: 21000100n,
    tipLagMargin: 2n,
    chainId: 1n,
    answers: Object.freeze([]),
  });

const BIND = { mode: "future", blockNumber: 21000123n } as const;
const tipPassed: ChainDecision = decideChain(record(), BIND);
const tipDisagreed: ChainDecision = decideChain(record("hash-mismatch"), BIND);
const tipUnread: ChainDecision = decideChain(record("too-few-answered"), BIND);

const verifying = (round: IssuedRound): RoundVerification =>
  createRoundVerification({
    config: round.config,
    roundId: ROUND_ID,
    request: ROUND_REQUEST,
  });

const read = (
  round: IssuedRound,
  edit: (parts: RoundParts) => void,
): ValidSnapshot => reread(round.snapshot, edit);

const reissued = (round: IssuedRound): ValidSnapshot =>
  read(round, p => (p.auth["expiry"] = "1800000601"));

const startingWithoutReady = (round: IssuedRound): ValidSnapshot =>
  read(round, p => {
    asStarting(p);
    delete p.proofs["fairnessProof"];
  });

const startingReady = (round: IssuedRound): ValidSnapshot =>
  read(round, asStarting);

describe("a round that passes every check", () => {
  it("is ready only once active, with T_0 settled", () => {
    const round = issueRound();
    const verification = verifying(round);
    expect(verification.observe(startingWithoutReady(round))).toEqual({
      state: "checking",
    });
    expect(verification.observeTip(tipPassed)).toEqual({ state: "checking" });
    expect(verification.observe(startingReady(round))).toEqual({
      state: "checking",
    });
    expect(verification.observe(round.snapshot)).toEqual({
      state: "ready",
      initial: round.initial,
    });
    expect(verification.verdict()).toEqual({
      state: "ready",
      initial: round.initial,
    });
  });

  it("is not ready until the tip check has passed", () => {
    const round = issueRound();
    const verification = verifying(round);
    expect(verification.observe(round.snapshot)).toEqual({ state: "checking" });
    expect(verification.observeTip(tipPassed).state).toBe("ready");
  });

  it("ignores another round's Snapshot", () => {
    const round = issueRound();
    const verification = verifying(round);
    const other = read(round, p => (p.input["roundId"] = OTHER_ROUND_ID));
    expect(verification.observe(other)).toEqual({ state: "checking" });
    expect(verification.evidence().first).toBeUndefined();
  });
});

describe("a check that fails (T_0 not settled)", () => {
  it.each<[string, (round: IssuedRound) => ValidSnapshot, string]>([
    [
      "pinned-mismatch",
      round => read(round, p => (p.auth["signer"] = `0x${"5e".repeat(20)}`)),
      "pinned-mismatch",
    ],
    [
      "cross-field",
      round => read(round, p => (p.newRound["betAmount"] = "101")),
      "cross-field",
    ],
    [
      "recover-mismatch",
      round => read(round, p => (p.newRound["gameId"] = 2)),
      "recover-mismatch",
    ],
    [
      "ready-mismatch",
      round => read(round, p => (p.fairnessProof["readyHash"] = HASH)),
      "ready-mismatch",
    ],
    [
      "missing readyHash at active",
      round => read(round, p => delete p.fairnessProof["readyHash"]),
      "missing",
    ],
  ])("%s: signs nothing, not even PlayerCancel", (_, snapshotOf, failure) => {
    const round = issueRound();
    const verification = verifying(round);
    verification.observeTip(tipDisagreed);
    expect(verification.observe(snapshotOf(round))).toEqual({
      state: "failed",
      failure,
      shown: "verification-failed",
      cancel: false,
    });
  });

  it("does not run check 5 after checks 1 to 4 failed", () => {
    const round = issueRound();
    const verification = verifying(round);
    verification.observe(
      read(round, p => {
        p.newRound["gameId"] = 2;
        p.fairnessProof["readyHash"] = HASH;
      }),
    );
    expect(verification.verdict()).toMatchObject({
      failure: "recover-mismatch",
    });
  });

  it("checks 1 to 4 once, on the first Snapshot that carries the object", () => {
    const round = issueRound();
    const verification = verifying(round);
    verification.observe(round.snapshot);
    verification.observeTip(tipPassed);
    // The same object on a later read is not checked again.
    const later = read(round, p => (p.input["step"] = 1));
    expect(verification.observe(later).state).toBe("ready");
  });
});

describe("only the tip check fails (T_0 settled)", () => {
  it("signs PlayerCancel once the round is active", () => {
    const round = issueRound();
    const verification = verifying(round);
    verification.observe(startingReady(round));
    expect(verification.observeTip(tipDisagreed)).toEqual({
      state: "failed",
      failure: "tip-check",
      tipFailure: "hash-mismatch",
      shown: "verification-failed",
      initial: round.initial,
      cancel: false,
    });
    expect(verification.observe(round.snapshot)).toMatchObject({
      failure: "tip-check",
      cancel: true,
    });
  });

  it("shows could not verify the chain when too few endpoints answered", () => {
    const round = issueRound();
    const verification = verifying(round);
    verification.observe(round.snapshot);
    expect(verification.observeTip(tipUnread)).toMatchObject({
      failure: "tip-check",
      tipFailure: "too-few-answered",
      shown: "chain-unverified",
      cancel: true,
    });
  });

  it("waits for check 5, and signs nothing if it then fails", () => {
    const round = issueRound();
    const verification = verifying(round);
    verification.observe(startingWithoutReady(round));
    expect(verification.observeTip(tipDisagreed)).toEqual({
      state: "checking",
    });
    const wrong = read(round, p => (p.fairnessProof["readyHash"] = HASH));
    expect(verification.observe(wrong)).toEqual({
      state: "failed",
      failure: "ready-mismatch",
      shown: "verification-failed",
      cancel: false,
    });
  });

  it("keeps the round's first tip decision", () => {
    const round = issueRound();
    const verification = verifying(round);
    verification.observe(round.snapshot);
    verification.observeTip(tipDisagreed);
    expect(verification.observeTip(tipPassed)).toMatchObject({
      failure: "tip-check",
    });
  });
});

describe("a re-issue", () => {
  it("after the round was ready: signs nothing more, and keeps both", () => {
    const round = issueRound();
    const verification = verifying(round);
    verification.observe(round.snapshot);
    verification.observeTip(tipPassed);
    const later = reissued(round);
    expect(verification.observe(later)).toEqual({
      state: "failed",
      failure: "reissued",
      shown: "verification-failed",
      initial: round.initial,
      cancel: false,
    });
    const evidence = verification.evidence();
    expect(evidence.first).toEqual(round.snapshot.proofs?.createRoundAuth);
    expect(evidence.reissues).toEqual([later.proofs?.createRoundAuth]);
  });

  it("withdraws the cancel a tip-check failure required", () => {
    const round = issueRound();
    const verification = verifying(round);
    verification.observe(round.snapshot);
    expect(verification.observeTip(tipDisagreed)).toMatchObject({
      cancel: true,
    });
    expect(verification.observe(reissued(round))).toMatchObject({
      failure: "reissued",
      cancel: false,
    });
  });

  it("applies whether or not the first object passed", () => {
    const round = issueRound();
    const verification = verifying(round);
    verification.observe(read(round, p => (p.newRound["gameId"] = 2)));
    expect(verification.observe(round.snapshot)).toMatchObject({
      failure: "reissued",
    });
  });

  it("is recorded once however often it is read, and the same object is not one", () => {
    const round = issueRound();
    const verification = verifying(round);
    verification.observe(round.snapshot);
    verification.observe(round.snapshot);
    expect(verification.evidence().reissues).toEqual([]);
    verification.observe(reissued(round));
    verification.observe(reissued(round));
    verification.observe(round.snapshot);
    expect(verification.evidence().reissues).toHaveLength(1);
  });
});
