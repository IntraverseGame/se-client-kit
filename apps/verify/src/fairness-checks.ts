// Checks 5 (commitment and reveal) and 7 (seed and outcome) of a Coin Flip
// config round (specs/verify-page.md, V-12), keyed on the round's kernel
// version (V-12a). The evidence is named by its Snapshot fields until the
// verify API document is published. Each check recomputes from the evidence's
// raw bytes and compares the result with what the evidence carries; it never
// takes a value as given.

import { bytesFromHash, type Hash32, hashFromBytes } from "./hex.ts";
import { KernelError, type KernelErrorCode } from "./kernel-error.ts";
import { type Kernel, kernelFor } from "./kernels.ts";
import { payoutOf } from "./outcome-payout.ts";
import type { BetEvidence, PayoutTermsEvidence } from "./round-evidence.ts";
import { formatAmount } from "./verify-amount.ts";

/** One value the page recomputed, beside the one the evidence carries. */
export type Comparison = {
  /** The evidence field compared: `roundSecretHash`, `seed`, `status`, ... */
  readonly name: string;
  /** The page's value, or `undefined` when the evidence lacks an input. */
  readonly recomputed: string | undefined;
  /** The evidence's value, or `undefined` when it carries none. */
  readonly evidence: string | undefined;
  readonly matches: boolean;
  /**
   * How the two values are labelled, when the default ("recomputed" and
   * "evidence") would misstate them: check 8 compares two of the API's values
   * and recomputes neither.
   */
  readonly labels?:
    | { readonly recomputed: string; readonly evidence: string }
    | undefined;
};

export type KernelCheck =
  /** The round's kernel version is not one this page implements (V-8). */
  | { readonly kind: "not-recomputable"; readonly kernelVersion: number }
  /**
   * An evidence value the kernel cannot take: not `0x` lowercase hex
   * (`not-hex`), or a kernel input error. A mismatch, never a result.
   */
  | {
      readonly kind: "refused";
      readonly name: string;
      readonly error: KernelErrorCode | "not-hex";
    }
  /** Recomputed: `matches` only when every comparison matches. */
  | {
      readonly kind: "recomputed";
      readonly matches: boolean;
      readonly comparisons: readonly Comparison[];
      /** Every value the check recomputed, by name, compared or only shown. */
      readonly values: Readonly<Record<string, string>>;
    };

/** The round's statuses once it has ended. */
export type EndedStatus = "won" | "lost" | "canceled";

/** Check 5's evidence, with both reveals. */
export type CommitmentEvidence = {
  /** `randomnessProof.roundSecretHash`, the signed commitment. */
  readonly roundSecretHash: Hash32;
  /** `randomnessProof.roundSecret`, the reveal. */
  readonly roundSecret: Hash32;
  /** `fairnessProof.seedHash`, the commitment. */
  readonly seedHash: Hash32;
  /** `fairnessProof.seed`, the reveal. */
  readonly seed: Hash32;
};

/** Check 7's evidence, with both reveals. */
export type OutcomeEvidence = {
  /**
   * Block N's hash: the one check 6 agreed on, or, until the quorum read is
   * built, `randomnessProof.blockValue`.
   */
  readonly blockValue: Hash32;
  /** `randomnessProof.roundSecret`. */
  readonly roundSecret: Hash32;
  /** `fairnessProof.seed`, the revealed seed. */
  readonly seed: Hash32;
  readonly status: EndedStatus;
  /** `config.steps[0].selectedIndex`, the player's pick. */
  readonly selectedIndex?: number | undefined;
  /** `config.steps[0].losingIndex`. */
  readonly losingIndex?: number | undefined;
  /** `bet`, for the payout of a `won` or `lost` round. */
  readonly bet?: BetEvidence | undefined;
  /** `game.terms`' house edge and multiplier cap, for the payout. */
  readonly payoutTerms?: PayoutTermsEvidence | undefined;
  /** `payout`'s amount as the page writes it (V-6), when the body has one. */
  readonly payout?: string | undefined;
};

/** The shape the page recomputes: one step, two options, one of which loses. */
const ONE_STEP_TWO_OPTIONS = [{ n: 2, k: 1 }] as const;

/** The evidence field behind each kernel input error. */
const FIELD_OF: Readonly<Record<KernelErrorCode, string>> = {
  "block-value-length": "blockValue",
  "secret-length": "roundSecret",
  "seed-length": "seed",
  "n-out-of-range": "steps",
  "k-out-of-range": "steps",
  // StepsDerive draws with the fixed label "steps-v1" and m = n - t, so only a
  // step could cause these, and its own checks come first.
  "label-invalid": "steps",
  "m-out-of-range": "steps",
  "house-edge-out-of-range": "houseEdgeWad",
  "max-multiplier-out-of-range": "maxMultiplierMilli",
  "bet-out-of-range": "bet",
  "payout-too-large": "payout",
};

class NotHex extends Error {
  public readonly field: string;

  public constructor(field: string) {
    super("an evidence value is not 0x-prefixed lowercase hex");
    this.name = "NotHex";
    this.field = field;
  }
}

/** The bytes of an evidence value; throws `NotHex` for anything else. */
export const decode = (field: string, value: string): Uint8Array => {
  const bytes = bytesFromHash(value);
  if (bytes === undefined) throw new NotHex(field);
  return bytes;
};

