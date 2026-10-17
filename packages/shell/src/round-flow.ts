// One round's use cases on the Play API, composed from the round's tracking
// (its Snapshots, verdict, tip check, and transcript state), its delivery
// (signing, recording, and sending, W-16 and W-19), the required cancel
// (W-25, W-26), and the player actions (W-23, W-24). The flow signs nothing
// until the verdict is `ready`, except the one `PlayerCancel` the verdict
// requires; a re-issue stops every new signature while a W-16 resend still goes
// out (W-26).
//
// The flow emits no log, metric, or event. What it keeps (the round's
// evidence: the `CreateRoundAuth` objects, the tip-check record, and every
// signed action) holds no key and no token.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import { redacting } from "./redaction.ts";
import { createRoundActions, type RoundActions } from "./round-actions.ts";
import { type CancelState, createRoundCancel } from "./round-cancel.ts";
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

export type RoundFlowOptions = TrackingOptions & DeliveryOptions;

/** The round's evidence (W-27): nothing in it is secret. */
export type RoundEvidence = TrackingEvidence & {
  /** Every action signed for the round, in order. */
  readonly signed: ReturnType<RoundDelivery["signed"]>;
};

type Signer = NonNullable<ReturnType<RoundTracking["signer"]>>;

export type RoundFlow = RoundActions & {
  readonly roundId: string;
  readonly verdict: RoundTracking["verdict"];
  /** The transcript state's phase, or `unopened` before it may sign. */
  readonly phase: () => ReturnType<Signer["phase"]> | "unopened";
  /** The shell's latest validated Snapshot of the round. */
  readonly latest: () => ValidSnapshot;
  readonly cancel: () => CancelState;
  /** The last failure of a call the flow made, for the error state (W-42). */
  readonly lastError: () => Error | undefined;
  readonly evidence: () => RoundEvidence;
  /** Reads a validated Snapshot; another round's, or `idle`, is ignored. */
  readonly observe: (snapshot: ValidSnapshot) => Promise<void>;
  /** Reads the Snapshot from the Play API (`getSnapshot`) and observes it. */
  readonly refresh: () => Promise<void>;
};

/** The flow of a round already started (its verdict reads `round.request`). */
export const createRoundFlow = (
  options: RoundFlowOptions,
  round: TrackedRound,
  first: ValidSnapshot,
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
  const delivery = createRoundDelivery(options, host);
  const cancel = createRoundCancel(
    options,
    {
      roundId: round.roundId,
      reissued: (): boolean => {
        const verdict = tracking.verdict();
        return verdict.state === "failed" && verdict.failure === "reissued";
      },
    },
    delivery,
  );
  const actions = createRoundActions(options.session, tracking, delivery);

  const observe = async (snapshot: ValidSnapshot): Promise<void> => {
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
  host.observe = observe;

  return redacting({
    ...actions,
    roundId: round.roundId,
    verdict: tracking.verdict,
    phase: (): ReturnType<Signer["phase"]> | "unopened" =>
      tracking.signer()?.phase() ?? "unopened",
    latest: tracking.latest,
    cancel: cancel.state,
    lastError: (): Error | undefined =>
      delivery.lastError() ?? tracking.tipError(),
    evidence: (): RoundEvidence =>
      Object.freeze({ ...tracking.evidence(), signed: delivery.signed() }),
    observe,
    refresh: delivery.refresh,
  });
};
