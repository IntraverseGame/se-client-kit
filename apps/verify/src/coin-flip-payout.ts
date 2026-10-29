// The SuperEngine fairness kernel, kernelVersion 1: Coin Flip's payout
// (specs/verify-page.md, V-12 check 7), pinned by the public vector set
// `kernel/public/v1/coin-flip-payout`. All arithmetic is `bigint`; an amount
// is never a JS `number`.

import { KernelError } from "./kernel-error.ts";

/** 10^18: `houseEdgeWad` is a fraction of it. */
const WAD = 10n ** 18n;
/** The largest bet and payout the kernel takes, 2^128 - 1. */
const UINT128_MAX = (1n << 128n) - 1n;

/** Coin Flip's payout terms, beside its one node of two options, one loser. */
export type CoinFlipTerms = {
  /** The house edge as a fraction of 10^18. */
  readonly houseEdgeWad: bigint;
  /** The cap of the multiplier, in thousandths (1000 = 1x). */
  readonly maxMultiplierMilli: bigint;
};

/** The one step of Coin Flip's schedule along the path [0]. */
export type CoinFlipStep = {
  /** Min(m_1, maxMultiplierMilli), in thousandths. */
  readonly multiplierMilli: bigint;
  /** Floor(bet * multiplierMilli / 1000), in the bet's base units. */
  readonly payout: bigint;
  /** Payout / bet * 1/2, a reduced fraction `numerator/denominator`. */
  readonly rtp: string;
};

const gcd = (a: bigint, b: bigint): bigint => {
  let [x, y] = [a, b];
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
};

/**
 * Schedule(terms, [0], bet) for Coin Flip. Checks, in order: `houseEdgeWad` <
 * 10^18 (`house-edge-out-of-range`); `maxMultiplierMilli` >= 1
 * (`max-multiplier-out-of-range`); 1 <= bet <= 2^128 - 1 (`bet-out-of-range`);
 * the payout at most 2^128 - 1 (`payout-too-large`). Then m_1 = floor(1000 *
 * (WAD - houseEdgeWad) * 2 / WAD).
 */
export const coinFlipSchedule = (
  terms: CoinFlipTerms,
  bet: bigint,
): CoinFlipStep => {
  if (terms.houseEdgeWad < 0n || terms.houseEdgeWad >= WAD)
    throw new KernelError("house-edge-out-of-range");
  if (terms.maxMultiplierMilli < 1n)
    throw new KernelError("max-multiplier-out-of-range");
  if (bet < 1n || bet > UINT128_MAX) throw new KernelError("bet-out-of-range");
  const m1 = (1000n * (WAD - terms.houseEdgeWad) * 2n) / WAD;
  const multiplierMilli =
    m1 < terms.maxMultiplierMilli ? m1 : terms.maxMultiplierMilli;
  const payout = (bet * multiplierMilli) / 1000n;
  if (payout > UINT128_MAX) throw new KernelError("payout-too-large");
  const denominator = 2n * bet;
  const divisor = gcd(payout, denominator);
  return {
    multiplierMilli,
    payout,
    rtp: `${String(payout / divisor)}/${String(denominator / divisor)}`,
  };
};
