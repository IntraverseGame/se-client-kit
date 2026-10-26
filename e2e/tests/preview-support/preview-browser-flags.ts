// The preview project's browser-level block (RFC-002, "Lifting the hermetic
// blocks, only for allowed hosts"). The fake projects resolve no host name
// (`browser-flags.ts`); the preview project resolves exactly the hosts of its
// allow-list and nothing else, so traffic that no route sees (workers, WebRTC)
// still reaches no other host. The fake projects' constants are not touched.
//
// Chromium applies `--host-resolver-rules` to an IP literal as well as to a name
// (found with Chrome on macOS while implementing this: `MAP * ~NOTFOUND` alone
// makes `http://127.0.0.1:<port>` fail with `ERR_NAME_NOT_RESOLVED`). So an IP
// literal in the allow-list needs its own `EXCLUDE`, written without the
// brackets of an IPv6 literal (`EXCLUDE ::1` works; `EXCLUDE [::1]` does not).

import { BLOCK_HOST_RESOLUTION } from "../harness/browser-flags.ts";

/** The host of `origin` as `EXCLUDE` writes it (no brackets around IPv6). */
const excludableHost = (origin: string): string => {
  const { hostname } = new URL(origin);
  return hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
};

/**
 * Chromium's `--host-resolver-rules` for `allowedOrigins`: every host resolves
 * to nothing, except the host of each origin.
 */
export const hostResolverRules = (
  allowedOrigins: readonly string[],
): string => {
  const hosts = [
    ...new Set(allowedOrigins.map(origin => excludableHost(origin))),
  ];
  return [
    BLOCK_HOST_RESOLUTION,
    ...hosts.map(host => `, EXCLUDE ${host}`),
  ].join("");
};
