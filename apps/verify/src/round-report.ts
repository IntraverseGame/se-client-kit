// What the page concludes about a round (V-6 to V-8), and the parts a config
// round's checks (`verify-round.ts`) and a book round's (`book-checks.ts`)
// share: a kernel check as a check result, the ended statuses, the wait of a
// round that has not ended (A-2), and the verdict of failed checks.

import type { ChainReadFailure } from "./chain-read.ts";
import {
  type CheckId,
  type CheckResult,
  notChecked,
  settled,
} from "./check-result.ts";
import type { KernelCheck } from "./fairness-checks.ts";
import { kernelFor } from "./kernels.ts";
import type { RoundEvidence } from "./round-evidence.ts";

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
      readonly reason:
        | "not-ended"
        | "unknown-kernel"
        | "unsupported-shape"
        | "voided"
        | "refused"
        /** An ended book round: its draw (check 8) was not recomputed (V-20). */
        | "book-draw";
    };

export type RoundReport = {
  readonly roundId: string;
  readonly evidence: RoundEvidence;
  readonly checks: readonly CheckResult[];
  readonly verdict: Verdict;
};

/** Whether the page implements kernel version `version` (V-12a). */
export const isKnownKernel = (version: number): boolean =>
  kernelFor(version) !== undefined;

/** The statuses of a round that has ended. */
export const ENDED: ReadonlySet<string> = new Set(["won", "lost", "canceled"]);

/** A kernel check (checks 5 and 7) as the result the page shows. */
export const fromKernel = (id: CheckId, check: KernelCheck): CheckResult => {
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
export const waitsForEnd = (check: CheckResult): CheckResult => {
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

/**
 * The verdict of failed checks, before any other (V-7): every failed check,
 * with check 6 when it could not be verified too; check 6 alone is V-7's chain
 * wording. `undefined` when no check failed.
 */
export const failureVerdict = (
  checks: readonly CheckResult[],
): Verdict | undefined => {
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
  return unverified.length > 0 ? { kind: "chain-unverified" } : undefined;
};
