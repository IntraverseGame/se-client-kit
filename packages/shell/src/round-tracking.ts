// What the shell knows of one round: its latest validated Snapshot, the
// round's verdict (W-26), the tip check (run once, W-26b), and the transcript
// state, opened only with the verdict's settled `T_0` once it may sign, and
// told of a re-issue. It signs nothing itself.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import { roundIdBytes32 } from "./bytes32-text.ts";
import type { ChainConfig } from "./chain-config.ts";
import type { ChainDecision } from "./chain-decision.ts";
import type { SettledInitial, StartRequest } from "./create-round-auth.ts";
import { ShellError } from "./errors.ts";
import type { RoundSigner } from "./round-signer.ts";
import {
  type AuthEvidence,
  createRoundVerification,
  type RoundVerdict,
} from "./round-verification.ts";
import type { SigningSession } from "./signing-session.ts";
import type { TipCheckRecord } from "./tip-check.ts";

export type TrackingOptions = {
  readonly session: SigningSession;
  /** The validated environment configuration (W-26's trust anchor). */
  readonly config: ChainConfig;
  /**
   * Runs the round's tip check and decides it with the bind rule (W-26b): the
   * Wrapper wires `runTipCheck`, its RPC transport, and the bind mode. Called
   * once, with the first Snapshot that carries `proofs.randomnessProof`, unless
   * the verdict has already failed. A rejection leaves the verdict `checking`:
   * nothing is signed.
   */
  readonly tipCheck: (snapshot: ValidSnapshot) => Promise<ChainDecision>;
};

export type TrackedRound = {
  /** The Snapshot `roundId` the `start` response named. */
  readonly roundId: string;
  /** What the shell sent in `start`. */
  readonly request: StartRequest;
};

export type TrackingEvidence = {
  readonly auth: AuthEvidence;
  readonly tip: TipCheckRecord | undefined;
};

export type RoundTracking = {
  readonly roundId: string;
  /**
   * Reads a validated Snapshot; another round's, or `idle`, is ignored. The
   * flow keeps a stale one (a lower `version`, W-29) from reaching it.
   */
  readonly observe: (snapshot: ValidSnapshot) => Promise<RoundVerdict>;
  readonly verdict: () => RoundVerdict;
  /** The transcript state, once opened. */
  readonly signer: () => RoundSigner | undefined;
  /** The shell's latest validated Snapshot of the round. */
  readonly latest: () => ValidSnapshot;
  readonly evidence: () => TrackingEvidence;
  /** Why the tip check gave no decision, if it rejected. */
  readonly tipError: () => Error | undefined;
};

export const createRoundTracking = (
  options: TrackingOptions,
  round: TrackedRound,
  first: ValidSnapshot,
): RoundTracking => {
  const { session } = options;
  const { roundId } = round;
  const bytes32 = roundIdBytes32(roundId);
  if (bytes32 === undefined) throw new ShellError("invalid-input");
  const verification = createRoundVerification({
    config: options.config,
    roundId,
    request: round.request,
  });
  let latest = first;
  let signer: RoundSigner | undefined;
  let tipRun: Promise<void> | undefined;
  let tip: TipCheckRecord | undefined;
  let tipError: Error | undefined;

  // Only a page that holds the signer lock opens the transcript state: one
  // that does not signs nothing for the round (W-14).
  const open = (initial: SettledInitial): RoundSigner | undefined => {
    if (session.state() !== "signing") return undefined;
    const opened = session.openRound({ roundId, round: bytes32, initial });
    opened.observe(latest);
    return opened;
  };

  // Opens the transcript state with the settled `T_0` once the round may sign
  // (`ready`, or a required cancel), and stops it on a re-issue.
  const apply = (): RoundVerdict => {
    const verdict = verification.verdict();
    if (verdict.state === "failed" && verdict.failure === "reissued") {
      signer?.reissue();
      return verdict;
    }
    const initial =
      verdict.state === "ready" ||
      (verdict.state === "failed" && verdict.cancel)
        ? verdict.initial
        : undefined;
    if (signer === undefined && initial !== undefined) signer = open(initial);
    // A failed round signs nothing more; one that requires the cancel is
    // failed by the flow once the cancel is signed.
    if (verdict.state === "failed" && !verdict.cancel) signer?.fail();
    return verdict;
  };

  const runTip = async (snapshot: ValidSnapshot): Promise<void> => {
    try {
      const decision = await options.tipCheck(snapshot);
      tip = decision.record;
      verification.observeTip(decision);
    } catch (error) {
      // Fail closed: no decision, so the verdict stays `checking`.
      if (error instanceof Error) tipError = error;
    }
  };

  const observe = async (snapshot: ValidSnapshot): Promise<RoundVerdict> => {
    if (snapshot.status === "idle" || snapshot.roundId !== roundId) {
      return verification.verdict();
    }
    latest = snapshot;
    verification.observe(snapshot);
    apply();
    signer?.observe(snapshot);
    if (
      tipRun === undefined &&
      snapshot.proofs?.randomnessProof !== undefined &&
      verification.verdict().state !== "failed"
    ) {
      tipRun = runTip(snapshot);
    }
    if (tipRun !== undefined) await tipRun;
    return apply();
  };

  return Object.freeze({
    roundId,
    observe,
    verdict: (): RoundVerdict => verification.verdict(),
    signer: (): RoundSigner | undefined => signer,
    latest: (): ValidSnapshot => latest,
    evidence: (): TrackingEvidence =>
      Object.freeze({ auth: verification.evidence(), tip }),
    tipError: (): Error | undefined => tipError,
  });
};
