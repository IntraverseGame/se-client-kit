// One round's use cases on the Play API, composed from the round's tracking
// (its Snapshots, verdict, tip check, and transcript state), its delivery
// (signing, recording, and sending, W-16 and W-19), the required cancel
// (W-25, W-26), and the player actions (W-23, W-24). The flow signs nothing
// until the verdict is `ready`, except the one `PlayerCancel` the verdict
// requires; a re-issue stops every new signature while a W-16 resend still goes
// out (W-26). A move or a cash-out whose send had an unknown outcome is sent
// again, once, with its recorded bytes and key, when a later read of the round
// shows it not applied (W-16; decided in human review, 2026-10-18). From
// signing that cancel until it settles (`resolving` is not final), the round's
// Snapshots reach the tracking only through the cancel's own answer and reads
// (W-25).
//
// The flow emits no log, metric, or event. What it keeps (the round's
// evidence: the `CreateRoundAuth` objects, the tip-check record, and every
// signed action) holds no key and no token.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import { type CancelState, holdsRound } from "./cancel-state.ts";
import { redacting } from "./redaction.ts";
import { createRoundActions, type RoundActions } from "./round-actions.ts";
import { createRoundCancel, type RoundCancel } from "./round-cancel.ts";
import {
  createRoundDelivery,
  type DeliveryOptions,
  type RoundDelivery,
} from "./round-delivery.ts";
import {
  createRoundTracking,
  type RoundTracking,
  type TrackedRound,
  type TrackingEvidence,
  type TrackingOptions,
} from "./round-tracking.ts";
import { isRoundOver } from "./snapshot-reading.ts";
import type { FlowTestHooks } from "./typed-data.ts";

export type RoundFlowOptions = TrackingOptions &
  DeliveryOptions & {
    /**
     * The session's one-presentation guard (W-53, session-presentation.ts): a
     * Snapshot it does not admit is not read into the round, and nothing is
     * sent or signed for it. Absent in the round's own tests.
     */
    readonly admit?: (snapshot: ValidSnapshot) => boolean;
  };

/** The round's evidence (W-27): nothing in it is secret. */
export type RoundEvidence = TrackingEvidence & {
  /** Every action signed for the round, in order. */
  readonly signed: ReturnType<RoundDelivery["signed"]>;
  /** Every problem the required cancel's calls were answered with. */
  readonly cancelRefusals: ReturnType<RoundCancel["refusals"]>;
};

type Signer = NonNullable<ReturnType<RoundTracking["signer"]>>;

/** Which action is not confirmed (W-16). */
export type Unconfirmed = "move" | "cash-out";

export type RoundFlow = RoundActions & {
  readonly roundId: string;
  readonly verdict: RoundTracking["verdict"];
  /** The transcript state's phase, or `unopened` before it may sign. */
  readonly phase: () => ReturnType<Signer["phase"]> | "unopened";
  /** The shell's latest validated Snapshot of the round. */
  readonly latest: () => ValidSnapshot;
  /**
   * Whether the round is over: `true` once the cancel is `ended` (the round
   * ended with no result claim), `false` while it is `in-flight`, `settling`,
   * or `check-later` (W-25), and otherwise whether the latest Snapshot shows it
   * over (`isRoundOver`).
   */
  readonly over: () => boolean;
  /**
   * The required cancel's progress. While it is `settling` or `check-later`,
   * the round is not over and no new round may start; the Wrapper reads the
   * Snapshot through `refresh` (W-35) or `checkAgain`.
   */
  readonly cancel: () => CancelState;
  /** The last failure of a call the flow made, for the error state (W-42). */
  readonly lastError: () => Error | undefined;
  /**
   * The pending move or cash-out whose one W-16 resend was lost too (no answer,
   * or a 503 not marked `retryable: false`), while the round's latest Snapshot
   * is `active` and the action is neither applied nor refused: the "move not
   * confirmed" state (W-16). `undefined` otherwise, so any read that settles
   * the round clears it.
   */
  readonly unconfirmed: () => Unconfirmed | undefined;
  readonly evidence: () => RoundEvidence;
  /**
   * Reads a validated Snapshot; another round's, or `idle`, is ignored, and so
   * is every one of the round while its cancel is `settling` or `check-later`
   * (only the cancel's own reads may settle it).
   */
  readonly observe: (snapshot: ValidSnapshot) => Promise<void>;
  /**
   * Reads the Snapshot from the Play API (`getSnapshot`) and observes it; while
   * the cancel settles, it is one of the cancel's counted reads.
   */
  readonly refresh: () => Promise<void>;
  /**
   * "Check again" (W-35): one read under the cancel's settling rules, also in
   * `check-later`. Otherwise the same as `refresh`.
   */
  readonly checkAgain: () => Promise<void>;
};

/**
 * The flow of a round already started (its verdict reads `round.request`).
 * `hooks` is test-only (typed-data.ts): production passes none.
 */
