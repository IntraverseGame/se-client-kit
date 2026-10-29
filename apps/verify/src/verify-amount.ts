// A verify API `Amount` (base units as a string, with its decimals) as the page
// holds it: a `bigint`, and the text it shows (specs/verify-page.md, V-6).

import type { BetEvidence, PayoutEvidence } from "./round-evidence.ts";
import {
  AMOUNT_MAX_LENGTH,
  Bad,
  int,
  MAX_DECIMALS,
  nested,
  optional,
  PATTERN,
  shape,
  type Read,
} from "./verify-readers.ts";

/** An `Amount` of the document: a base-10 string of base units, and decimals. */
export const amount = nested(s =>
  shape(s, {
    amount: v =>
      typeof v === "string" &&
      v.length <= AMOUNT_MAX_LENGTH &&
      PATTERN.amount.test(v)
        ? BigInt(v)
        : Bad,
    currency: v => (typeof v === "string" && v !== "" ? v : Bad),
    decimals: v => int(v, 0, MAX_DECIMALS),
  }),
);

/**
 * `1.94 EUR` from base units, decimals, and a currency: exact, by `bigint`
 * arithmetic on the digits, trailing zeros of the fraction dropped.
 */
export const formatAmount = (
  value: bigint,
  decimals: number,
  currency: string,
): string => {
  const digits = value.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/u, "");
  return `${whole}${fraction === "" ? "" : `.${fraction}`} ${currency}`;
};

/** The round's `bet`, as check 7's payout reads it (OQ-B9). */
export const bet = (v: unknown): Read<BetEvidence> => {
  const read = amount(v);
  return read === Bad
    ? Bad
    : { value: read.amount, decimals: read.decimals, currency: read.currency };
};

export const payout = (v: unknown): Read<PayoutEvidence | undefined> => {
  const read = optional(v, amount);
  return read === Bad || read === undefined
    ? read
    : {
        formatted: formatAmount(read.amount, read.decimals, read.currency),
        value: read.amount,
        unit: read.currency,
      };
};
