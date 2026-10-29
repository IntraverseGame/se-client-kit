// The checks of a book round (specs/verify-page.md, V-18 to V-20), numbered as
// a config round's (V-12): 1 (the round id), 5 (the round secret's commitment),
// 6 (block N, by the quorum read), and 7 (the seed) are recomputed; 2 to 4 do
// not apply (a book round has no signed creation authorization and no ready
// evidence); 8 (the draw) is not checked, since the kit has no public kernel
// vector for the weighted draw and the verify API does not carry the mode's
// table. The API's recorded row and its own redraw are compared with each
// other only: a disagreement fails check 8, an agreement leaves it not checked.
// Nothing here establishes a book round's result: an ended one is V-8's book
// reason (V-20).

import { checkBlock } from "./block-check.ts";
import { checkBookCommitments, checkSeed } from "./book-fairness.ts";
import { type ChainReadDeps, throwIfAborted } from "./chain-read.ts";
import {
  type CheckResult,
  compare,
  notApplicable,
  notChecked,
  settled,
} from "./check-result.ts";
import type { VerifyConfig } from "./environment-config.ts";
import type { Comparison } from "./fairness-checks.ts";
import type { Hash32 } from "./hex.ts";
import type {
  BookEvidence,
  DrawnRowEvidence,
  RoundEvidence,
} from "./round-evidence.ts";
import {
  ENDED,
  failureVerdict,
  fromKernel,
  isKnownKernel,
  type RoundReport,
  type Verdict,
  waitsForEnd,
} from "./round-report.ts";

const NO_AUTH =
  "A book round has no signed creation authorization in the verify API's document, so nothing signed binds its commitment and block N before block N existed (shown under what this page does not check).";

/** Why check 8 is not checked (V-19). */
export const DRAW_NOT_CHECKED =
  "The kit has no public kernel vector for the weighted draw, and the verify API does not carry the mode's table, so this page cannot redraw the row.";

const DRAW_AGREES =
  "The verify API's recorded and redrawn rows agree (not recomputed by this page).";

const SEED_TITLE = "Seed";

/** Check 1: the body's round id is the one asked for; no `newRound` half. */
const checkBookRoundId = (
  evidence: RoundEvidence,
  asked: string,
): CheckResult =>
  settled(1, [compare("roundId", asked, evidence.roundId)], {
    note: "A book round has no newRound: its bytes32 half does not apply.",
  });

/**
 * Check 6 with `entropy.chainId`, when the body carries it, compared with the
 * chain id the configuration pins for the source (V-19). A source the
 * configuration does not list has already failed the read (`config`).
 */
const withEntropyChainId = (
  result: CheckResult,
  config: VerifyConfig,
  evidence: RoundEvidence,
  book: BookEvidence,
): CheckResult => {
  const source = evidence.randomnessProof?.source;
  if (book.entropyChainId === undefined || source === undefined) return result;
  const pinned = Object.hasOwn(config.sources, source)
    ? config.sources[source]
    : undefined;
  if (pinned === undefined) return result;
  const chain = compare(
    "entropy.chainId",
    String(pinned.chainId),
    String(book.entropyChainId),
  );
  const comparisons = [chain, ...result.comparisons];
  if (chain.matches) return { ...result, comparisons };
  return {
    ...result,
    status: "mismatch",
    comparisons,
    chainFailure: undefined,
  };
};

/** A value a check needs, compared as present or absent. */
const presence = (name: string, value: string | undefined): Comparison =>
  compare(name, "present", value === undefined ? undefined : "present");

const missing = (
  id: 5 | 7,
  comparisons: readonly Comparison[],
): CheckResult | undefined =>
  comparisons.every(c => c.matches)
    ? undefined
    : settled(id, comparisons, { note: "A value it needs is missing." });

/** Checks 5 and 7 of an ended book round, under its kernel version. */
const recomputeBook = async (
  evidence: RoundEvidence,
  book: BookEvidence,
  agreed: Hash32 | undefined,
): Promise<[CheckResult, CheckResult]> => {
  const proof = evidence.randomnessProof;
  const roundSecret = proof?.roundSecret as Hash32 | undefined;
  const seed = book.seed as Hash32 | undefined;
  if (
    evidence.status === "canceled" &&
    roundSecret === undefined &&
    seed === undefined
  ) {
    const note = "A canceled round is not guaranteed to carry its reveals.";
    return [notChecked(5, note), { ...notChecked(7, note), title: SEED_TITLE }];
  }
  const version = evidence.kernelVersion;
  // The seed's commitment applies only when the body carries a `seedHash`.
  const seedHash = evidence.fairnessProof?.seedHash as Hash32 | undefined;
  const commitments =
    missing(5, [
      presence("randomnessProof.roundSecretHash", proof?.roundSecretHash),
      presence("reveal.roundSecret", roundSecret),
      ...(seedHash === undefined ? [] : [presence("reveal.seed", seed)]),
    ]) ??
    fromKernel(
      5,
      await checkBookCommitments(version, {
        roundSecretHash: proof?.roundSecretHash as Hash32,
        roundSecret: roundSecret as Hash32,
        ...(seedHash === undefined || seed === undefined
          ? {}
          : { seedCommitment: { seedHash, seed } }),
      }),
    );
  const seedCheck =
    missing(7, [
      presence("reveal.roundSecret", roundSecret),
      presence("reveal.seed", seed),
    ]) ??
    (agreed === undefined
      ? notChecked(7, "It needs block N's hash (check 6).")
      : fromKernel(
          7,
          await checkSeed(version, {
            blockValue: agreed,
            roundSecret: roundSecret as Hash32,
            seed: seed as Hash32,
          }),
        ));
  return [commitments, { ...seedCheck, title: SEED_TITLE }];
};

