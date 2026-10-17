// The field readers of the chain configuration (internal): addresses, counts,
// names, and RPC endpoints, each read from untrusted parsed JSON.

import type { Address } from "@intraverse/se-client-signing";

/** One RPC endpoint of an entropy source, with the provider that runs it. */
export type RpcEndpoint = {
  /** Who runs the endpoint; two endpoints of one source never share one. */
  readonly provider: string;
  /** `https:`, or `http:` on a loopback host only. */
  readonly url: string;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const ZERO_ADDRESS = /^0x0{40}$/u;
// A source identifier or a provider name: a short printable token.
export const NAME: RegExp = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const HTTPS_URL = /^https:\/\/[^\s/?#@]+(?:\/[^\s?#]*)?$/u;
const LOOPBACK_HTTP_URL =
  /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?:\/[^\s?#]*)?$/u;

export const isRecord = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const own = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): unknown => (Object.hasOwn(record, key) ? record[key] : undefined);

export const readAddress = (value: unknown): Address | undefined =>
  typeof value === "string" && ADDRESS.test(value) && !ZERO_ADDRESS.test(value)
    ? (value.toLowerCase() as Address)
    : undefined;

export const isCount = (value: unknown, minimum: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;

export const readEndpoint = (value: unknown): RpcEndpoint | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
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

// Two endpoints of one source are independent only if run by different
// providers. Names are compared without case, and one URL listed twice under
// two names is refused too.
export const shareProvider = (endpoints: readonly RpcEndpoint[]): boolean => {
  const providers = new Set(endpoints.map(e => e.provider.toLowerCase()));
  const urls = new Set(endpoints.map(e => e.url.toLowerCase()));
  return providers.size < endpoints.length || urls.size < endpoints.length;
};

/**
 * Reads the per-source map `name` of a document (`tipLagMargin`,
 * `entropyChainId`): one entry for each of `sources` and for no other, each an
 * integer of at least `minimum`, kept as a `bigint`. `refused` names each field
 * that is missing or malformed (the map itself when it is not an object).
 */
export const readPerSource = (
  document: Readonly<Record<string, unknown>>,
  name: string,
  minimum: number,
  sources: readonly string[],
): {
  readonly values: ReadonlyMap<string, bigint>;
  readonly refused: readonly string[];
} => {
  const value = own(document, name);
  if (!isRecord(value)) {
    return { values: new Map(), refused: [name] };
  }
  const values = new Map<string, bigint>();
  const refused: string[] = [];
  for (const source of sources) {
    const entry = own(value, source);
    if (isCount(entry, minimum)) {
      values.set(source, BigInt(entry));
    } else {
      refused.push(`${name}.${source}`);
    }
  }
  for (const source of Object.keys(value)) {
    if (!sources.includes(source)) {
      refused.push(`${name}.${source}`);
    }
  }
  return { values, refused };
};
