// What the round shows of its amounts and display values (W-31, W-34): the
// payout a result shows, the cash-out value the cash-out control shows, and the
// multiplier's display form. Money is the Snapshot's `formatted`; a decision
// compares `value` as a `bigint`; nothing is ever computed from a multiplier.

import { unitsOf } from "./bet-options.ts";
import type { ShownAmount, SnapshotInput } from "./round-input.ts";

/**
 * The payout a result shows (W-31): a `won` round's, and a `lost` round's only
 * when it credits something (`value` above 0, compared as a `bigint`, W-34).
 * None on any other status, none when the Snapshot carries none, and none when
 * `value` is not a base-units string (the validator rules that out; the guard
 * keeps a bad value from throwing, as `bet-options.ts` does).
 */
export const shownPayout = (
  snapshot: SnapshotInput,
): ShownAmount | undefined => {
  const { payout, status } = snapshot;
  if (payout === undefined) return undefined;
  const units = unitsOf(payout);
  if (units === undefined) return undefined;
  if (status === "won") return payout;
  return status === "lost" && units > 0n ? payout : undefined;
};

/**
 * The cash-out value the cash-out control shows (W-31): an `active` round's
 * `cashOutValue`, the server's quote of what a cash-out credits now. None on
 * any other status, none when the Snapshot carries none, and none when `value`
 * is not a base-units string (the validator rules that out; the guard keeps a
 * bad value from throwing, as `shownPayout` does). Never computed (W-34).
 */
export const shownCashOutValue = (
  snapshot: SnapshotInput,
): ShownAmount | undefined => {
  const { cashOutValue, status } = snapshot;
  if (status !== "active" || cashOutValue === undefined) return undefined;
  return unitsOf(cashOutValue) === undefined ? undefined : cashOutValue;
};

export const formatMultiplier = (
  language: string,
  multiplier: number,
): string =>
  `×${new Intl.NumberFormat(language, { maximumFractionDigits: 4 }).format(multiplier)}`;
