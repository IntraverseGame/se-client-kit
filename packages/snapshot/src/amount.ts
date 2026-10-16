// Money. `Amount.value` is a base-10 string of base units; it is read here, and
// only here, as a `bigint`. `Amount.normalized` and `formatted` are display
// values and never an input to a decision (specs/wrapper.md, W-34).

const BASE_UNITS = /^(?:0|[1-9][0-9]*)$/u;

/** The largest amount the contract allows: 2^256 - 1 base units. */
const MAX_BASE_UNITS = 2n ** 256n - 1n;

/** The longest base-units string: 2^256 - 1 has 78 digits. */
const MAX_DIGITS = 78;

/**
 * Reads a base-units string (no sign, no leading zero, at most 2^256 - 1) as a
 * `bigint`; `undefined` when it is not one. Never throws.
 */
export const parseBaseUnits = (value: string): bigint | undefined => {
  if (value.length > MAX_DIGITS || !BASE_UNITS.test(value)) {
    return undefined;
  }
  const units = BigInt(value);
  return units <= MAX_BASE_UNITS ? units : undefined;
};

/** The money-bearing fields of an `Amount`. */
export type AmountValue = {
  readonly value: string;
  readonly decimals: number;
  readonly unit: string;
};

/** -1 when the first amount is smaller, 0 when equal, 1 when larger. */
export type AmountOrder = -1 | 0 | 1;

/**
 * Compares two amounts as `bigint` base units. `undefined` when they are not
 * comparable: a different `unit` or `decimals`, or a value that is not a
 * base-units string.
 */
export const compareAmounts = (
  left: AmountValue,
  right: AmountValue,
): AmountOrder | undefined => {
  if (left.unit !== right.unit || left.decimals !== right.decimals) {
    return undefined;
  }
  const a = parseBaseUnits(left.value);
  const b = parseBaseUnits(right.value);
  if (a === undefined || b === undefined) {
    return undefined;
  }
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
};
