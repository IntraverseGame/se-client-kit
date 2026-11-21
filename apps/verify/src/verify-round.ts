// The checks of V-12 over a round's fetched evidence, and the verdict the page
// shows (V-6 to V-8). Checks 1 to 4 live in `auth-checks.ts`, checks 5 and 7 in
// `fairness-run.ts` (keyed on the kernel version, V-12a), and check 6 reads
// the entropy chain by a quorum (`chain-read.ts`, D-1). A book round has
// checks of its own (`book-checks.ts`, V-19); a round started with a key
// delegation has check 9 (`key-delegation-check.ts`, V-22). The page
// recomputes: no value from the API stands as a result.

import {
  checkEntropyTarget,
  checkReadyEvidence,
  checkRoundId,
  checkSignature,
} from "./auth-checks.ts";
import { checkBlock } from "./block-check.ts";
import { verifyBookRound } from "./book-checks.ts";
import { type ChainReadDeps, throwIfAborted } from "./chain-read.ts";
import { type CheckResult, notChecked } from "./check-result.ts";
import type { VerifyConfig } from "./environment-config.ts";
import { recomputeFairness } from "./fairness-run.ts";
import { checkKeyDelegation } from "./key-delegation-check.ts";
import { isOneStepTwoOptions, type RoundEvidence } from "./round-evidence.ts";
import {
  ENDED,
  failureVerdict,
  isKnownKernel,
  type RoundReport,
  type Verdict,
  waitsForEnd,
} from "./round-report.ts";

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
  const ended = ENDED.has(evidence.status);
  const delegation = evidence.keyDelegation;
  // Check 9 (V-22) is fixed at the start: it does not wait for the round's end.
  const checks = [
    ...(ended ? all : all.map(check => waitsForEnd(check))),
    ...(delegation === undefined
      ? []
      : [
          checkKeyDelegation(
            delegation,
            evidence.createRoundAuth?.newRound,
            ended,
          ),
        ]),
  ];
  return {
    roundId: asked,
    evidence,
    checks,
    verdict: verdictOf(evidence, checks),
  };
};
