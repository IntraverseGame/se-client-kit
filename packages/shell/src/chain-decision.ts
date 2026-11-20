// What a tip check means for the round (W-26, W-26a, W-26b): it passes, or it
// fails and the record is kept. The bind rule checks the round's block `N`
// against the observed tip. A failure does not by itself sign anything: the
// shell signs `PlayerCancel` only when `T_0` is settled and the round's
// `CreateRoundAuth` was not re-issued (W-25, W-26), and otherwise signs nothing
// for the round. The start flow that acts on the decision is not built yet;
// this module only decides.

import type { TipCheckFailure, TipCheckRecord } from "./tip-check.ts";

/**
 * How the round's block was chosen: `future` (a block after the bind) or `tip`
 * (the current tip). PROVISIONAL: the Snapshot does not say which; the caller
 * passes it until the contract that carries the bind does.
 */
export type BindMode = "future" | "tip";

/** The round's bind, as the shell checks it against the tip. */
export type Bind = {
  readonly mode: BindMode;
  /** `N`: the Snapshot's `proofs.randomnessProof.blockNumber`. */
  readonly blockNumber: bigint;
};

/**
 * The bind rule (W-26b): for a `future` bind `N` is above the observed tip; for
 * a `tip` bind `N` is not older than the tip by more than the lag margin.
 */
export const bindHolds = (
  bind: Bind,
  tip: bigint,
  tipLagMargin: bigint,
): boolean =>
  bind.mode === "future"
    ? bind.blockNumber > tip
    : bind.blockNumber >= tip - tipLagMargin;

/** What the player is shown when the check fails. */
export type FailReason =
  /** "could not verify the chain": too few endpoints answered (W-26a). */
  | "chain-unverified"
  /**
   * "this round failed verification": the endpoints disagreed, or the bind is
   * not consistent with the tip (W-26, W-26b). When `T_0` is settled and the
   * shell signs `PlayerCancel`, the text adds "and was canceled" (W-26).
   */
  | "verification-failed";

export type ChainDecision =
  | {
      /** The tip check passed and the bind holds. */
      readonly verdict: "pass";
      readonly record: TipCheckRecord;
    }
  | {
      /**
       * The check failed: the shell keeps the record and shows `reason`. It
       * signs `PlayerCancel` once the round is `active` only if `T_0` is
       * settled and there was no re-issue; otherwise it signs nothing for the
       * round, not even `PlayerCancel` (W-25, W-26).
       */
      readonly verdict: "fail";
      readonly reason: FailReason;
      /** The tip check's failure, or `bind` when only the bind rule failed. */
      readonly failure: TipCheckFailure | "bind";
      readonly record: TipCheckRecord;
    };

// No endpoint, or no usable answer, means the chain could not be read; an
// answer that disagrees means it was read and the round fails verification.
const REASONS: Readonly<Record<TipCheckFailure, FailReason>> = {
  "unknown-source": "chain-unverified",
  "too-few-answered": "chain-unverified",
  "chain-id-unavailable": "chain-unverified",
  "hash-unavailable": "chain-unverified",
  "chain-id-mismatch": "verification-failed",
  lagging: "verification-failed",
  "hash-mismatch": "verification-failed",
};

/** Decides from a tip check's record and the round's bind. */
export const decideChain = (
  record: TipCheckRecord,
  bind: Bind,
): ChainDecision => {
  if (!record.passed || record.tip === null || record.tipLagMargin === null) {
    const failure = record.failure ?? "too-few-answered";
    return Object.freeze({
      verdict: "fail",
      reason: REASONS[failure],
      failure,
      record,
    });
  }
  if (!bindHolds(bind, record.tip, record.tipLagMargin)) {
    return Object.freeze({
      verdict: "fail",
      reason: "verification-failed",
      failure: "bind",
      record,
    });
  }
  return Object.freeze({ verdict: "pass", record });
};
