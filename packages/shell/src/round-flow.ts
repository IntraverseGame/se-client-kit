// One round's use cases on the Play API, composed from the round's tracking
// (its Snapshots, verdict, tip check, and transcript state), its delivery
// (signing, recording, and sending, W-16 and W-19), the required cancel
// (W-25, W-26), and the player actions (W-23, W-24). The flow signs nothing
// until the verdict is `ready`, except the one `PlayerCancel` the verdict
// requires; a re-issue stops every new signature while a W-16 resend still goes
// out (W-26). From signing that cancel until it settles (`resolving` is not
// final), the round's Snapshots reach the tracking only through the cancel's
// own answer and reads (W-25).
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

export type RoundFlowOptions = TrackingOptions & DeliveryOptions;

/** The round's evidence (W-27): nothing in it is secret. */
export type RoundEvidence = TrackingEvidence & {
  /** Every action signed for the round, in order. */
  readonly signed: ReturnType<RoundDelivery["signed"]>;
  /** Every problem the required cancel's calls were answered with. */
  readonly cancelRefusals: ReturnType<RoundCancel["refusals"]>;
};

type Signer = NonNullable<ReturnType<RoundTracking["signer"]>>;

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
  // The cancel's gate comes before the tracking: while it settles, no
  // Snapshot of the round from elsewhere (a stale read included) is read in.
  const observe = async (snapshot: ValidSnapshot): Promise<void> => {
    if (cancel.holds(snapshot)) return;
    await intoRound(snapshot);
  };
  host.observe = observe;

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