const API_LABELS = {
  recomputed: "recomputed.draw (the verify API's redraw)",
  evidence: "book.drawn (the verify API's record)",
} as const;

const rowComparison = (
  name: string,
  redrawn: bigint,
  recorded: bigint,
): Comparison => ({
  name,
  recomputed: redrawn.toString(),
  evidence: recorded.toString(),
  matches: redrawn === recorded,
  labels: API_LABELS,
});

/**
 * Check 8, the draw (V-19): not checked, with its reason. A `canceled` round
 * drew no row, so it does not apply. When the body carries both `book.drawn`
 * and `recomputed.draw`, the two are the API's own values: their disagreement
 * fails the check, naming both rows; their agreement leaves it not checked.
 */
export const checkDraw = (
  status: RoundEvidence["status"],
  drawn: DrawnRowEvidence | undefined,
  redrawn?: DrawnRowEvidence,
): CheckResult => {
  if (status === "canceled") {
    return notApplicable(8, "No row was drawn: the round was canceled.");
  }
  if (drawn === undefined || redrawn === undefined) {
    return notChecked(8, DRAW_NOT_CHECKED);
  }
  const comparisons = [
    rowComparison("drawn row index", redrawn.index, drawn.index),
    rowComparison(
      "drawn row multiplierMilli",
      BigInt(redrawn.multiplierMilli),
      BigInt(drawn.multiplierMilli),
    ),
  ];
  return comparisons.every(c => c.matches)
    ? notChecked(8, `${DRAW_NOT_CHECKED} ${DRAW_AGREES}`)
    : settled(8, comparisons, {
        note: "The verify API's recorded row and its own redraw differ.",
      });
};

/**
 * The verdict of a book round (V-20): a failed check first (V-7); then voided
 * or refused, an unknown kernel version, and a round that has not ended, as for
 * a config round (V-8); then `canceled` matches (V-6), and an ended `won` or
 * `lost` round is V-8's book reason: its draw was not recomputed.
 */
export const bookVerdictOf = (
  evidence: RoundEvidence,
  checks: readonly CheckResult[],
): Verdict => {
  const failure = failureVerdict(checks);
  if (failure !== undefined) return failure;
  if (evidence.closure !== undefined) {
    return { kind: "not-recomputable", reason: evidence.closure };
  }
  if (!isKnownKernel(evidence.kernelVersion)) {
    return { kind: "not-recomputable", reason: "unknown-kernel" };
  }
  if (!ENDED.has(evidence.status)) {
    return { kind: "not-recomputable", reason: "not-ended" };
  }
  return evidence.status === "canceled"
    ? { kind: "matches" }
    : { kind: "not-recomputable", reason: "book-draw" };
};

/**
 * Runs a book round's checks (V-19) over `evidence`, asked for as `asked`.
 * Checks 5 and 7 run only for an ended round of a kernel version the page
 * implements. When `signal` aborts, the chain requests in flight end and the
 * run rejects with an `AbortError`: an aborted run has no report.
 */
export const verifyBookRound = async (
  deps: ChainReadDeps,
  config: VerifyConfig,
  evidence: RoundEvidence,
  book: BookEvidence,
  asked: string,
  signal?: AbortSignal,
): Promise<RoundReport> => {
  const block = await checkBlock(deps, config, evidence, signal);
  const runnable =
    isKnownKernel(evidence.kernelVersion) && ENDED.has(evidence.status);
  const unrun = "It cannot be recomputed for this round.";
  const [commitments, seed] = runnable
    ? await recomputeBook(evidence, book, block.agreed)
    : [notChecked(5, unrun), { ...notChecked(7, unrun), title: SEED_TITLE }];
  // An abort that landed during the recompute is no report either.
  throwIfAborted(signal);
  const all = [
    checkBookRoundId(evidence, asked),
    notApplicable(2, NO_AUTH),
    notApplicable(3, NO_AUTH),
    notApplicable(
      4,
      "A book round has no ready evidence (readyHash) in the verify API's document.",
    ),
    commitments,
    withEntropyChainId(block.result, config, evidence, book),
    seed,
    checkDraw(evidence.status, book.drawn, book.apiDraw),
  ];
  const checks = ENDED.has(evidence.status)
    ? all
    : all.map(check => waitsForEnd(check));
  return {
    roundId: asked,
    evidence,
    checks,
    verdict: bookVerdictOf(evidence, checks),
  };
};
