// Autoplay's bet rules (RFC-005 section 6): whether the latest Snapshot still
// offers the run's bet, and whether its balance covers it. Every comparison is
// a `bigint` comparison of base units (W-34); nothing here reads `normalized`
// or a JS number for money.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import type { Bet } from "./round-start.ts";

const BASE_UNITS = /^(?:0|[1-9][0-9]{0,77})$/u;

export type Amount = {
  readonly value: string;
  readonly unit: string;
  readonly decimals: number;
};

const unitsOf = (amount: { readonly value: string }): bigint | undefined =>
  BASE_UNITS.test(amount.value) ? BigInt(amount.value) : undefined;

const sameCurrency = (a: Amount, bet: Bet): boolean =>
  a.unit === bet.unit && a.decimals === (bet.decimals ?? a.decimals);

/** Whether `a` and `b` are the same amount in the same currency. */
const sameAmount = (a: Amount, bet: Bet): boolean => {
  const left = unitsOf(a);
  const right = unitsOf(bet);
  return (
    sameCurrency(a, bet) &&
    left !== undefined &&
    right !== undefined &&
    left === right
  );
};

/**
 * The latest Snapshot's own `Amount` of the bet, when it still offers it: one
 * of `suggestedBets` or `defaultBet`, within `minBet` and `maxBet`.
 */
export const offeredAmount = (
  snapshot: ValidSnapshot,
  bet: Bet,
): Amount | undefined => {
  const { minBet, maxBet, suggestedBets, defaultBet } = snapshot.bet;
  const amount = [...suggestedBets, defaultBet].find(option =>
    sameAmount(option, bet),
  );
  if (amount === undefined) return undefined;
  const value = unitsOf(amount);
  const low = unitsOf(minBet);
  const high = unitsOf(maxBet);
  return value !== undefined &&
    low !== undefined &&
    high !== undefined &&
    sameCurrency(minBet, bet) &&
    sameCurrency(maxBet, bet) &&
    value >= low &&
    value <= high
    ? amount
    : undefined;
};

/** Whether the latest balance covers `amount`, as `bigint`s (W-34). */
export const covers = (snapshot: ValidSnapshot, amount: Amount): boolean => {
  const { balance } = snapshot.bet;
  const have = unitsOf(balance);
  const need = unitsOf(amount);
  return (
    have !== undefined &&
    need !== undefined &&
    balance.unit === amount.unit &&
    balance.decimals === amount.decimals &&
    have >= need
  );
};
