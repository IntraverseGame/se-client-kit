// The bets a Snapshot offers (W-31): its `suggestedBets`, or, when it suggests
// none, the fallback ladder of 1, 10, 20, 50, and 100 whole units of `minBet`'s
// currency. The Wrapper's bet stepper and autoplay's "still offered" rule
// (RFC-005 section 6) both read the offered bets from here, so they never
// disagree. Every amount is a `bigint` of base units (W-34); nothing here reads
// `normalized` or a JS number for money.

/** An amount as the Snapshot shows it, without the display number. */
export type OfferedAmount = {
  /** Base units, base 10. */
  readonly value: string;
  readonly decimals: number;
  readonly unit: string;
  readonly formatted: string;
};

/** The whole units of the fallback ladder. */
const LADDER_UNITS = [1n, 10n, 20n, 50n, 100n] as const;

const BASE_UNITS = /^(?:0|[1-9][0-9]{0,77})$/u;

/**
 * A number in a `formatted` string that touches no letter or digit: digits with
 * at most one separator and fraction ("0.1" in "0.1 USD", "0.10" in "€0.10";
 * never the "3" of a unit like "B3TR").
 */
const SHOWN_NUMBER =
  /(?<![\p{L}\p{N}])([0-9]+)(?:([.,])([0-9]+))?(?![\p{L}\p{N}])/gu;

/**
 * `whole` units of `like`'s currency, its `formatted` being `like.formatted`
 * with its last number replaced: with zero fraction digits when `like` shows
 * all its `decimals` ("€0.10" gives "€20.00"), else none ("0.1 USD" gives "20
 * USD"). Undefined when `like.formatted` holds no number, or `like.decimals` is
 * not a whole number from 0 to 77.
 */
const wholeUnits = (
  whole: bigint,
  like: OfferedAmount,
): OfferedAmount | undefined => {
  const match = [...like.formatted.matchAll(SHOWN_NUMBER)].at(-1);
  if (
    match === undefined ||
    !Number.isInteger(like.decimals) ||
    like.decimals < 0 ||
    like.decimals > 77
  ) {
    return undefined;
  }
  const [shown, , separator, fraction] = match;
  const number =
    separator === undefined ||
    fraction === undefined ||
    fraction.length !== like.decimals
      ? whole.toString()
      : `${whole.toString()}${separator}${"0".repeat(fraction.length)}`;
  const value = (whole * 10n ** BigInt(like.decimals)).toString();
  if (!BASE_UNITS.test(value)) {
    return undefined;
  }
  const at = match.index;
  return {
    value,
    decimals: like.decimals,
    unit: like.unit,
    formatted: `${like.formatted.slice(0, at)}${number}${like.formatted.slice(at + shown.length)}`,
  };
};

/**
 * The bets a Snapshot offers besides `defaultBet` (W-31): `suggestedBets`, or,
 * when there are none, the fallback ladder in `minBet`'s currency. The ladder
 * is not yet bounded by `minBet` and `maxBet`; the callers keep only what is
 * within them.
 */
export const suggestedOrLadder = <T extends OfferedAmount>(bet: {
  readonly minBet: T;
  readonly suggestedBets: readonly T[];
}): readonly (T | OfferedAmount)[] =>
  bet.suggestedBets.length > 0
    ? bet.suggestedBets
    : LADDER_UNITS.flatMap(whole => wholeUnits(whole, bet.minBet) ?? []);
