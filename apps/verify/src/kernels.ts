// The fairness kernels this page implements, keyed on the kernel version
// (specs/verify-page.md, V-12a). A round is recomputed only with the kernel of
// its own version; a version not listed here is never mapped to another one.

import {
  type CoinFlipStep,
  type CoinFlipTerms,
  coinFlipSchedule,
} from "./coin-flip-payout.ts";
import { roundSecretHashOf, seedHashOf, seedOf } from "./kernel-v1.ts";
import {
  type StepLosers,
  type StepTerms,
  stepsDerive,
} from "./steps-derive.ts";

/** One kernel version's derivations, over raw bytes. */
export type Kernel = {
  readonly version: number;
  /** The round secret's commitment, `roundSecretHash`. */
  readonly roundSecretHash: (secret: Uint8Array) => Promise<Uint8Array>;
  /** The seed, from block N's hash and the round secret. */
  readonly seed: (
    blockValue: Uint8Array,
    secret: Uint8Array,
  ) => Promise<Uint8Array>;
  /** The seed's commitment, `seedHash`. */
  readonly seedHash: (seed: Uint8Array) => Promise<Uint8Array>;
  /** The losers of each step of a config round. */
  readonly stepsDerive: (
    seed: Uint8Array,
    steps: readonly StepTerms[],
  ) => StepLosers[];
  /** Coin Flip's payout for a bet that survives its one step. */
  readonly coinFlipPayout: (terms: CoinFlipTerms, bet: bigint) => CoinFlipStep;
};

const KERNEL_V1: Kernel = Object.freeze({
  version: 1,
  roundSecretHash: roundSecretHashOf,
  seed: seedOf,
  seedHash: seedHashOf,
  stepsDerive,
  coinFlipPayout: coinFlipSchedule,
});

const KERNELS: ReadonlyMap<number, Kernel> = new Map([[1, KERNEL_V1]]);

/**
 * The kernel of `version`, or `undefined` when this page does not implement
 * that version: the round is then not recomputable (V-8) and no derivation
 * runs. Kernel version 1 is the only one today.
 */
export const kernelFor = (version: number): Kernel | undefined =>
  KERNELS.get(version);
