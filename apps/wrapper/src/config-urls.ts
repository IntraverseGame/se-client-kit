// The URL and origin readers of the environment configuration document
// (specs/wrapper.md, Configuration), each read from untrusted parsed JSON: a
// value is accepted only when it is already written the way the URL parser
// serializes it, never repaired. environment-config.ts applies them.

const PLAY_API_SUFFIX = "/play/v1";
const VERIFY_API_SUFFIX = "/verify/v1";
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

export const isRecord = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const own = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): unknown => (Object.hasOwn(record, key) ? record[key] : undefined);

/**
 * An absolute `https:` URL, or `http:` on a loopback host (the shell's rule for
 * RPC endpoints), with no credentials, query, or fragment.
 */
const readUrl = (value: unknown): URL | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  const secure =
    url.protocol === "https:" ||
    (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));
  // `href` is the parser's serialization: a value that is not already written
  // that way (a trailing `?` or `#`, odd casing) is refused, not repaired.
  const canonical = url.href === value || url.href === `${value}/`;
  const plain =
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "";
  return secure && canonical && plain ? url : undefined;
};

export const readPlayApiBase = (value: unknown): string | undefined => {
  const url = readUrl(value);
  return url !== undefined &&
    typeof value === "string" &&
    url.href === value &&
    url.pathname.endsWith(PLAY_API_SUFFIX)
    ? value
    : undefined;
};

/**
 * The verify API base (verify-page.md V-3, V-3a, D-4, D-10): `playApiBaseUrl`'s
 * rule with the `/verify/v1` suffix, on `ownOrigin` only (the verify API sends
 * no CORS headers, so it is read same-origin). Required, never derived or
 * defaulted. The Wrapper validates it for the verify page, which reads the same
 * document, and does not use it.
 */
export const readVerifyApiBase = (
  value: unknown,
  ownOrigin: string,
): string | undefined => {
  const url = readUrl(value);
  return url !== undefined &&
    typeof value === "string" &&
    url.href === value &&
    url.origin === ownOrigin &&
    url.pathname.endsWith(VERIFY_API_SUFFIX)
    ? value
    : undefined;
};

export const readVerifyBase = (value: unknown): string | undefined =>
  readUrl(value) === undefined ? undefined : (value as string);

/** An origin, written exactly as `URL.origin` serializes it. */
const readOrigin = (value: unknown): string | undefined => {
  const url = typeof value === "string" ? readUrl(value) : undefined;
  return url !== undefined && url.origin === value ? value : undefined;
};

export const readOrigins = (
  value: unknown,
  minimum: number,
): readonly string[] | undefined => {
  if (!Array.isArray(value) || value.length < minimum) {
    return undefined;
  }
  const origins = (value as readonly unknown[]).map(entry => readOrigin(entry));
  if (origins.some(origin => origin === undefined)) {
    return undefined;
  }
  const list = origins as string[];
  return new Set(list).size === list.length ? Object.freeze(list) : undefined;
};
