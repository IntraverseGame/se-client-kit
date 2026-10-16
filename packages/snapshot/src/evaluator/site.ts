// The shared vocabulary of the evaluator: issues, the evaluation context, the
// place a keyword is evaluated at, and the JSON shape checks.

/** One failed keyword: where in the document, where in the schema, and which. */
export type ValidationIssue = {
  /** JSON Pointer (RFC 6901) to the failing value in the document. */
  readonly instancePath: string;
  /** JSON Pointer to the failing keyword in the schema document. */
  readonly schemaPath: string;
  /** The failing keyword, `unsupported` outside the profile, or `evaluation`. */
  readonly keyword: string;
};

export type JsonObject = Readonly<Record<string, unknown>>;

/** Where a keyword is evaluated, and where its failures go. */
export type Site = {
  readonly schemaPath: string;
  readonly instancePath: string;
  /** Collect mode when defined; check mode (stop at the first failure) when not. */
  readonly issues: ValidationIssue[] | undefined;
};

export type Resolved = { readonly schema: unknown; readonly path: string };

export type Context = {
  readonly root: unknown;
  readonly patterns: Map<string, RegExp | undefined>;
  readonly refs: Map<string, Resolved | undefined>;
  /** Evaluates a subschema; how the applicators recurse. */
  readonly evaluate: (
    schema: unknown,
    instance: unknown,
    site: Site,
  ) => boolean;
};

export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(item => typeof item === "string");

export const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/** RFC 6901 escaping of one reference token. */
export const escapeToken = (token: string): string =>
  token.replaceAll("~", "~0").replaceAll("/", "~1");

export const unescapeToken = (token: string): string =>
  token.replaceAll("~1", "/").replaceAll("~0", "~");

/** Records a failure (in collect mode) and returns `false`. */
export const report = (
  site: Site,
  keyword: string,
  instancePath?: string,
): false => {
  site.issues?.push({
    instancePath: instancePath ?? site.instancePath,
    schemaPath: site.schemaPath,
    keyword,
  });
  return false;
};

/** A keyword outside the profile, or a malformed keyword value: fail closed. */
export const unsupported = (site: Site): false => report(site, "unsupported");

/** The site of a child keyword, and optionally of a child instance. */
export const child = (
  site: Site,
  schemaToken: string,
  instanceToken?: string,
): Site => ({
  schemaPath: `${site.schemaPath}/${escapeToken(schemaToken)}`,
  instancePath:
    instanceToken === undefined
      ? site.instancePath
      : `${site.instancePath}/${escapeToken(instanceToken)}`,
  issues: site.issues,
});

/** The same schema location applied to a child instance. */
export const member = (site: Site, instanceToken: string): Site => ({
  schemaPath: site.schemaPath,
  instancePath: `${site.instancePath}/${escapeToken(instanceToken)}`,
  issues: site.issues,
});

/** The same place, evaluated in check mode: failures are not collected. */
export const quiet = (site: Site): Site => ({ ...site, issues: undefined });

/** In check mode the first failure decides; in collect mode evaluation goes on. */
export const stops = (valid: boolean, site: Site): boolean =>
  !valid && site.issues === undefined;
