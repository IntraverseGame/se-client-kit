// Check 7's payout for a Coin Flip round (specs/verify-page.md, V-12, OQ-B9):
// what a `won` or `lost` round settles with, from its recomputed outcome, the
// body's `game.terms`, and its bet, under the round's kernel.

import { KernelError } from "./kernel-error.ts";
import type { Kernel } from "./kernels.ts";
import type { BetEvidence, PayoutTermsEvidence } from "./round-evidence.ts";

/** The most digits of an amount the page reads as `bigint` (V-21's limit). */
const MAX_DIGITS = 78;

/**
 * The payout a `won` or `lost` Coin Flip round settles with, in base units: 0
 * for `lost`, Coin Flip's schedule for `won`; `undefined` when the round's
 * outcome, its bet, or its terms are missing. A house edge longer than an
 * amount's limit is out of range without being read (it is above 10^18).
 */
export const payoutOf = (
  kernel: Kernel,
  outcome: "won" | "lost" | "canceled" | undefined,
  bet: BetEvidence | undefined,
  payoutTerms: PayoutTermsEvidence | undefined,
): bigint | undefined => {
  if (outcome === "lost") return 0n;
  if (outcome !== "won" || bet === undefined || payoutTerms === undefined)
    return undefined;
  if (payoutTerms.houseEdgeWad.length > MAX_DIGITS)
    throw new KernelError("house-edge-out-of-range");
  return kernel.coinFlipPayout(
    {
      houseEdgeWad: BigInt(payoutTerms.houseEdgeWad),
      maxMultiplierMilli: BigInt(payoutTerms.maxMultiplierMilli),
    },
    bet.value,
  ).payout;
};
