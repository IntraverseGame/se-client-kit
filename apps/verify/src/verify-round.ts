// The checks of V-12 over a round's fetched evidence, and the verdict the page
// shows (V-6 to V-8). Checks 1 to 4 live in `auth-checks.ts`, checks 5 and 7 in
// `fairness-checks.ts` (keyed on the kernel version, V-12a), and check 6 reads
// the entropy chain by a quorum (`chain-read.ts`, D-1). The page recomputes: no
// value from the API stands as a result.

import {
  checkEntropyTarget,
  checkReadyEvidence,
  checkRoundId,
  checkSignature,
} from "./auth-checks.ts";
import { checkBlock } from "./block-check.ts";
import type { ChainReadDeps, ChainReadFailure } from "./chain-read.ts";
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
  type KernelCheck,
} from "./fairness-checks.ts";
import type { Hash32 } from "./hex.ts";
import { kernelFor } from "./kernels.ts";
import { isOneStepTwoOptions, type RoundEvidence } from "./round-evidence.ts";

/** What the page concludes from its own checks. */
export type Verdict =
  /** Every applicable check passed (V-6). */
  | { readonly kind: "matches" }
  /** At least one check failed; the page names each (V-7). */
  | { readonly kind: "mismatch"; readonly failed: readonly CheckId[] }
  /** Only check 6 failed: the chain could not be read well enough (V-7). */
  | { readonly kind: "chain-unverified" }
  /** The round cannot be recomputed (V-8). */
  | {
      readonly kind: "not-recomputable";
      readonly reason: "not-ended" | "unknown-kernel" | "unsupported-shape";
    };

export type RoundReport = {
  readonly roundId: string;
  readonly evidence: RoundEvidence;
  readonly checks: readonly CheckResult[];
  readonly verdict: Verdict;
};

const fromKernel = (id: CheckId, check: KernelCheck): CheckResult => {
  if (check.kind === "not-recomputable") {
    return notChecked(
      id,
      `Kernel version ${check.kernelVersion} is not implemented.`,
    );
  }
  if (check.kind === "refused") {
    return settled(
      id,
      [
        {
          name: check.name,
          recomputed: undefined,
          evidence: undefined,
          matches: false,
        },
      ],
      {
        note: `A value was refused (${check.error}).`,
      },
    );
  }
  return settled(id, check.comparisons, {
    details: Object.entries(check.values).map(([label, value]) => ({
      label,
      value,
    })),
  });
};

const ENDED: ReadonlySet<string> = new Set(["won", "lost", "canceled"]);

/** Checks 5 and 7 need the reveals; what a round carries decides how. */
const revealsOf = (evidence: RoundEvidence) => {
  const roundSecret = evidence.randomnessProof.roundSecret as
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
  if (roundSecret === undefined || seed === undefined) {
    return [missingReveals(5), missingReveals(7)];
  }
  const commitments = fromKernel(
    5,
    await checkCommitments(version, {
      roundSecretHash: evidence.randomnessProof.roundSecretHash as Hash32,
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

/**
 * For a round that has not ended (V-8), a check that failed only because the
 * evidence does not carry a value yet (e.g. `readyHash` before the round is
 * ready) waits for the round's end: it is not checked, not a mismatch. A check
 * whose evidence is present and differs stays a mismatch.
 */
const WAITS = "It waits for the round's end.";
// A-2 (specs/verify-page.md, decided 2026-10-20): only these chain-read
// failures can mean block N does not exist yet; any other still surfaces.
const CHAIN_FAILURES_THAT_WAIT: ReadonlySet<ChainReadFailure> = new Set([
  "too-few",
  "no-block",
]);
// ASSUMPTION A-2 (specs/verify-page.md): a round that has not ended waits for
// evidence it does not carry yet, rather than failing on it.
const waitsForEnd = (check: CheckResult): CheckResult => {
  if (
    check.status === "mismatch" &&
    check.comparisons.every(c => c.matches || c.evidence === undefined)
  ) {
    return notChecked(check.id, WAITS);
  }
  // Block N may not exist yet while the round runs: such a chain read waits too.
  if (
    check.status === "unverified" &&
    check.chainFailure !== undefined &&
    CHAIN_FAILURES_THAT_WAIT.has(check.chainFailure)
  ) {
    return {
      ...notChecked(check.id, `${check.note ?? ""} ${WAITS}`.trim()),
      details: check.details,
    };
  }
  return check;
};

/** The verdict from the checks (exported for its unit tests). */
export const verdictOf = (
  evidence: RoundEvidence,
  checks: readonly CheckResult[],
): Verdict => {
  const failed = checks.filter(c => c.status === "mismatch").map(c => c.id);
  const unverified = checks
    .filter(c => c.status === "unverified")
    .map(c => c.id);
  if (failed.length > 0) {
    return {
      kind: "mismatch",
      failed: [...failed, ...unverified].toSorted((a, b) => a - b),
    };
  }
  if (unverified.length > 0) return { kind: "chain-unverified" };
  if (!isOneStepTwoOptions(evidence)) {
    // A-3 (specs/verify-page.md, decided 2026-10-20): a round that is not a
    // one-step, two-option config round is a third V-8 reason, with no retry.
    return { kind: "not-recomputable", reason: "unsupported-shape" };
  }
  if (kernelFor(evidence.kernelVersion) === undefined) {
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
 * ended, and are otherwise shown as not checked, with the reason.
 */
export const verifyRound = async (
  deps: ChainReadDeps,
  config: VerifyConfig,
  evidence: RoundEvidence,
  asked: string,
): Promise<RoundReport> => {
  const signature = checkSignature(evidence, config);
  const block = await checkBlock(deps, config, evidence);
  const runnable =
    isOneStepTwoOptions(evidence) &&
    kernelFor(evidence.kernelVersion) !== undefined &&
    ENDED.has(evidence.status);
  const [commitments, outcome] = runnable
    ? await recomputeFairness(evidence, block.agreed)
    : [
        notChecked(5, "It cannot be recomputed for this round."),
        notChecked(7, "It cannot be recomputed for this round."),
      ];
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
