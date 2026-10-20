// The origin rules of W-37: what a serialized origin is, and the "different
// registrable domain" rule without a public suffix list (ADR-007). The game
// bridge applies both at mount (controller-bridge.ts).

import type { Environment } from "./chain-config.ts";

// A serialized origin, as `event.origin` gives it: `https://host[:port]`, or
// `http:` on a loopback host only; lowercase, no path, no credentials. A host
// is dot-separated labels of 1 to 63 letters, digits, or hyphens, none starting
// or ending with a hyphen, with no empty label and no trailing dot. A port is
// 1 to 65535 without a leading zero, and never the scheme's default (`:443`,
// `:80`), which a serialized origin omits. `null` and `*` are not origins.
const ORIGIN = /^(https|http):\/\/([^:/]+|\[::1\])(?::([0-9]+))?$/u;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const LOOPBACK: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);
const DEFAULT_PORT: Readonly<Record<string, string>> = {
  https: "443",
  http: "80",
};
// An IPv4 literal in its canonical serialized form: four decimal parts, each
// 0 to 255 with no leading zero.
const IPV4 = /^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/u;

const isPort = (port: string, scheme: string): boolean =>
  /^[1-9][0-9]{0,4}$/u.test(port) &&
  Number(port) <= 65_535 &&
  port !== DEFAULT_PORT[scheme];

/** The host of a serialized origin, or `undefined` when it is not one. */
const hostOf = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const match = ORIGIN.exec(value);
  if (match === null) return undefined;
  const [, scheme = "", host = "", port] = match;
  if (port !== undefined && !isPort(port, scheme)) return undefined;
  if (scheme === "http") return LOOPBACK.has(host) ? host : undefined;
  return host.split(".").every(label => LABEL.test(label)) ? host : undefined;
};

/** Whether `value` is a serialized origin (W-37's grammar). */
export const isSerializedOrigin = (value: unknown): value is string =>
  hostOf(value) !== undefined;

const isIpLiteral = (host: string): boolean =>
  host.startsWith("[") ||
  (IPV4.test(host) && host.split(".").every(part => Number(part) <= 255));

/**
 * A host's comparison key (ADR-007): its last two dot-separated labels; an IP
 * literal, recognised before any label split, or a host of fewer than two
 * labels (`localhost`) is its own key.
 */
export const comparisonKey = (host: string): string => {
  if (isIpLiteral(host)) return host;
  const labels = host.split(".");
  return labels.length < 2 ? host : labels.slice(-2).join(".");
};

/**
 * Whether two distinct serialized origins may share a site (W-37, ADR-007):
 * their hosts' comparison keys are equal. In a `local` environment two loopback
 * hosts never count, so local development can serve the Wrapper and the game
 * from one machine on different ports; in `preview` and `production` loopback
 * hosts follow the rule like any other. Two values that are not both serialized
 * origins count, so the rule fails closed.
 */
export const mayShareSite = (
  a: string,
  b: string,
  environment: Environment,
): boolean => {
  const hostA = hostOf(a);
  const hostB = hostOf(b);
  if (hostA === undefined || hostB === undefined) return true;
  if (environment === "local" && LOOPBACK.has(hostA) && LOOPBACK.has(hostB)) {
    return false;
  }
  return comparisonKey(hostA) === comparisonKey(hostB);
};
