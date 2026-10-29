// The input errors of the fairness kernel, kernelVersion 1, by the names its
// public vectors give them (`expected.error` in `kernel/public/v1/seed`,
// `kernel/public/v1/shuffle-draw`, `kernel/public/v1/steps-derive`,
// `kernel/public/v1/round-secret-hash`, and `kernel/public/v1/coin-flip-payout`).

export type KernelErrorCode =
  /** Seed: the block value is not 32 bytes. */
  | "block-value-length"
  /** Seed, and the round secret's commitment: the secret is not 32 bytes. */
  | "secret-length"
  /**
   * StepsDerive, ShuffleDraw, and the seed's commitment: the seed is not 32
   * bytes.
   */
  | "seed-length"
  /** StepsDerive: a step's option count `n` is not a whole number in 1..2^32. */
  | "n-out-of-range"
  /** StepsDerive: a step's loser count `k` is not a whole number in 0..n. */
  | "k-out-of-range"
  /** ShuffleDraw: the label is not 1 to 32 UTF-8 bytes without a zero byte. */
  | "label-invalid"
  /** ShuffleDraw: `m` is not in 1..2^64 - 1. */
  | "m-out-of-range"
  /** Coin Flip's payout: `houseEdgeWad` is not below 10^18. */
  | "house-edge-out-of-range"
  /** Coin Flip's payout: `maxMultiplierMilli` is below 1. */
  | "max-multiplier-out-of-range"
  /** Coin Flip's payout: the bet is not in 1..2^128 - 1. */
  | "bet-out-of-range"
  /** Coin Flip's payout: the payout is above 2^128 - 1. */
  | "payout-too-large";

const MESSAGES: Readonly<Record<KernelErrorCode, string>> = {
  "block-value-length": "the block value must be 32 bytes",
  "secret-length": "the round secret must be 32 bytes",
  "seed-length": "the seed must be 32 bytes",
  "n-out-of-range": "a step's option count must be from 1 to 2^32",
  "k-out-of-range": "a step's loser count must be from 0 to its option count",
  "label-invalid":
    "a draw's label must be 1 to 32 UTF-8 bytes without a zero byte",
  "m-out-of-range": "a draw's range m must be from 1 to 2^64 - 1",
  "house-edge-out-of-range": "the house edge must be below 10^18 (1)",
  "max-multiplier-out-of-range": "the multiplier cap must be at least 1",
  "bet-out-of-range": "the bet must be from 1 to 2^128 - 1 base units",
  "payout-too-large": "the payout must be at most 2^128 - 1 base units",
};

/** A kernel input the kernel refuses. Its message is fixed per `code`. */
export class KernelError extends Error {
  public readonly code: KernelErrorCode;

  public constructor(code: KernelErrorCode) {
    super(MESSAGES[code]);
    this.name = "KernelError";
    this.code = code;
  }
}
