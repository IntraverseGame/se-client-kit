// What a check of the page returns, for the page to show (V-6 to V-8, V-13):
// every comparison with the two values compared, and a status that never
// stands in for a result the page did not establish.

import type { ChainReadFailure } from "./chain-read.ts";
import type { Comparison } from "./fairness-checks.ts";

/** The seven checks of V-12, by their number. */
export type CheckId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type CheckStatus =
  /** Every comparison matches. */
  | "matches"
  /** At least one comparison does not match, or an input is absent or refused. */
  | "mismatch"
  /** Check 6 only: the chain could not be read well enough to say (V-7). */
  | "unverified"
  /** The check did not run, with the reason in `note` (V-13). */
  | "not-checked";

/** A labelled value, e.g. `created`, or what one RPC endpoint answered. */
export type Detail = { readonly label: string; readonly value: string };

export type CheckResult = {
  readonly id: CheckId;
  /** A short name, e.g. "Block N". */
  readonly title: string;
  readonly status: CheckStatus;
  readonly comparisons: readonly Comparison[];
  /** Plain English, as text: why the status is what it is, when it needs words. */
  readonly note?: string | undefined;
  /** Labelled values the check recomputed or read, shown as text. */
  readonly details?: readonly Detail[] | undefined;
  /** Check 6 only: W-26a's "chain check not independent (development)". */
  readonly degraded?: boolean | undefined;
  /** Check 6 only, when `unverified`: why the chain read failed. */
  readonly chainFailure?: ChainReadFailure | undefined;
};

export const CHECK_TITLES: Readonly<Record<CheckId, string>> = {
  1: "Round id",
  2: "Entropy target",
  3: "The backend's signature",
  4: "Ready evidence",
  5: "Commitment and reveal",
  6: "Block N",
  7: "Seed and outcome",
};

export const compare = (
  name: string,
  recomputed: string | undefined,
  evidence?: string,
): Comparison => ({
  name,
  recomputed,
  evidence,
  matches: recomputed !== undefined && recomputed === evidence,
});

/** A result whose status follows its comparisons. */
export const settled = (
  id: CheckId,
  comparisons: readonly Comparison[],
  extra: Pick<CheckResult, "note" | "details" | "degraded"> = {},
): CheckResult => ({
  id,
  title: CHECK_TITLES[id],
  status: comparisons.every(c => c.matches) ? "matches" : "mismatch",
  comparisons,
  ...extra,
});

export const notChecked = (id: CheckId, note: string): CheckResult => ({
  id,
  title: CHECK_TITLES[id],
  status: "not-checked",
  comparisons: [],
  note,
});