export const createRoundFlow = (
  options: RoundFlowOptions,
  round: TrackedRound,
  first: ValidSnapshot,
  hooks: FlowTestHooks = {},
): RoundFlow => {
  const tracking = createRoundTracking(options, round, first);
  const host = {
    roundId: round.roundId,
    // Set below: the delivery reads every answer through the flow's `observe`,
    // which runs the required cancel, which sends through the delivery.
    observe: async (snapshot: ValidSnapshot): Promise<void> => {
      await tracking.observe(snapshot);
    },
    signer: tracking.signer,
  };
  const delivery = createRoundDelivery(options, host, hooks);
  const cancel = createRoundCancel(
    options,
    {
      roundId: round.roundId,
      reissued: (): boolean => {
        const verdict = tracking.verdict();
        return verdict.state === "failed" && verdict.failure === "reissued";
      },
      // Past the cancel's gate (defined below; called only later).
      intoRound: (snapshot: ValidSnapshot): Promise<void> =>
        intoRound(snapshot),
    },
    delivery,
    hooks,
  );
  const actions = createRoundActions(options.session, tracking, delivery);

  const intoRound = async (snapshot: ValidSnapshot): Promise<void> => {
    // A Snapshot that changed the session is not read in (W-53).
    if (options.admit?.(snapshot) === false) return;
    const verdict = await tracking.observe(snapshot);
    const signer = tracking.signer();
    if (
      verdict.state === "failed" &&
      verdict.cancel &&
      verdict.initial !== undefined &&
      signer !== undefined
    ) {
      await cancel.run(signer, verdict.initial);
      // The one cancel is signed (or could not be): nothing more is (W-26).
      signer.fail();
    }
  };
  // The highest `version` of the round's Snapshots read so far: a late, older
  // read never decides a resend (W-16's "a later read").
  let newest = -1;

  // W-16's one resend of a lost move or cash-out (decided in human review,
  // 2026-10-18): its last send was lost (no answer, or a 503 not marked
  // `retryable: false`), and this read, the newest of the round, shows it
  // `active` at the step before the action, which is still pending (not
  // applied) and resendable (not after W-19's hold, a failed check, an
  // out-of-sync read, or the session's end; a re-issue still allows it, W-26).
  // The recorded body goes out again, the same bytes and idempotency key,
  // never re-signed, and only once (`resendOnce`): when that send fails too,
  // the action stays pending and the round ends by its expiry rule. A cancel
  // is never resent here (`resendable` never gives one; W-25 has its own).
  // Belt and braces: the step check repeats what `resendable` and the newest
  // read already imply (an applied or out-of-sync step leaves nothing
  // resendable), as `lost` being cleared on an answer repeats `resendOnce`.
  const resendLost = async (snapshot: ValidSnapshot): Promise<void> => {
    const action = delivery.lost();
    const sent = delivery.lastSent();
    if (
      action === undefined ||
      delivery.resent(action) ||
      delivery.busy() ||
      sent?.action !== action ||
      tracking.signer()?.resendable() !== action ||
      snapshot.roundId !== round.roundId ||
      snapshot.version < newest ||
      snapshot.status !== "active" ||
      snapshot.step !== action.message.sequence - 1
    ) {
      return;
    }
    await delivery.resendOnce(sent);
  };

  // The cancel's gate comes before the tracking: while it settles, no
  // Snapshot of the round from elsewhere (a stale read included) is read in.
  const observe = async (snapshot: ValidSnapshot): Promise<void> => {
    // A Snapshot that changed the session is not read in, and resends nothing
    // (W-53).
    if (options.admit?.(snapshot) === false) return;
    if (cancel.holds(snapshot)) return;
    if (snapshot.status !== "idle" && snapshot.roundId === round.roundId) {
      newest = Math.max(newest, snapshot.version);
    }
    await intoRound(snapshot);
    await resendLost(snapshot);
  };
  host.observe = observe;

  // Nothing more is sent for it (it had its one resend), so only a read can
  // settle it: applied, refused (W-19), out of sync, or the round over.
  const unconfirmed = (): Unconfirmed | undefined => {
    const action = delivery.lost();
    if (
      action === undefined ||
      !delivery.resent(action) ||
      // Not implied by the rest: while the resend is in flight, `lost` still
      // names the action (the first send's outcome) and `resent` is already
      // set, so only `busy` keeps an unanswered resend from reading as lost.
      delivery.busy() ||
      tracking.signer()?.resendable() !== action ||
      tracking.latest().status !== "active"
    ) {
      return undefined;
    }
    return action.kind === "cash-out" ? "cash-out" : "move";
  };

  const refresh = async (): Promise<void> => {
    const state = cancel.state();
    if (state === "settling" || state === "check-later") {
      await cancel.read();
      return;
    }
    await delivery.refresh();
  };

  return redacting({
    ...actions,
    roundId: round.roundId,
    verdict: tracking.verdict,
    phase: (): ReturnType<Signer["phase"]> | "unopened" =>
      tracking.signer()?.phase() ?? "unopened",
    latest: tracking.latest,
    over: (): boolean => {
      const state = cancel.state();
      if (state === "ended") return true;
      // Defensive: while the cancel holds the round, no Snapshot of it from
      // elsewhere is read in, and a result read in settles it at once, so the
      // latest Snapshot is not over anyway (W-25).
      if (holdsRound(state)) return false;
      return isRoundOver(tracking.latest());
    },
    cancel: cancel.state,
    lastError: (): Error | undefined =>
      delivery.lastError() ?? tracking.tipError(),
    unconfirmed,
    evidence: (): RoundEvidence =>
      Object.freeze({
        ...tracking.evidence(),
        signed: delivery.signed(),
        cancelRefusals: cancel.refusals(),
      }),
    observe,
    refresh,
    checkAgain: refresh,
  });
};
