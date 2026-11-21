// Test-only: check 9 (V-22) over the vendored `coinflip-active-key-delegation`
// vector's delegation, read from a body as the page reads it, with one change
// at a time; and the names of the comparisons that did not match.

import type { KeyDelegationNotice } from "@intraverse/se-client-signing";

import type { CheckResult } from "../check-result.ts";
import {
  checkKeyDelegation,
  publishedNotices,
} from "../key-delegation-check.ts";
import type {
  KeyDelegationEvidence,
  NewRoundEvidence,
} from "../round-evidence.ts";
import { parseEvidence } from "../verify-body.ts";
import { delegatedBody } from "./verify-body.ts";

/** The vector's delegation and the round's `newRound`, as the page reads them. */
export const read = (): {
  d: KeyDelegationEvidence;
  round: NewRoundEvidence;
} => {
  const evidence = parseEvidence(delegatedBody());
  const d = evidence?.keyDelegation;
  const round = evidence?.createRoundAuth?.newRound;
  if (d === undefined || round === undefined) throw new TypeError("no body");
  return { d, round };
};

/** Check 9 of the vector's delegation with `change` applied. */
export const run = (
  change: Partial<KeyDelegationEvidence> = {},
  options: {
    readonly newRound?: NewRoundEvidence | undefined;
    readonly ended?: boolean;
    readonly notices?: readonly KeyDelegationNotice[];
  } = {},
): CheckResult => {
  const { d, round } = read();
  return checkKeyDelegation(
    { ...d, ...change },
    "newRound" in options ? options.newRound : round,
    options.ended ?? true,
    options.notices ?? publishedNotices(),
  );
};

/** The names of the comparisons that did not match. */
export const failing = (result: CheckResult): readonly string[] =>
  result.comparisons.filter(c => !c.matches).map(c => c.name);
