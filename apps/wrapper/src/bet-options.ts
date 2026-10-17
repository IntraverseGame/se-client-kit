// The bet selector's options (W-31, `idle`): the Snapshot's suggested bets
// within `minBet` and `maxBet`, with `defaultBet` preselected. Every
// comparison is on `Amount.value` as a `bigint` in base units (W-34); nothing
// here reads `normalized`, a multiplier, or a JS number for money.

import type { ShownAmount } from "./round-input.ts";

export type BetOption = {
  readonly amount: ShownAmount;
  /** Above the balance: shown, but cannot be chosen. */
  readonly affordable: boolean;
};

export type BetChoice = {
  readonly options: readonly BetOption[];
  /** The index of the preselected option, if any can be chosen. */
  readonly selected: number | undefined;
};

type BetContext = {
  readonly balance: ShownAmount;
  readonly minBet: ShownAmount;
  readonly maxBet: ShownAmount;
  readonly suggestedBets: readonly ShownAmount[];
  readonly defaultBet: ShownAmount;
};

const BASE_UNITS = /^(?:0|[1-9][0-9]{0,77})$/u;

/** The amount in base units, or `undefined` when it is not a base-units string. */
const unitsOf = (amount: ShownAmount): bigint | undefined =>
  BASE_UNITS.test(amount.value) ? BigInt(amount.value) : undefined;

const sameCurrency = (a: ShownAmount, b: ShownAmount): boolean =>
  a.unit === b.unit && a.decimals === b.decimals;

/**
 * -1, 0, or 1 as `a` is below, equal to, or above `b`; `undefined` when they
 * are not comparable (another currency or precision).
 */
export const compareAmounts = (
  a: ShownAmount,
  b: ShownAmount,
): -1 | 0 | 1 | undefined => {
  const left = unitsOf(a);
  const right = unitsOf(b);
  if (!sameCurrency(a, b) || left === undefined || right === undefined) {
    return undefined;
  }
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
};

const within = (amount: ShownAmount, bet: BetContext): boolean => {
  const low = compareAmounts(amount, bet.minBet);
  const high = compareAmounts(amount, bet.maxBet);
  return low !== undefined && high !== undefined && low >= 0 && high <= 0;
};

/**
 * The selector's options for a bet context: the suggested bets, and the default
 * bet first when it is not one of them.
 */
export const betChoice = (bet: BetContext): BetChoice => {
  const listed = bet.suggestedBets.some(
    amount => compareAmounts(amount, bet.defaultBet) === 0,
  );
  const candidates = listed
    ? bet.suggestedBets
    : [bet.defaultBet, ...bet.suggestedBets];
  const options = candidates
    .filter(amount => within(amount, bet))
    .map(amount => {
      const order = compareAmounts(amount, bet.balance);
      return { amount, affordable: order !== undefined && order <= 0 };
    });
  const preferred = options.findIndex(
    option =>
      option.affordable && compareAmounts(option.amount, bet.defaultBet) === 0,
  );
  const first = options.findIndex(option => option.affordable);
  const selected = preferred === -1 ? first : preferred;
  return { options, selected: selected === -1 ? undefined : selected };
};
