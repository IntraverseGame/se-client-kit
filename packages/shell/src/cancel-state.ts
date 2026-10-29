// The required cancel's states (W-25, W-26) and how a Snapshot of the round
// reads after the shell's own cancel, per the Snapshot contract `se.snapshot/1`
// as vendored from the backend's b27afc5: a cancel the backend has not
// answered shows `resolving`; then the round shows `canceled`, which is final,
// or `active` (the cancel did not take). Since the Play API document of
// 726f0a2 a re-read keeps showing the round once it has ended, with its
// result, and `idle` never follows `active` (a round is voided only while
// `starting`). Since b47b286 a cancel that arrives after the round had closed
// settles by that closure (`won`, `lost`, or `canceled` with `closeReason:
// "expired"`), never honored. It changes only with a vendored change of the
// Snapshot contract.
// A stale answer or read of the round (W-29, #163: lower in `version` than the
// round's latest or the cancel's own answers and reads) decides nothing.

import { ProblemError } from "@intraverse/se-client-play-client";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import { isStale } from "./snapshot-reading.ts";

/** The required cancel's progress (W-25, W-26). */
export type CancelState =
  /** No cancel is required, or it has not been reached. */
  | "none"
  /**
   * Signed: its call, a resend, or the read after a failed call is in flight.
   * Every Snapshot of the round from elsewhere is held back until the cancel's
   * own answer or read decides (W-25).
   */
  | "in-flight"
  /**
   * Required, but not sent: the signed cancel did not match its typed data (the
   * round is failed), or it could not be signed (a `ShellError`, the signer
   * lock lost included).
   */
  | "unavailable"
  /**
   * Signed and sent; the answer, or a read that settled the cancel, was the
   * round's result (`canceled`, with or without a `closeReason`, `won`, or
   * `lost`). `won`, `lost`, and `canceled` with `closeReason: "expired"` also
   * come when the round had closed before the cancel arrived: the cancel was
   * never honored.
   */
  | "sent"
  /**
   * The cancel did not take: its answer, or a read while it settled, showed the
   * round `active`. Nothing more is sent; the round ends by its expiry rule.
   */
  | "not-taken"
  /**
   * While it settled, or after a failed call, a read showed `idle`: the cancel
   * took and the round ended. The round is over with no result claim ("round
   * ended"); a new round may start.
   */
  | "ended"
  /**
   * Answered (or read, after any failed call) `resolving`: the backend has not
   * answered the cancel yet. The round is not over, and a new round is not
   * started; the Wrapper keeps reading (W-35).
   */
  | "settling"
  /**
   * `SETTLING_READS` reads did not settle it: "still settling, check later". No
   * result is shown; the fast poll stops, and a "check again" read or the slow
   * background read may still settle it (W-35).
   */
  | "check-later"
  /**
   * Refused for good (a 400, or another problem that is not retryable but a
   * 422, a 503, or a 500 `INTERNAL`, which the shell reads as possibly stored),
   * and the read after it decided nothing (it failed, or showed another round):
   * after a 400 the round is back to `active` per the contract, and nothing is
   * resent. Every other failed call ends `settling` or decided by its read, so
   * no state leaves a cancel that may be stored with nothing reading it.
   */
  | "refused";

/**
 * Whether the cancel holds the round (W-25): `in-flight`, `settling`, or
 * `check-later`. The round is not over, every Snapshot of it from elsewhere is
 * held back, and no new round starts for the session.
 */
export const holdsRound = (state: CancelState): boolean =>
  state === "in-flight" || state === "settling" || state === "check-later";

/** The reads after the cancel's answer before `check-later` (W-35). */
export const SETTLING_READS = 30;

const RESULT: ReadonlySet<string> = new Set(["won", "lost", "canceled"]);

/** A Snapshot of the round `roundId` (not `idle`, not another round). */
export const isOfRound = (snapshot: ValidSnapshot, roundId: string): boolean =>
  snapshot.status !== "idle" && snapshot.roundId === roundId;

/** W-25: after the shell's own cancel, `resolving` may still change. */
export const isUnsettled = (
  snapshot: ValidSnapshot,
  roundId: string,
): boolean => isOfRound(snapshot, roundId) && snapshot.status === "resolving";

/**
 * W-25: the round's result, final as it comes: `canceled` (with or without a
 * `closeReason`), `won`, or `lost`.
 */
export const isResult = (snapshot: ValidSnapshot, roundId: string): boolean =>
  isOfRound(snapshot, roundId) && RESULT.has(snapshot.status);

/** A problem answer to a cancel call, as the round's evidence keeps it (W-27). */
export type CancelRefusal = {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
};

/** The refusal's status, code, and request id; never its body. */
export const refusalOf = (error: ProblemError): CancelRefusal =>
  Object.freeze({
    status: error.problem.status,
    code: error.problem.code,
    ...(error.problem.requestId === undefined
      ? {}
      : { requestId: error.problem.requestId }),
  });

/** A 422: a resent cancel, or a cancel of a round that is not `active`. */
export const isRepeat = (error: Error): boolean =>
  error instanceof ProblemError && error.problem.status === 422;

/** What orders the answers and reads the required cancel takes (W-29, #163). */
export type CancelVersions = {
  /**
   * An answer or a read, or `undefined` when there is none or it is a stale
   * Snapshot of the round: lower in `version` than the round's latest Snapshot
   * or than any of the cancel's own answers and reads (`isStale`). An equal
   * `version` is kept, and raises the reference.
   */
  readonly current: (
    read: ValidSnapshot | undefined,
  ) => ValidSnapshot | undefined;
};

export const createCancelVersions = (
  roundId: string,
  latest: () => ValidSnapshot,
): CancelVersions => {
  // The highest `version` of the cancel's own answers and reads of the round.
  let newest = -1;
  const current = (
    read: ValidSnapshot | undefined,
  ): ValidSnapshot | undefined => {
    if (read === undefined || !isOfRound(read, roundId)) return read;
    const version = Math.max(newest, latest().version);
    if (isStale(read, { version })) return undefined;
    newest = Math.max(newest, read.version);
    return read;
  };
  return Object.freeze({ current });
};

/** What a read of the round after the cancel was sent decides (W-25). */
export type Decided = "ended" | "not-taken" | "sent" | "unsettled" | "none";

/**
 * `idle` ends it, `active` means it did not take, a result (`canceled`
 * included) is final, and anything else (`resolving`, another round, no
 * Snapshot) leaves it unsettled. A Snapshot of the round is read into it
 * (`intoRound`).
 */
export const decideRead = async (
  snapshot: ValidSnapshot | undefined,
  roundId: string,
  intoRound: (snapshot: ValidSnapshot) => Promise<unknown>,
): Promise<Decided> => {
  if (snapshot === undefined) return "none";
  // Not expected since 726f0a2 (`idle` never follows `active`): a defensive
  // fallback, a round ended with no result to claim.
  if (snapshot.status === "idle") return "ended";
  if (!isOfRound(snapshot, roundId)) return "none";
  if (isResult(snapshot, roundId)) {
    await intoRound(snapshot);
    return "sent";
  }
  if (snapshot.status === "active") {
    await intoRound(snapshot);
    return "not-taken";
  }
  // `resolving` is read into the round (W-35 polls it) and settles nothing.
  if (isUnsettled(snapshot, roundId)) {
    await intoRound(snapshot);
    return "unsettled";
  }
  return "none";
};
