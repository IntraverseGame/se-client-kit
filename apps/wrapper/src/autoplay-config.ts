// The environment configuration's optional `autoplay` field (RFC-005 section 6,
// specs/wrapper.md, Configuration): it turns autoplay of book rounds on for the
// deployment. Without it there is no autoplay (fail closed); a malformed one
// refuses the whole document (`invalid-autoplay`). The verify page applies the
// same rule to the same document (apps/verify/src/autoplay-config.ts, V-3).

/** The validated `autoplay` field. */
export type AutoplayConfig = {
  /** The counts the player may choose, ascending. */
  readonly counts: readonly number[];
  /** The least time a round's result shows before the next start. */
  readonly minIntervalMs: number;
};

/** The most counts the field may list. */
export const MAX_AUTOPLAY_COUNTS = 8;
/** The largest count, and the longest interval (the shell's bounds). */
export const MAX_AUTOPLAY_COUNT = 1000;
export const MAX_AUTOPLAY_INTERVAL_MS = 600_000;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isWhole = (value: unknown, low: number, high: number): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= low &&
  value <= high;

/**
 * The field, typed and frozen, or `undefined` when it is malformed: exactly
 * `counts` (1 to 8 whole numbers from 1 to 1000, strictly ascending, so
 * distinct) and `minIntervalMs` (a whole number from 0 to 600 000).
 */
export const readAutoplayConfig = (
  value: unknown,
): AutoplayConfig | undefined => {
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value);
  if (
    keys.length !== 2 ||
    !Object.hasOwn(value, "counts") ||
    !Object.hasOwn(value, "minIntervalMs")
  ) {
    return undefined;
  }
  const { counts, minIntervalMs } = value;
  if (
    !Array.isArray(counts) ||
    counts.length === 0 ||
    counts.length > MAX_AUTOPLAY_COUNTS ||
    !isWhole(minIntervalMs, 0, MAX_AUTOPLAY_INTERVAL_MS)
  ) {
    return undefined;
  }
  const list = counts as readonly unknown[];
  const ascending = list.every(
    (count, index) =>
      isWhole(count, 1, MAX_AUTOPLAY_COUNT) &&
      (index === 0 || (list[index - 1] as number) < count),
  );
  return ascending
    ? Object.freeze({
        counts: Object.freeze([...(list as readonly number[])]),
        minIntervalMs,
      })
    : undefined;
};
