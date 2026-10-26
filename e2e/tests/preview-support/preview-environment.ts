// The preview mode's variables (RFC-002), read once into one frozen object. A
// pure function of an environment passed as a parameter: it reads no
// `process.env` and does nothing at import, because the `preview-guard` specs
// import it in every fake project (ADR-001: no import-time side effects). Only
// the config and the launcher pass it `process.env`.
//
// A missing or malformed variable throws a `PreviewEnvironmentError` that names
// the variable and a reason from a closed set, and never holds the value: a
// value can be a secret (a path that names a credential, a host with a key).

import { isAbsolute } from "node:path";

/** The variables of the mode, by field. */
export const PREVIEW_VARIABLES = {
  origin: "SE_E2E_PREVIEW_ORIGIN",
  launchCommand: "SE_E2E_PREVIEW_LAUNCH_COMMAND",
  gameOrigin: "SE_E2E_PREVIEW_GAME_ORIGIN",
  allowedOrigins: "SE_E2E_PREVIEW_ALLOWED_ORIGINS",
} as const;

/**
 * The entry marker: set by the launcher (`run-preview.ts`) and by nothing else.
 * The config defines the `preview` project only when it is set. It guards
 * against an accidental run; it is not a security boundary.
 */
export const PREVIEW_ENTRY_VARIABLE = "SE_E2E_PREVIEW_ENTRY";
export const PREVIEW_ENTRY_VALUE = "script";

export type PreviewVariable =
  (typeof PREVIEW_VARIABLES)[keyof typeof PREVIEW_VARIABLES];

/** Why a variable was refused. A closed set: a reason never holds a value. */
export type PreviewEnvironmentReason =
  | "missing"
  | "not-an-origin"
  | "scheme"
  | "wildcard"
  | "not-an-absolute-path"
  | "same-origin-as-preview"
  | "empty-entry";

export class PreviewEnvironmentError extends Error {
  readonly variable: PreviewVariable;
  readonly reason: PreviewEnvironmentReason;

  constructor(variable: PreviewVariable, reason: PreviewEnvironmentReason) {
    super(`${variable} is not usable (${reason})`);
    this.name = "PreviewEnvironmentError";
    this.variable = variable;
    this.reason = reason;
  }
}

/** A source of variables: `process.env`, or a test's own object. */
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export type PreviewEnvironment = {
  /** The origin that serves the Wrapper page and the environment document. */
  readonly origin: string;
  /** The absolute path of the launch hook's executable. */
  readonly launchCommand: string;
  /** The one origin both games run at; the suite serves the game build at it. */
  readonly gameOrigin: string;
  /** The origins the browser may reach: the preview origin, then the listed. */
  readonly allowedOrigins: readonly string[];
};

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

/**
 * Whether `value` is a serialized origin as W-37 says: `https://host[:port]`,
 * or `http:` on a loopback host only; no path, query, fragment, or credentials.
 * Returns why not otherwise.
 */
export const originProblem = (
  value: string,
  { httpsOnly }: { readonly httpsOnly: boolean },
): "not-an-origin" | "scheme" | "wildcard" | undefined => {
  if (value.includes("*")) return "wildcard";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "not-an-origin";
  }
  // `URL.origin` is the serialization: any path, query, fragment, credential,
  // or non-canonical spelling makes it differ from the value.
  if (url.origin === "null" || url.origin !== value) return "not-an-origin";
  if (url.protocol === "https:") return undefined;
  const loopbackHttp =
    url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  return loopbackHttp && !httpsOnly ? undefined : "scheme";
};

const requiredOrigin = (
  source: EnvironmentSource,
  variable: PreviewVariable,
  httpsOnly: boolean,
): string => {
  const value = source[variable];
  if (value === undefined || value === "") {
    throw new PreviewEnvironmentError(variable, "missing");
  }
  const problem = originProblem(value, { httpsOnly });
  if (problem !== undefined) {
    throw new PreviewEnvironmentError(variable, problem);
  }
  return value;
};

const requiredCommand = (source: EnvironmentSource): string => {
  const variable = PREVIEW_VARIABLES.launchCommand;
  const value = source[variable];
  if (value === undefined || value === "") {
    throw new PreviewEnvironmentError(variable, "missing");
  }
  // A relative path, a name to find on `PATH`, and a path with a NUL are refused.
  if (!isAbsolute(value) || value.includes("\0")) {
    throw new PreviewEnvironmentError(variable, "not-an-absolute-path");
  }
  return value;
};

const listedOrigins = (source: EnvironmentSource): readonly string[] => {
  const variable = PREVIEW_VARIABLES.allowedOrigins;
  const value = source[variable];
  if (value === undefined || value === "") return [];
  return value.split(",").map(item => {
    if (item === "") throw new PreviewEnvironmentError(variable, "empty-entry");
    const problem = originProblem(item, { httpsOnly: false });
    if (problem !== undefined) {
      throw new PreviewEnvironmentError(variable, problem);
    }
    return item;
  });
};

/** Validates `source` into one frozen object, or throws naming the variable. */
export const parsePreviewEnvironment = (
  source: EnvironmentSource,
): PreviewEnvironment => {
  const origin = requiredOrigin(source, PREVIEW_VARIABLES.origin, false);
  const launchCommand = requiredCommand(source);
  // The Wrapper refuses a loopback game origin outside `local` (T-9).
  const gameOrigin = requiredOrigin(source, PREVIEW_VARIABLES.gameOrigin, true);
  if (gameOrigin === origin) {
    throw new PreviewEnvironmentError(
      PREVIEW_VARIABLES.gameOrigin,
      "same-origin-as-preview",
    );
  }
  const listed = listedOrigins(source);
  return Object.freeze({
    origin,
    launchCommand,
    gameOrigin,
    allowedOrigins: Object.freeze([...new Set([origin, ...listed])]),
  });
};
