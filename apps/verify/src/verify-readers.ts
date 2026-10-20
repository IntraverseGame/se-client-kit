// The readers the verify API body is validated with (`verify-body.ts`): small
// functions that return the value, or `Bad` for a present value that is
// malformed, and the document's string patterns. Pure; no fetch.

export type Json = Readonly<Record<string, unknown>>;

export const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The document's string patterns, spelled as it spells them.
 * `tools/verify-api-patterns.test.ts` holds each to the vendored document.
 */
export const PATTERNS = {
  roundId:
    "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
  hex32: "^0x[0-9a-f]{64}$",
  address: "^0x[0-9a-f]{40}$",
  signature: "^0x[0-9a-f]{130}$",
  hexBytes: "^0x([0-9a-f]{2})*$",
  amount: "^(0|[1-9][0-9]*)$",
};
export const PATTERN = {
  roundId: new RegExp(PATTERNS.roundId, "u"),
  hex32: new RegExp(PATTERNS.hex32, "u"),
  address: new RegExp(PATTERNS.address, "u"),
  signature: new RegExp(PATTERNS.signature, "u"),
  hexBytes: new RegExp(PATTERNS.hexBytes, "u"),
  amount: new RegExp(PATTERNS.amount, "u"),
};
export const AMOUNT_MAX_LENGTH = 78;
export const MAX_DECIMALS = 77;

// A reader returns the value, or `Bad` for a present value that is malformed;
// an optional field that is absent reads as `undefined`.
export const Bad: unique symbol = Symbol("bad");
export type Read<T> = T | typeof Bad;

export const text = (v: unknown, pattern?: RegExp): Read<string> =>
  typeof v === "string" && (pattern === undefined || pattern.test(v)) ? v : Bad;
export const oneOf = (v: unknown, values: ReadonlySet<string>): Read<string> =>
  typeof v === "string" && values.has(v) ? v : Bad;
export const int = (
  v: unknown,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): Read<number> =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max
    ? v
    : Bad;
export const bool = (v: unknown): Read<boolean> =>
  typeof v === "boolean" ? v : Bad;
export const optional = <T>(
  v: unknown,
  read: (v: unknown) => Read<T>,
): Read<T | undefined> => (v === undefined ? undefined : read(v));
export const object = (v: unknown): Read<Json> => (isRecord(v) ? v : Bad);
export const list =
  <T>(read: (v: unknown) => Read<T>, max = 4096) =>
  (v: unknown): Read<readonly T[]> => {
    if (!Array.isArray(v) || v.length > max) return Bad;
    const out: T[] = [];
    for (const item of v as readonly unknown[]) {
      const value = read(item);
      if (value === Bad) return Bad;
      out.push(value);
    }
    return out;
  };

/** Reads `fields` of `source` with their readers; `Bad` if any is. */
export const shape = <T extends Record<string, (v: unknown) => unknown>>(
  source: Json,
  readers: T,
): { [K in keyof T]: Exclude<ReturnType<T[K]>, typeof Bad> } | typeof Bad => {
  const out: Record<string, unknown> = {};
  for (const [key, read] of Object.entries(readers)) {
    const value = read(Object.hasOwn(source, key) ? source[key] : undefined);
    if (value === Bad) return Bad;
    if (value !== undefined) out[key] = value;
  }
  return out as { [K in keyof T]: Exclude<ReturnType<T[K]>, typeof Bad> };
};

export const nested =
  <T>(read: (source: Json) => Read<T>): ((v: unknown) => Read<T>) =>
  v => {
    const source = object(v);
    return source === Bad ? Bad : read(source);
  };
