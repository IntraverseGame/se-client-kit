// The field readers of the environment configuration document (V-3), each read
// from untrusted parsed JSON. The rules are the Wrapper's own (the same
// document, the same schema); the page cannot import the Wrapper or `shell`, so
// they are spelled here, and `environment-config.test.ts` pins them.

import type { RpcEndpoint } from "./chain-read.ts";

export type Fields = Readonly<Record<string, unknown>>;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const ZERO_ADDRESS = /^0x0{40}$/u;
// A source identifier or a provider name: a short printable token.
export const NAME: RegExp = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const HTTPS_URL = /^https:\/\/[^\s/?#@]+(?:\/[^\s?#]*)?$/u;
const LOOPBACK_HTTP_URL =
  /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?:\/[^\s?#]*)?$/u;
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

export const isRecord = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const own = (record: Fields, key: string): unknown =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** A non-zero address, lowercased. */
export const readAddress = (value: unknown): `0x${string}` | undefined =>
  typeof value === "string" && ADDRESS.test(value) && !ZERO_ADDRESS.test(value)
    ? (value.toLowerCase() as `0x${string}`)
    : undefined;

export const isCount = (value: unknown, minimum: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;

export const readEndpoint = (value: unknown): RpcEndpoint | undefined => {
  if (!isRecord(value)) return undefined;
  const provider = own(value, "provider");
  const url = own(value, "url");
  if (
    typeof provider !== "string" ||
    !NAME.test(provider) ||
    typeof url !== "string" ||
    !(HTTPS_URL.test(url) || LOOPBACK_HTTP_URL.test(url))
  ) {
    return undefined;
  }
  return Object.freeze({ provider, url });
};

/** Two endpoints of one source share a provider (without case) or a URL. */
export const shareProvider = (endpoints: readonly RpcEndpoint[]): boolean =>
  new Set(endpoints.map(e => e.provider.toLowerCase())).size <
    endpoints.length ||
  new Set(endpoints.map(e => e.url.toLowerCase())).size < endpoints.length;

/**
 * The per-source map `name` (`tipLagMargin`, `entropyChainId`): one integer of
 * at least `minimum` for each of `sources` and no other entry; `refused` names
 * each field that is missing or malformed.
 */
export const readPerSource = (
  document: Fields,
  name: string,
  minimum: number,
  sources: readonly string[],
): {
  readonly values: ReadonlyMap<string, number>;
  readonly refused: readonly string[];
} => {
  const value = own(document, name);
  if (!isRecord(value)) return { values: new Map(), refused: [name] };
  const values = new Map<string, number>();
  const refused: string[] = [];
  for (const source of sources) {
    const entry = own(value, source);
    if (isCount(entry, minimum)) values.set(source, entry);
    else refused.push(`${name}.${source}`);
  }
  for (const source of Object.keys(value)) {
    if (!sources.includes(source)) refused.push(`${name}.${source}`);
  }
  return { values, refused };
};

/**
 * An absolute `https:` URL, or `http:` on a loopback host, with no credentials,
 * query, or fragment, written as the URL parser serializes it.
 */
export const readUrl = (value: unknown): URL | undefined => {
  if (typeof value !== "string") return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  const secure =
    url.protocol === "https:" ||
    (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));
  const canonical = url.href === value || url.href === `${value}/`;
  const plain =
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "";
  return secure && canonical && plain ? url : undefined;
};

/** An API base: exactly as the parser writes it, its path ending `suffix`. */
export const readApiBase = (
  value: unknown,
  suffix: string,
): string | undefined => {
  const url = readUrl(value);
  return url !== undefined &&
    typeof value === "string" &&
    url.href === value &&
    url.pathname.endsWith(suffix)
    ? value
    : undefined;
};

const readOrigin = (value: unknown): string | undefined => {
  const url = readUrl(value);
  return url !== undefined && url.origin === value
    ? (value as string)
    : undefined;
};

/** A list of distinct origins, at least `minimum` long. */
export const readOrigins = (
  value: unknown,
  minimum: number,
): readonly string[] | undefined => {
  if (!Array.isArray(value) || value.length < minimum) return undefined;
  const origins = (value as readonly unknown[]).map(o => readOrigin(o));
  if (origins.some(origin => origin === undefined)) return undefined;
  const list = origins as string[];
  return new Set(list).size === list.length ? Object.freeze(list) : undefined;
};
