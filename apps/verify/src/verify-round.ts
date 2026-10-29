// The checks of V-12 over a round's fetched evidence, and the verdict the page
// shows (V-6 to V-8). Checks 1 to 4 live in `auth-checks.ts`, checks 5 and 7 in
// `fairness-checks.ts` (keyed on the kernel version, V-12a), and check 6 reads
// the entropy chain by a quorum (`chain-read.ts`, D-1). A book round has
// checks of its own (`book-checks.ts`, V-19). The page recomputes: no value
// from the API stands as a result.

import {
  checkEntropyTarget,
  checkReadyEvidence,
  checkRoundId,
  checkSignature,
} from "./auth-checks.ts";
import { checkBlock } from "./block-check.ts";
import { verifyBookRound } from "./book-checks.ts";
import { type ChainReadDeps, throwIfAborted } from "./chain-read.ts";
import {
  type CheckId,
  type CheckResult,
  compare,
  notChecked,
  settled,
} from "./check-result.ts";
import type { VerifyConfig } from "./environment-config.ts";
import {
  checkCommitments,
  checkSeedAndOutcome,
  type EndedStatus,
} from "./fairness-checks.ts";
import type { Hash32 } from "./hex.ts";
import { isOneStepTwoOptions, type RoundEvidence } from "./round-evidence.ts";
import {
  ENDED,
  failureVerdict,
  fromKernel,
  isKnownKernel,
  type RoundReport,
  type Verdict,
  waitsForEnd,
} from "./round-report.ts";

/** Checks 5 and 7 need the reveals; what a round carries decides how. */
const revealsOf = (evidence: RoundEvidence) => {
  const roundSecret = evidence.randomnessProof?.roundSecret as
    | Hash32
    | undefined;
  const seed = evidence.fairnessProof?.seed as Hash32 | undefined;
  return { roundSecret, seed };
};

const missingReveals = (id: CheckId): CheckResult =>
  settled(
    id,
    [
      compare("randomnessProof.roundSecret", "revealed"),
      compare("fairnessProof.seed", "revealed"),
    ],
    { note: "A reveal is missing." },
  );

const recomputeFairness = async (
  evidence: RoundEvidence,
  agreed: Hash32 | undefined,
): Promise<[CheckResult, CheckResult]> => {
  const { roundSecret, seed } = revealsOf(evidence);
  const proof = evidence.randomnessProof;
  const version = evidence.kernelVersion;
  const status = evidence.status as EndedStatus;
  if (
    status === "canceled" &&
    roundSecret === undefined &&
    seed === undefined
  ) {
    const note = "A canceled round is not guaranteed to carry its reveals.";
    return [notChecked(5, note), notChecked(7, note)];
  }
  if (proof === undefined || roundSecret === undefined || seed === undefined) {
    return [missingReveals(5), missingReveals(7)];
  }
  const commitments = fromKernel(
    5,
    await checkCommitments(version, {
      roundSecretHash: proof.roundSecretHash as Hash32,
      roundSecret,
      seedHash: (evidence.fairnessProof?.seedHash ?? "0x") as Hash32,
      seed,
    }),
  );
  if (agreed === undefined) {
    return [commitments, notChecked(7, "It needs block N's hash (check 6).")];
  }
  const [step] = evidence.steps;
  const outcome = fromKernel(
    7,
    await checkSeedAndOutcome(version, {
      blockValue: agreed,
      roundSecret,
      seed,
      status,
      selectedIndex: step?.selectedIndex,
      losingIndex: step?.losingIndex,
    }),
  );
  return [commitments, outcome];
};

/** The verdict from the checks (exported for its unit tests). */
export const verdictOf = (
  evidence: RoundEvidence,
  checks: readonly CheckResult[],
): Verdict => {
  const failure = failureVerdict(checks);
  if (failure !== undefined) return failure;
  if (evidence.closure !== undefined) {
    // A-5 (b): a voided or refused round will never be played, so it is not
    // "not ended" (no "check again").
    return { kind: "not-recomputable", reason: evidence.closure };
  }
  if (!isOneStepTwoOptions(evidence)) {
    // A-3 (specs/verify-page.md, decided 2026-10-20): a round that is not a
    // one-step, two-option config round is its own V-8 reason, with no retry.
    return { kind: "not-recomputable", reason: "unsupported-shape" };
  }
  if (!isKnownKernel(evidence.kernelVersion)) {
    return { kind: "not-recomputable", reason: "unknown-kernel" };
  }
  return ENDED.has(evidence.status)
    ? { kind: "matches" }
    : { kind: "not-recomputable", reason: "not-ended" };
};

/**
 * Runs the checks of V-12 that apply to `evidence`, asked for as `asked`.
 * Checks 1 to 4 and 6 do not depend on the kernel version; 5 and 7 run only for
 * a one-step, two-option round of a kernel version the page implements that has
 * ended, and are otherwise shown as not checked, with the reason. When `signal`
 * aborts, the chain requests in flight end and the run rejects with an
 * `AbortError`: an aborted run has no report, not a failed check.
 */
export const verifyRound = async (
  deps: ChainReadDeps,
  config: VerifyConfig,
  evidence: RoundEvidence,
  asked: string,
  signal?: AbortSignal,
): Promise<RoundReport> => {
  // V-18: a body that carries `book` is a book round, with checks of its own.
  if (evidence.book !== undefined) {
    return verifyBookRound(
      deps,
      config,
      evidence,
      evidence.book,
      asked,
      signal,
    );
  }
  const signature = checkSignature(evidence, config);
  const block = await checkBlock(deps, config, evidence, signal);
  const runnable =
    isOneStepTwoOptions(evidence) &&
    isKnownKernel(evidence.kernelVersion) &&
    ENDED.has(evidence.status);
  const [commitments, outcome] = runnable
    ? await recomputeFairness(evidence, block.agreed)
    : [
        notChecked(5, "It cannot be recomputed for this round."),
        notChecked(7, "It cannot be recomputed for this round."),
      ];
  // An abort that landed during the recompute is no report either.
  throwIfAborted(signal);
  const all = [
    checkRoundId(evidence, asked),
    checkEntropyTarget(evidence, config),
    signature.result,
    checkReadyEvidence(evidence, signature.created),
    commitments,
    block.result,
    outcome,
  ];
  const checks = ENDED.has(evidence.status)
    ? all
    : all.map(check => waitsForEnd(check));
  return {
    roundId: asked,
    evidence,
    checks,
    verdict: verdictOf(evidence, checks),
  };
};
