// Specifier and name rules shared by the dependency allow-list check: what a
// dependency, an override, or a catalog entry may point at. Everything must be
// resolvable from the registry at an exact version, so the lockfile and the
// minimum release age apply to it; a kit package uses the workspace protocol.
// Git, URL, file, link, `npm:` alias, range, and tag specifiers are rejected.

const EXACT_VERSION =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

export const isExactVersion = (specifier: unknown): specifier is string => {
  return typeof specifier === "string" && EXACT_VERSION.test(specifier);
};

/** Why a specifier is not acceptable for an external package, or undefined. */
export const externalSpecifierProblem = (
  specifier: unknown,
): string | undefined => {
  if (isExactVersion(specifier)) return undefined;
  if (typeof specifier !== "string")
    return "has a specifier that is not a string";
  if (specifier.startsWith("catalog:")) return undefined;
  return `has the specifier "${specifier}", which is not an exact registry version`;
};

/**
 * The package a pnpm or npm override key targets: the last segment of a
 * `parent>child` selector, without its version selector.
 */
export const overrideTarget = (key: string): string => {
  const last = key.split(">").at(-1) ?? key;
  const at = last.indexOf("@", 1);
  return at === -1 ? last : last.slice(0, at);
};

export type SpecifierContext = {
  /** Names the allow-list accepts for an external package. */
  readonly allowedNames: ReadonlySet<string>;
  readonly workspaceNames: ReadonlySet<string>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const checkEntry = (
  where: string,
  name: string,
  specifier: unknown,
  context: SpecifierContext,
  kind: "override" | "catalog",
): string[] => {
  if (context.workspaceNames.has(name)) {
    const isWorkspace =
      typeof specifier === "string" && specifier.startsWith("workspace:");
    return isWorkspace
      ? []
      : [`${where} points a kit package at a non-workspace specifier`];
  }
  const problems: string[] = [];
  if (!context.allowedNames.has(name)) {
    problems.push(
      `${where} names "${name}", which is not on the ADR-001 allow-list`,
    );
  }
  // An override may also reference a direct dependency's version with `$name`.
  const reference =
    kind === "override" &&
    typeof specifier === "string" &&
    specifier.startsWith("$") &&
    context.allowedNames.has(specifier.slice(1));
  const problem = reference ? undefined : externalSpecifierProblem(specifier);
  if (problem !== undefined) problems.push(`${where} ${problem}`);
  return problems;
};

/**
 * Check an `overrides`-style map (`overrides`, `pnpm.overrides`,
 * `resolutions`): every target name must be allowed and every value an exact
 * version. Nested objects (npm's form) are checked recursively; their `.` key
 * is the parent's own value.
 */
export const checkOverrides = (
  where: string,
  overrides: unknown,
  context: SpecifierContext,
): string[] => {
  if (!isRecord(overrides)) return [`${where} is not an object`];
  const problems: string[] = [];
  for (const [key, value] of Object.entries(overrides)) {
    const name = key === "." ? "" : overrideTarget(key);
    const entry = `${where}.${key}`;
    if (isRecord(value)) {
      if (
        name !== "" &&
        !context.allowedNames.has(name) &&
        !context.workspaceNames.has(name)
      ) {
        problems.push(
          `${entry} names "${name}", which is not on the ADR-001 allow-list`,
        );
      }
      problems.push(...checkOverrides(entry, value, context));
    } else if (key === ".") {
      const problem = externalSpecifierProblem(value);
      if (problem !== undefined) problems.push(`${where} ${problem}`);
    } else {
      problems.push(...checkEntry(entry, name, value, context, "override"));
    }
  }
  return problems;
};

/** Check one catalog: name -> specifier. */
export const checkCatalog = (
  where: string,
  catalog: unknown,
  context: SpecifierContext,
): string[] => {
  if (!isRecord(catalog)) return [`${where} is not an object`];
  return Object.entries(catalog).flatMap(([name, specifier]) =>
    checkEntry(`${where}.${name}`, name, specifier, context, "catalog"),
  );
};

/** Check `catalogs`: catalog name -> catalog. */
export const checkCatalogs = (
  where: string,
  catalogs: unknown,
  context: SpecifierContext,
): string[] => {
  if (!isRecord(catalogs)) return [`${where} is not an object`];
  return Object.entries(catalogs).flatMap(([name, catalog]) =>
    checkCatalog(`${where}.${name}`, catalog, context),
  );
};
