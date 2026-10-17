// The response headers the release bundle recommends to its host
// (specs/client-kit.md, How the Wrapper reaches the SuperEngine origin): a
// strict `Content-Security-Policy` (no `unsafe-inline`, no `unsafe-eval`,
// `connect-src` limited to the SE origin and the configured RPCs, `frame-src`
// the game origins), `Referrer-Policy: no-referrer`, and a
// `Permissions-Policy`.
//
// The build is the same for every environment, so the origins that differ per
// environment are placeholders in the headers file; `contentSecurityPolicyFor`
// fills them from a validated environment configuration document. The parts
// that do not depend on the environment are also set by a `<meta>` policy in
// the built page, so they hold even where the host's headers are missing.

import type { EnvironmentConfig } from "./src/environment-config.ts";

/** Placeholders the deploy side fills from the environment's document. */
export const CSP_PLACEHOLDERS = Object.freeze({
  /** The RPC endpoints' origins, and the Play API's if it is not `'self'`. */
  connect: "{{connectOrigins}}",
  /** `gameOrigins`: where the game iframe may come from (W-37). */
  frame: "{{gameOrigins}}",
  /** `operatorOrigins`: who may embed the Wrapper (W-49). */
  ancestors: "{{operatorOrigins}}",
});

/** The directives that hold in every environment. */
const FIXED_DIRECTIVES: readonly string[] = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
];

/**
 * The policy of the built page's `<meta>` element. `frame-ancestors` cannot be
 * set by `<meta>`, and `connect-src` and `frame-src` depend on the environment,
 * so they are left to the header (no `default-src` here, which would block
 * them).
 */
export const META_CONTENT_SECURITY_POLICY: string = [
  "script-src 'self'",
  "style-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
].join("; ");

/** The header's policy, with the per-environment placeholders. */
export const CONTENT_SECURITY_POLICY_TEMPLATE: string = [
  ...FIXED_DIRECTIVES,
  `connect-src 'self' ${CSP_PLACEHOLDERS.connect}`,
  `frame-src ${CSP_PLACEHOLDERS.frame}`,
  `frame-ancestors ${CSP_PLACEHOLDERS.ancestors}`,
].join("; ");

/**
 * Powerful features the Wrapper never uses are off for it and for every frame
 * it embeds. Clipboard write is not listed: it is not a recognised
 * Permissions-Policy feature (the round id's copy control uses the Clipboard
 * API under the browser's own user-activation rule).
 */
export const PERMISSIONS_POLICY: string = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "midi=()",
  "display-capture=()",
  "publickey-credentials-get=()",
  "clipboard-read=()",
].join(", ");

/** The headers file of the release bundle (`headers.json`). */
export const releaseHeaders = (): Readonly<Record<string, string>> =>
  Object.freeze({
    "Content-Security-Policy": CONTENT_SECURITY_POLICY_TEMPLATE,
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": PERMISSIONS_POLICY,
  });

const originOf = (url: string): string => new URL(url).origin;

const sourceList = (origins: Iterable<string>): string => {
  const unique = [...new Set(origins)].toSorted();
  return unique.length === 0 ? "'none'" : unique.join(" ");
};

/** The header's policy for one environment's validated document. */
export const contentSecurityPolicyFor = (config: EnvironmentConfig): string => {
  const rpc = Object.values(config.chain.sources).flatMap(source =>
    source.endpoints.map(endpoint => originOf(endpoint.url)),
  );
  return CONTENT_SECURITY_POLICY_TEMPLATE.replace(
    CSP_PLACEHOLDERS.connect,
    sourceList([originOf(config.playApiBaseUrl), ...rpc]),
  )
    .replace(CSP_PLACEHOLDERS.frame, sourceList(config.gameOrigins))
    .replace(CSP_PLACEHOLDERS.ancestors, sourceList(config.operatorOrigins));
};
