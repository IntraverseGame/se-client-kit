// The input errors of the fairness kernel, kernelVersion 1, by the names its
// public vectors give them (`expected.error` in `kernel/public/v1/seed` and
// `kernel/public/v1/steps-derive`).

export type KernelErrorCode =
  /** Seed: the block value is not 32 bytes. */
  | "block-value-length"
  /** Seed, and the round secret's commitment: the secret is not 32 bytes. */
  | "secret-length"
  /** StepsDerive, and the seed's commitment: the seed is not 32 bytes. */
  | "seed-length"
  /** StepsDerive: a step's option count `n` is not a whole number in 1..2^32. */
  | "n-out-of-range"
  /** StepsDerive: a step's loser count `k` is not a whole number in 0..n. */
  | "k-out-of-range";

const MESSAGES: Readonly<Record<KernelErrorCode, string>> = {
  "block-value-length": "the block value must be 32 bytes",
  "secret-length": "the round secret must be 32 bytes",
  "seed-length": "the seed must be 32 bytes",
  "n-out-of-range": "a step's option count must be from 1 to 2^32",
  "k-out-of-range": "a step's loser count must be from 0 to its option count",
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
