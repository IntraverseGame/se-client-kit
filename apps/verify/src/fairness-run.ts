// Checks 5 and 7 of a config round (V-12): the reveals a round carries decide
// how they run, and the kernel's derivations (`fairness-checks.ts`, keyed on
// the kernel version, V-12a) recompute them. `verify-round.ts` runs them.

import {
  type CheckId,
  type CheckResult,
  compare,
  notChecked,
  settled,
} from "./check-result.ts";
import {
  checkCommitments,
  checkSeedAndOutcome,
  type EndedStatus,
} from "./fairness-checks.ts";
import type { Hash32 } from "./hex.ts";
import type { RoundEvidence } from "./round-evidence.ts";
import { fromKernel } from "./round-report.ts";

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

/**
 * Checks 5 and 7 of an ended one-step, two-option round of a known kernel
 * version, with block N's agreed hash (`undefined` when check 6 has none).
 */
export const recomputeFairness = async (
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
      bet: evidence.bet,
      payoutTerms: evidence.payoutTerms,
      payout: evidence.payout?.formatted,
    }),
  );
  return [commitments, outcome];
};
