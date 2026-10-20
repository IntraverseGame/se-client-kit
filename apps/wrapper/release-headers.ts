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
const META_DIRECTIVES: readonly string[] = [
  "script-src 'self'",
  "style-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
];

export const META_CONTENT_SECURITY_POLICY: string = META_DIRECTIVES.join("; ");

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

/** The Wrapper's response headers, with the per-environment placeholders. */
export const wrapperHeaders = (): Readonly<Record<string, string>> =>
  Object.freeze({
    "Content-Security-Policy": CONTENT_SECURITY_POLICY_TEMPLATE,
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": PERMISSIONS_POLICY,
  });

/** The one placeholder of the verify page's policy (specs/verify-page.md). */
export const VERIFY_CSP_PLACEHOLDER = "{{verifyConnectOrigins}}";

/** The verify page's directives that hold in every environment. */
const VERIFY_FIXED_DIRECTIVES: readonly string[] = FIXED_DIRECTIVES.flatMap(
  directive =>
    directive === "object-src 'none'"
      ? [directive, "worker-src 'none'"]
      : [directive],
);

/**
 * The verify page's `<meta>` policy: the Wrapper's, with `worker-src 'none'`
 * after `form-action` (the page uses no worker of any kind;
 * specs/verify-page.md, Security, which gives the exact string).
 */
export const VERIFY_META_CONTENT_SECURITY_POLICY: string =
  META_DIRECTIVES.flatMap(directive =>
    directive === "form-action 'none'"
      ? [directive, "worker-src 'none'"]
      : [directive],
  ).join("; ");

/**
 * The verify page's header policy. It is never embedded (`frame-ancestors
 * 'none'`) and embeds nothing (`frame-src 'none'`); it connects to its own
 * origin, the verify API, and the RPC endpoints.
 */
export const VERIFY_CONTENT_SECURITY_POLICY_TEMPLATE: string = [
  ...VERIFY_FIXED_DIRECTIVES,
  `connect-src 'self' ${VERIFY_CSP_PLACEHOLDER}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

/** The verify page's response headers: its own policy, the Wrapper's rest. */
export const verifyHeaders = (): Readonly<Record<string, string>> =>
  Object.freeze({
    ...wrapperHeaders(),
    "Content-Security-Policy": VERIFY_CONTENT_SECURITY_POLICY_TEMPLATE,
  });

/** The path pattern of the Wrapper's headers and the verify page's. */
export const WRAPPER_HEADERS_PATH = "/*";
export const VERIFY_HEADERS_PATH = "/verify/*";

/**
 * The headers file of the release bundle (`headers.json`): the headers by path
 * pattern. The more specific pattern, `/verify/*`, replaces the Wrapper's
 * headers for the verify page, it does not add to them.
 */
export const headersFile = (): Readonly<
  Record<string, Readonly<Record<string, string>>>
> =>
  Object.freeze({
    [WRAPPER_HEADERS_PATH]: wrapperHeaders(),
    [VERIFY_HEADERS_PATH]: verifyHeaders(),
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