export const compare = (
  name: string,
  recomputed: string | undefined,
  evidence: string | undefined,
): Comparison => ({
  name,
  recomputed,
  evidence,
  matches: recomputed !== undefined && recomputed === evidence,
});

export type Derived = {
  readonly comparisons: readonly Comparison[];
  readonly values: Readonly<Record<string, string>>;
};

/**
 * Runs `derive` under the kernel of `kernelVersion`: "not recomputable" for a
 * version the page does not implement, "refused" for a value the kernel cannot
 * take.
 */
export const recompute = async (
  kernelVersion: number,
  derive: (kernel: Kernel) => Promise<Derived>,
): Promise<KernelCheck> => {
  const kernel = kernelFor(kernelVersion);
  if (kernel === undefined) return { kind: "not-recomputable", kernelVersion };
  try {
    const { comparisons, values } = await derive(kernel);
    return {
      kind: "recomputed",
      matches: comparisons.every(comparison => comparison.matches),
      comparisons,
      values,
    };
  } catch (error) {
    if (error instanceof NotHex) {
      return { kind: "refused", name: error.field, error: "not-hex" };
    }
    if (error instanceof KernelError) {
      return { kind: "refused", name: FIELD_OF[error.code], error: error.code };
    }
    throw error;
  }
};

/**
 * Check 5: each commitment is the SHA-256 of its reveal's raw 32 bytes,
 * `roundSecretHash = SHA-256(roundSecret)` and `seedHash = SHA-256(seed)`.
 */
export const checkCommitments = (
  kernelVersion: number,
  evidence: CommitmentEvidence,
): Promise<KernelCheck> =>
  recompute(kernelVersion, async kernel => {
    const secret = decode("roundSecret", evidence.roundSecret);
    const seed = decode("seed", evidence.seed);
    const values = {
      roundSecretHash: hashFromBytes(await kernel.roundSecretHash(secret)),
      seedHash: hashFromBytes(await kernel.seedHash(seed)),
    };
    return {
      comparisons: [
        compare(
          "roundSecretHash",
          values.roundSecretHash,
          evidence.roundSecretHash,
        ),
        compare("seedHash", values.seedHash, evidence.seedHash),
      ],
      values,
    };
  });

/**
 * The status a pick gives against the losing index, or `undefined` when there
 * is no pick or it is not a whole number in [0, n): such a pick fails the
 * status comparison (decided by the human, 2026-10-19).
 */
const outcomeOf = (
  selectedIndex: number | undefined,
  losingIndex: number,
  n: number,
): EndedStatus | undefined => {
  if (
    selectedIndex === undefined ||
    !Number.isSafeInteger(selectedIndex) ||
    selectedIndex < 0 ||
    selectedIndex >= n
  ) {
    return undefined;
  }
  return selectedIndex === losingIndex ? "lost" : "won";
};

const text = (value: number | undefined): string | undefined =>
  value === undefined ? undefined : String(value);

/**
 * Check 7: the seed is Seed(blockValue, roundSecret) and equals the revealed
 * seed; Coin Flip's losing index is StepsDerive(seed, [(2, 1)])[0][0] and
 * equals `config.steps[0].losingIndex`; and the round is `won` when the pick is
 * not that index, `lost` when it is, which equals its status (a pick that is
 * not a whole number in [0, 2) fails that comparison). A `canceled` round has
 * no status to compare with: its seed and losing index are recomputed and
 * shown, and the losing index is compared only when the evidence carries one.
 * For `won` and `lost`, the payout follows from the recomputed outcome: 0 when
 * the pick loses, Coin Flip's schedule over `game.terms` and the bet when it
 * survives, written in the bet's decimals and currency and compared with the
 * body's `payout` (decided by the human, 2026-10-29, OQ-B9).
 */
export const checkSeedAndOutcome = (
  kernelVersion: number,
  evidence: OutcomeEvidence,
): Promise<KernelCheck> =>
  recompute(kernelVersion, async kernel => {
    const blockValue = decode("blockValue", evidence.blockValue);
    const secret = decode("roundSecret", evidence.roundSecret);
    const seed = await kernel.seed(blockValue, secret);
    const [step] = kernel.stepsDerive(seed, ONE_STEP_TWO_OPTIONS);
    const [losingIndex] = step?.losers ?? [];
    if (losingIndex === undefined) throw new KernelError("k-out-of-range");
    const values = {
      seed: hashFromBytes(seed),
      losingIndex: String(losingIndex),
    };
    const comparisons = [compare("seed", values.seed, evidence.seed)];
    const canceled = evidence.status === "canceled";
    if (!canceled || evidence.losingIndex !== undefined) {
      comparisons.push(
        compare("losingIndex", values.losingIndex, text(evidence.losingIndex)),
      );
    }
    if (canceled) return { comparisons, values };
    const outcome = outcomeOf(
      evidence.selectedIndex,
      losingIndex,
      ONE_STEP_TWO_OPTIONS[0].n,
    );
    comparisons.push(compare("status", outcome, evidence.status));
    const payout = payoutOf(
      kernel,
      outcome,
      evidence.bet,
      evidence.payoutTerms,
    );
    const { bet } = evidence;
    const written =
      payout === undefined || bet === undefined
        ? undefined
        : formatAmount(payout, bet.decimals, bet.currency);
    comparisons.push(compare("payout", written, evidence.payout));
    return {
      comparisons,
      values: written === undefined ? values : { ...values, payout: written },
    };
  });
