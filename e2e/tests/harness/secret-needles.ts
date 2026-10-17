// What the secret scan looks for: each secret in the forms a leak usually takes,
// and the shapes of a launch code and a play token. Also the redaction that
// keeps a finding's detail, a refused URL, and the fake's records free of every
// secret. Node-only: nothing here runs in a page.

/** A secret the test knows, by label. */
export type Secret = {
  readonly label: string;
  readonly value: string | Uint8Array;
};

/** Secrets that become known during the test, read when they are needed. */
export type SecretSource = () => readonly Secret[];

/** One form of a secret; `anyCase` for hex, which may be printed in either case. */
export type Needle = { readonly value: string; readonly anyCase: boolean };

/** Strings shaped like a secret of the Play API, found even when unregistered. */
export const SHAPED_SECRETS: readonly {
  readonly label: string;
  readonly pattern: RegExp;
}[] = [
  { label: "a launch code", pattern: /lc_[\w-]{43}/gu },
  { label: "a play token", pattern: /pt_[\w-]{43}/gu },
];

const base64url = (base64: string): string =>
  base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");

const formsOf = (value: string | Uint8Array): readonly Needle[] => {
  if (typeof value === "string") {
    const base64 = Buffer.from(value, "utf8").toString("base64");
    return [
      { value, anyCase: false },
      { value: encodeURIComponent(value), anyCase: false },
      { value: base64, anyCase: false },
      { value: base64url(base64), anyCase: false },
    ];
  }
  const bytes = Buffer.from(value);
  const hex = bytes.toString("hex");
  const base64 = bytes.toString("base64");
  return [
    { value: hex, anyCase: true },
    { value: base64, anyCase: false },
    { value: base64url(base64), anyCase: false },
    { value: Array.from(value).join(","), anyCase: false },
    {
      value: hex === "" ? "" : BigInt(`0x${hex}`).toString(10),
      anyCase: false,
    },
  ];
};

/**
 * A string raw, URL-encoded, and in base64 and base64url; bytes in hex (any
 * case), base64, base64url, as comma-separated decimals, and as one decimal
 * number (the bytes read big-endian, as a `bigint` prints).
 */
export const needlesOf = (value: string | Uint8Array): readonly Needle[] =>
  formsOf(value).filter(needle => needle.value !== "");

export const contains = (text: string, needle: Needle): boolean =>
  needle.anyCase
    ? text.toLowerCase().includes(needle.value.toLowerCase())
    : text.includes(needle.value);

export const isShaped = (text: string, pattern: RegExp): boolean =>
  text.match(pattern) !== null;

const escapeRegExp = (text: string): string =>
  text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, "\\$&");

const DETAIL_LENGTH = 200;

/** `text` with every needle and every shaped secret replaced, shortened. */
export const redact = (text: string, needles: readonly Needle[]): string => {
  // Longest first, so a form is not left half-replaced by a shorter one.
  const ordered = [...needles].toSorted(
    (left, right) => right.value.length - left.value.length,
  );
  let out = text;
  for (const needle of ordered) {
    const flags = needle.anyCase ? "giu" : "gu";
    out = out.replace(
      new RegExp(escapeRegExp(needle.value), flags),
      "[redacted]",
    );
  }
  for (const { pattern } of SHAPED_SECRETS) {
    out = out.replace(pattern, "[redacted]");
  }
  return out.length > DETAIL_LENGTH ? `${out.slice(0, DETAIL_LENGTH)}…` : out;
};

/** `text` with every form of every secret of `sources` redacted. */
export const redactSecrets = (
  text: string,
  sources: readonly SecretSource[],
): string =>
  redact(
    text,
    sources
      .flatMap(source => source())
      .flatMap(secret => needlesOf(secret.value)),
  );
