// The one `PlayerCancel` W-26 requires when `T_0` is settled and only the tip
// check failed (W-25). It is signed once, never again at sequence 1, and sent
// on its own route, which the transport never repeats. After any failure the
// Snapshot is read. Only after a lost response or a 503, and only when that
// read shows the round still `active` with no move (and not re-issued), are
// the same signed bytes sent again, once (W-16, W-25). After that resend, or
// any other outcome, the cancel path ends: the round ends by its expiry rule
// unless a Snapshot shows it `canceled`.
//
// After the shell's own cancel (W-25, the Snapshot contract `se.snapshot/1`
// as vendored from the backend's b27afc5: `canceled` is final, and a cancel
// the backend has not answered shows `resolving`): a `resolving` answer, or a
// `resolving` read after any failed call, puts the cancel in `settling`. While
// it settles, only the reads this module sends (`read`, the first one at once)
// may settle it: `canceled` (with or without a `closeReason`), `won`, and
// `lost` are final (`sent`); `active` means it did not take (`not-taken`);
// `idle` ends it (`ended`, a neutral "round ended": not expected since 726f0a2,
// where `idle` never follows `active`; kept as a defensive fallback).
// `resolving` is read into the round and settles nothing; another round's
// Snapshot and a failed read settle nothing. After `SETTLING_READS` reads
// without a settling one, the state is `check-later`, where each `read` still
// follows the same rules. Only a vendored Snapshot contract changes them.

import { cancelRound, ProblemError } from "@intraverse/se-client-play-client";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import {
  type CancelRefusal,
  type CancelState,
  isOfRound,
  isRepeat,
  isResult,
  isUnsettled,
  refusalOf,
  SETTLING_READS,
} from "./cancel-state.ts";
import type { SettledInitial } from "./create-round-auth.ts";
import { ShellError } from "./errors.ts";
import type { DeliveryOptions, RoundDelivery } from "./round-delivery.ts";
import {
  isCallError,
  isRefusal,
  isUnavailable,
  type Sent,
  isUnknownOutcome,
  signedBody,
  snapshotOf,
} from "./round-request.ts";
import type { RoundSigner } from "./round-signer.ts";
import { encoderOf, type FlowTestHooks } from "./typed-data.ts";

export type RoundCancel = {
  readonly state: () => CancelState;
  /** How often the same signed cancel was sent again: 0 or 1. */
  readonly resends: () => number;
  /** Signs and sends the cancel, the first time only. */
  readonly run: (signer: RoundSigner, initial: SettledInitial) => Promise<void>;
  /**
   * Whether a Snapshot that reaches the round from elsewhere (not one of this
   * module's own answers or reads) is held back: while `in-flight`, `settling`,
   * or `check-later`, every one of this round is, so no read but the cancel's
   * own can settle it or show the round over.
   */
  readonly holds: (snapshot: ValidSnapshot) => boolean;
  /**
   * While `settling` or `check-later`: one Snapshot read under the settling
   * rules, counted toward `SETTLING_READS`. One counted read runs at a time: a
   * call made while one is in flight joins it (no second read is sent).
   * Otherwise it does nothing.
   */
  readonly read: () => Promise<void>;
  /** Every problem a cancel call was answered with, in order (W-27). */
  readonly refusals: () => readonly CancelRefusal[];
};

export type CancelHost = {
  readonly roundId: string;
  /** Whether the round's `CreateRoundAuth` was re-issued (W-26). */
  readonly reissued: () => boolean;
  /** Reads a validated Snapshot into the round, past the cancel's gate. */
  readonly intoRound: (snapshot: ValidSnapshot) => Promise<unknown>;
};

/** What one send of the cancel leads to. */
type Attempt = "done" | "resend";

