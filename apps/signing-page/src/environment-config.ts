// The signing page's configuration document (specs/signing-page.md, SP-3):
// `environment`, `wrapperOrigins`, and the optional `acceptPendingNotices`,
// and no other field. Each origin of `wrapperOrigins` is written as
// `URL.origin` serializes it, `https:` (or `http:` on a loopback host in
// `local` only), distinct, and never the page's own origin.
// `acceptPendingNotices: true` is refused with `environment: "production"`, so
// the page never signs a `pending` notice in production. Each issue names the
// field, never a value. Pure and import-free: the Pages configuration job runs
// it too (SP-15, `config-check-cli.ts`).

export type SignerEnvironment = "production" | "preview" | "local";

/** The validated document. */
export type SignerConfig = {
  readonly environment: SignerEnvironment;
  /** The Wrapper origins the page serves, in the document's order. */
  readonly wrapperOrigins: readonly string[];
  /** Whether a `pending` notice may be signed (SP-7); `false` when absent. */
  readonly acceptPendingNotices: boolean;
};

/** Why a document was refused. */
export type SignerConfigIssueCode =
  /** A top-level field the schema does not list. */
  | "unknown-field"
  /** `environment` is missing or not one of the three values. */
  | "invalid-environment"
  /** `wrapperOrigins` is missing, not a list, empty, or has a malformed entry. */
  | "invalid-wrapper-origins"
  /** `wrapperOrigins` holds the page's own origin. */
  | "overlapping-origins"
  /** `acceptPendingNotices` is present and not a boolean. */
  | "invalid-accept-pending-notices"
  /** `acceptPendingNotices: true` with `environment: "production"`. */
  | "pending-notices-in-production";

export type SignerConfigIssue = {
  readonly code: SignerConfigIssueCode;
  /** The field, as a dotted path (a list entry by its index). */
  readonly field: string;
};

export type SignerConfigResult =
  | { readonly ok: true; readonly config: SignerConfig }
  | { readonly ok: false; readonly issues: readonly SignerConfigIssue[] };

/** Every top-level field of the document; any other is refused. */
export const SIGNER_CONFIG_FIELDS: readonly string[] = Object.freeze([
  "environment",
  "wrapperOrigins",
  "acceptPendingNotices",
]);

const ENVIRONMENTS: ReadonlySet<string> = new Set([
  "production",
  "preview",
  "local",
]);
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEnvironment = (value: unknown): value is SignerEnvironment =>
  typeof value === "string" && ENVIRONMENTS.has(value);

/** Whether `value` is one origin the page may serve, written exactly. */
const isWrapperOrigin = (value: unknown, local: boolean): boolean => {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  const url = new URL(value);
  if (url.origin !== value) return false;
  return (
    url.protocol === "https:" ||
    (local && url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname))
  );
};

const wrapperOriginIssues = (
  value: unknown,
  local: boolean,
  ownOrigin: string,
): SignerConfigIssue[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return [{ code: "invalid-wrapper-origins", field: "wrapperOrigins" }];
  }
  const entries: readonly unknown[] = value;
  const seen = new Set<unknown>();
  return entries.flatMap((entry, index): SignerConfigIssue[] => {
    const field = `wrapperOrigins.${String(index)}`;
    const repeated = seen.has(entry);
    seen.add(entry);
    if (!isWrapperOrigin(entry, local) || repeated) {
      return [{ code: "invalid-wrapper-origins", field }];
    }
    return entry === ownOrigin ? [{ code: "overlapping-origins", field }] : [];
  });
};

/**
 * Validates the document against the page's own origin (`location.origin`).
 * Never throws; a value that is not an object refuses every required field.
 */
export const validateSignerConfig = (
  document: unknown,
  ownOrigin: string,
): SignerConfigResult => {
  const fields = isRecord(document) ? document : {};
  const issues: SignerConfigIssue[] = [];
  for (const field of Object.keys(fields)) {
    if (!SIGNER_CONFIG_FIELDS.includes(field)) {
      issues.push({ code: "unknown-field", field });
    }
  }
  const environment = fields["environment"];
  if (!isEnvironment(environment)) {
    issues.push({ code: "invalid-environment", field: "environment" });
  }
  const wrapperOrigins = fields["wrapperOrigins"];
  issues.push(
    ...wrapperOriginIssues(wrapperOrigins, environment === "local", ownOrigin),
  );
  const accept = fields["acceptPendingNotices"];
  if (accept !== undefined && typeof accept !== "boolean") {
    issues.push({
      code: "invalid-accept-pending-notices",
      field: "acceptPendingNotices",
    });
  }
  if (accept === true && environment === "production") {
    issues.push({
      code: "pending-notices-in-production",
      field: "acceptPendingNotices",
    });
  }
  if (issues.length > 0 || !isEnvironment(environment)) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    config: Object.freeze({
      environment,
      wrapperOrigins: Object.freeze([...(wrapperOrigins as readonly string[])]),
      acceptPendingNotices: accept === true,
    }),
  };
};
