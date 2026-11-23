// The wallet delegation's two fields of the environment configuration document,
// as the verify page judges them (V-3): it validates them and does not use
// them, since the Wrapper's site serves the page with the Wrapper's document,
// which carries them. The rules are the Wrapper's own
// (`apps/wrapper/src/delegation-config.ts`; specs/wrapper.md, Configuration;
// W-62, W-63, ADR-012), spelled again here because the page cannot import the
// Wrapper, and judged against the page's own origin as the Wrapper judges
// them against its own. `tools/config-parity.test.ts` holds the two alike.
// Each issue names the field, never the value.

/** Why one of the two fields was refused. */
export type DelegationConfigIssueCode =
  /** `signingPageOrigin` is not one serialized `https:` origin. */
  | "invalid-signing-page-origin"
  /** `signingPageOrigin` is on the Wrapper's registrable domain (ADR-012). */
  | "signing-page-same-site"
  /** `signingPageOrigin` is the verify page's, an operator's, or a game's. */
  | "overlapping-origins"
  /** `acceptPendingNotices` is not a boolean. */
  | "invalid-accept-pending-notices"
  /** `acceptPendingNotices: true` with `environment: "production"` (W-63). */
  | "pending-notices-in-production";

export type DelegationConfigIssue = {
  readonly code: DelegationConfigIssueCode;
  readonly field: "signingPageOrigin" | "acceptPendingNotices";
};

/** What the two fields are judged against, as the document gives them. */
export type DelegationConfigContext = {
  /** The page's own origin. */
  readonly ownOrigin: string;
  /** The document's `environment`, as written (not yet validated). */
  readonly environment: unknown;
  /** The document's `verifyBaseUrl`, when it was accepted. */
  readonly verifyBaseUrl: string | undefined;
  readonly gameOrigins: readonly string[] | undefined;
  readonly operatorOrigins: readonly string[] | undefined;
};

export type DelegationConfig = {
  readonly signingPageOrigin?: string;
  readonly acceptPendingNotices?: boolean;
  readonly issues: readonly DelegationConfigIssue[];
};

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);
const IPV4 = /^[0-9]{1,3}(?:\.[0-9]{1,3}){3}$/u;

const urlOf = (value: string): URL | undefined => {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
};

/**
 * A host's comparison key (ADR-007): its last two labels; an IP literal or a
 * host of fewer than two labels is its own key.
 */
const comparisonKey = (host: string): string => {
  if (host.startsWith("[") || IPV4.test(host)) return host;
  const labels = host.split(".");
  return labels.length < 2 ? host : labels.slice(-2).join(".");
};

/** The origin, when `value` is one written exactly as `URL.origin` writes it. */
const readSigningOrigin = (value: unknown, local: boolean): URL | undefined => {
  if (typeof value !== "string") return undefined;
  const url = urlOf(value);
  if (url === undefined || url.origin !== value) return undefined;
  const loopbackHttp =
    url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  return url.protocol === "https:" || (local && loopbackHttp) ? url : undefined;
};

/** Whether the signing page shares the Wrapper's site (ADR-012, W-37). */
const sameSite = (signing: URL, ownOrigin: string, local: boolean): boolean => {
  const own = urlOf(ownOrigin);
  if (own === undefined || signing.origin === own.origin) return true;
  if (
    local &&
    LOOPBACK_HOSTS.has(signing.hostname) &&
    LOOPBACK_HOSTS.has(own.hostname)
  ) {
    return false;
  }
  return comparisonKey(signing.hostname) === comparisonKey(own.hostname);
};

const verifyOrigin = (verifyBaseUrl: string | undefined): string | undefined =>
  verifyBaseUrl === undefined ? undefined : urlOf(verifyBaseUrl)?.origin;

/** Reads the two optional fields of `fields`, the parsed document. */
export const readDelegationConfig = (
  fields: Readonly<Record<string, unknown>>,
  context: DelegationConfigContext,
): DelegationConfig => {
  const issues: DelegationConfigIssue[] = [];
  const local = context.environment === "local";
  let signingPageOrigin: string | undefined;
  if (Object.hasOwn(fields, "signingPageOrigin")) {
    const url = readSigningOrigin(fields["signingPageOrigin"], local);
    if (url === undefined) {
      issues.push({
        code: "invalid-signing-page-origin",
        field: "signingPageOrigin",
      });
    } else if (sameSite(url, context.ownOrigin, local)) {
      issues.push({
        code: "signing-page-same-site",
        field: "signingPageOrigin",
      });
    } else if (
      url.origin === verifyOrigin(context.verifyBaseUrl) ||
      context.operatorOrigins?.includes(url.origin) === true ||
      context.gameOrigins?.includes(url.origin) === true
    ) {
      issues.push({ code: "overlapping-origins", field: "signingPageOrigin" });
    } else {
      signingPageOrigin = url.origin;
    }
  }
  let acceptPendingNotices: boolean | undefined;
  if (Object.hasOwn(fields, "acceptPendingNotices")) {
    const value = fields["acceptPendingNotices"];
    if (typeof value !== "boolean") {
      issues.push({
        code: "invalid-accept-pending-notices",
        field: "acceptPendingNotices",
      });
    } else if (value && context.environment === "production") {
      issues.push({
        code: "pending-notices-in-production",
        field: "acceptPendingNotices",
      });
    } else {
      acceptPendingNotices = value;
    }
  }
  return {
    ...(signingPageOrigin === undefined ? {} : { signingPageOrigin }),
    ...(acceptPendingNotices === undefined ? {} : { acceptPendingNotices }),
    issues,
  };
};