/** `hooks` is test-only (typed-data.ts): production passes none. */
export const createRoundCancel = (
  options: DeliveryOptions,
  host: CancelHost,
  delivery: RoundDelivery,
  hooks: FlowTestHooks = {},
): RoundCancel => {
  const { roundId } = host;
  const encode = encoderOf(hooks);
  let state: CancelState = "none";
  let resends = 0;
  // Reads sent since the cancel began to settle.
  let reads = 0;
  const refusals: CancelRefusal[] = [];
  // The counted read in flight, which a second call joins.
  let reading: Promise<void> | undefined;

  const sign = (signer: RoundSigner, initial: SettledInitial): Sent =>
    delivery.record(
      signedBody(
        encode,
        roundId,
        "cancel",
        {
          action: "cancel",
          path: [],
          sequence: 1,
          round: signer.round,
          previous: initial,
        },
        () => signer.signCancel(),
        () => {
          // The cancel stops the round itself, whoever calls `run`.
          signer.fail();
          delivery.fail(new ShellError("invalid-input"));
        },
      ),
    );

  const ofRound = (snapshot: ValidSnapshot): boolean =>
    isOfRound(snapshot, roundId);
  const unsettled = (snapshot: ValidSnapshot): boolean =>
    isUnsettled(snapshot, roundId);

  const settlingNow = (): boolean =>
    state === "settling" || state === "check-later";

  const holding = (): boolean => state === "in-flight" || settlingNow();

  // A read that shows the round `active` with no move applied.
  const noMove = (read: ValidSnapshot | undefined): boolean =>
    read?.status === "active" && read.roundId === roundId && read.step === 0;

  // W-25: such a read, with the round's `CreateRoundAuth` not re-issued.
  const stillCancelable = (read: ValidSnapshot | undefined): boolean =>
    noMove(read) && !host.reissued();

  /**
   * What a read of the round after the cancel was sent decides (W-25): `idle`
   * ends it, `active` means it did not take, a result (`canceled` included) is
   * final, and anything else (`resolving`, another round, no Snapshot) leaves
   * it unsettled. A Snapshot of the round is read into it.
   */
  const decide = async (
    snapshot: ValidSnapshot | undefined,
  ): Promise<"ended" | "not-taken" | "sent" | "unsettled" | "none"> => {
    if (snapshot === undefined) return "none";
    // Not expected since 726f0a2 (`idle` never follows `active`): a defensive
    // fallback, a round ended with no result to claim.
    if (snapshot.status === "idle") return "ended";
    if (!ofRound(snapshot)) return "none";
    if (isResult(snapshot, roundId)) {
      await host.intoRound(snapshot);
      return "sent";
    }
    if (snapshot.status === "active") {
      await host.intoRound(snapshot);
      return "not-taken";
    }
    // `resolving` is read into the round (W-35 polls it) and settles nothing.
    if (unsettled(snapshot)) {
      await host.intoRound(snapshot);
      return "unsettled";
    }
    return "none";
  };

  // One counted read under the settling rules (W-25, W-35).
  const settleRead = async (): Promise<void> => {
    reads += 1;
    // Only one counted read runs at a time (`countedRead`), and nothing else
    // changes the state while settling, so the state is still unsettled here.
    const snapshot = await delivery.fetch();
    const decided = await decide(snapshot);
    if (decided === "ended" || decided === "not-taken" || decided === "sent") {
      state = decided;
      return;
    }
    if (state === "settling" && reads >= SETTLING_READS) state = "check-later";
  };

  const countedRead = (): Promise<void> => {
    if (reading !== undefined) return reading;
    const run = settleRead().finally(() => {
      reading = undefined;
    });
    reading = run;
    return run;
  };

  const attempt = async (sent: Sent, resend: boolean): Promise<Attempt> => {
    state = "in-flight";
    try {
      const result = await cancelRound(options.transport, sent.body, {
        authorization: options.authorization,
      });
      const answer = snapshotOf(result.body);
      // An answer that is not this round's Snapshot tells nothing: the outcome
      // is unknown, and the Snapshot is read.
      if (!ofRound(answer)) throw new ShellError("snapshot-rejected");
      if (unsettled(answer)) {
        // Not read into the round; the counted reads settle it.
        state = "settling";
        await countedRead();
        return "done";
      }
      state = answer.status === "active" ? "not-taken" : "sent";
      await host.intoRound(answer);
      return "done";
    } catch (error) {
      if (!isCallError(error)) throw error;
      delivery.fail(error);
      if (error instanceof ProblemError) refusals.push(refusalOf(error));
      // W-16's one lost send (W-42). A 422, or a 503 even `retryable: false`,
      // may have stored it: the reads decide.
      const unknown = isUnknownOutcome(error);
      const stored = isRepeat(error) || isUnavailable(error);
      const refused = !unknown && isRefusal(error) && !stored;
      // Still `in-flight`: the read below is the cancel's own.
      const read = await delivery.fetch();
      if (read !== undefined && unsettled(read)) {
        // After any failed call the cancel may have been taken (a 422 may
        // answer a resend while the round is `resolving`): this is the first
        // counted read, and it settles nothing. Nothing is resent.
        state = "settling";
        reads = 1;
        await host.intoRound(read);
        return "done";
      }
      // Read into the round first: a re-issue it shows stops the resend.
      const decided = await decide(read);
      // The one resend (W-16, W-25): only after an unknown outcome of the first
      // send, and a read of the round `active` with no move.
      if (unknown && stillCancelable(read) && !resend) return "resend";
      // An unknown outcome and the round still `active` with no move, when no
      // resend is allowed (this was the resend, or a re-issue stops it).
      if (!refused && (decided === "none" || (unknown && noMove(read)))) {
        // The cancel may be stored: the counted reads decide. This was read 1;
        // nothing more is sent.
        state = "settling";
        reads = 1;
        return "done";
      }
      // After any failure, `idle` ends it, a result is final, and `active` means
      // the cancel did not take: a 400 refused it for good, a 422 answers a
      // cancel of a round that is not active (a resend included), and after an
      // unknown outcome the read decides.
      state =
        decided === "ended" || decided === "sent" || decided === "not-taken"
          ? decided
          : "refused";
      return "done";
    }
  };

  const run = async (
    signer: RoundSigner,
    initial: SettledInitial,
  ): Promise<void> => {
    // Any state but `none` means the cancel was reached: it is never signed
    // again.
    if (state !== "none") return;
    let sent: Sent;
    try {
      sent = sign(signer, initial);
    } catch (error) {
      // Nothing was signed; it is not tried again.
      state = "unavailable";
      if (!(error instanceof ShellError)) throw error;
      return;
    }
    // `attempt` sets `in-flight` before its first await, so a second call
    // returns above and never signs again.
    await delivery.whileBusy(async () => {
      if ((await attempt(sent, false)) === "resend") {
        // The same bytes and key, once; a second unknown outcome is read and
        // never sent a third time.
        resends += 1;
        await attempt(sent, true);
      }
    });
  };

  return Object.freeze({
    state: (): CancelState => state,
    resends: (): number => resends,
    run,
    holds: (snapshot: ValidSnapshot): boolean => holding() && ofRound(snapshot),
    read: async (): Promise<void> => {
      if (settlingNow()) await countedRead();
    },
    refusals: (): readonly CancelRefusal[] => Object.freeze([...refusals]),
  });
};
