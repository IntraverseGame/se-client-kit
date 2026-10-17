// Checks of the type-only subpaths and of the one app that uses one
// (specs/client-kit/packages.md, "The controller types"): `shell` exports the
// `se.controller/1` message types at `@intraverse/se-client-shell/controller`
// for the `reference-game` app, which may depend on nothing else.
//
// A type-only subpath has a `types` condition and nothing else in `exports`, so
// a runtime import of it does not resolve at all. Its declaration file holds
// only type re-exports (`export type { ... }`) and relative imports of the
// declaration chunks they come from, and the JavaScript file the bundler still
// writes beside it is empty, with no source map: no runtime code is behind the
// subpath. The game's bundle is a Vite bundle, which inlines what it imports and
// drops the specifiers, so the proof that it imports no package at run time (a
// kit package or any other) is its build-time resolve guard
// (apps/reference-game/package-import-guard.ts); the scan below is only an
// extra layer: a stray mention of a kit package, or an import of a package
// left in the emitted JavaScript.

/** The subpaths each package MUST declare type-only, by directory name. */
export const REQUIRED_TYPE_ONLY_SUBPATHS: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({ shell: Object.freeze(["./controller"]) });

/** The app whose bundle may name no kit package. */
export const TYPE_ONLY_CONSUMER = "reference-game";

export type TypeOnlyPackage = {
  /** The directory name (`shell`, `reference-game`, ...). */
  readonly name: string;
  /** Files of `dist/`, by path relative to it, with `/` separators. */
  readonly files: ReadonlyMap<string, string>;
  /** The raw `exports` value of its `package.json`. */
  readonly exportsField: unknown;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The subpaths of an `exports` value whose only condition is `types`, mapped to
 * that condition's target (`./controller` -> `./dist/controller.d.ts`).
 */
export const typeOnlySubpaths = (
  exportsField: unknown,
): ReadonlyMap<string, string> => {
  const subpaths = new Map<string, string>();
  if (!isRecord(exportsField)) return subpaths;
  for (const [subpath, conditions] of Object.entries(exportsField)) {
    if (!isRecord(conditions)) continue;
    const keys = Object.keys(conditions);
    const target = conditions["types"];
    if (keys.length === 1 && typeof target === "string") {
      subpaths.set(subpath, target);
    }
  }
  return subpaths;
};

/** `text` without blank lines and full-line `//` comments. */
const withoutComments = (text: string): string =>
  text.replaceAll(/^\s*\/\/.*$/gmu, "").trim();

/**
 * A statement a type-only declaration file may hold: a relative import of a
 * declaration chunk (`import { a as A } from "./x.js"`, `import type` too), or
 * a type re-export (`export type { A }`, from a relative path or not).
 */
const TYPE_ONLY_STATEMENT =
  /^(?:import\s+(?:type\s+)?\{[^}]*\}\s+from\s+"\.\.?\/[^"]+"|export\s+type\s+\{[^}]*\}(?:\s+from\s+"\.\.?\/[^"]+")?)$/u;

const statementsOf = (text: string): string[] =>
  withoutComments(text)
    .split(";")
    .map(statement => statement.replaceAll(/\s+/gu, " ").trim())
    .filter(statement => statement !== "");

/** An emitted module with no code: empty, comments, or `export {};` only. */
const isEmptyModule = (text: string): boolean =>
  ["", "export {};", "export {}"].includes(withoutComments(text));

const checkSubpath = (
  pkg: TypeOnlyPackage,
  subpath: string,
  target: string,
): string[] => {
  const where = `${pkg.name} ${subpath}`;
  const declaration = /^\.\/dist\/(.+)\.d\.ts$/u.exec(target)?.[1];
  if (declaration === undefined) {
    return [`${where}: its types target ${target} is not a ./dist/*.d.ts file`];
  }
  const problems: string[] = [];
  const text = pkg.files.get(`${declaration}.d.ts`);
  if (text === undefined) {
    problems.push(`${where}: ${declaration}.d.ts is missing`);
  } else if (text.includes("/*")) {
    problems.push(
      `${where}: ${declaration}.d.ts has a block comment, which could hide a statement`,
    );
  } else {
    for (const statement of statementsOf(text)) {
      if (!TYPE_ONLY_STATEMENT.test(statement)) {
        problems.push(
          `${where}: ${declaration}.d.ts holds more than type re-exports: \`${statement.slice(0, 60)}\``,
        );
      }
    }
  }
  const script = pkg.files.get(`${declaration}.js`);
  if (script !== undefined && !isEmptyModule(script)) {
    problems.push(
      `${where}: ${declaration}.js has runtime code; a type-only subpath emits an empty module`,
    );
  }
  if (pkg.files.has(`${declaration}.js.map`)) {
    problems.push(
      `${where}: ${declaration}.js has a source map, so it has runtime code`,
    );
  }
  return problems;
};

const checkRequired = (pkg: TypeOnlyPackage): string[] => {
  const declared = typeOnlySubpaths(pkg.exportsField);
  return (REQUIRED_TYPE_ONLY_SUBPATHS[pkg.name] ?? [])
    .filter(subpath => !declared.has(subpath))
    .map(
      subpath =>
        `${pkg.name}: exports ${subpath} must be type-only (a \`types\` condition and nothing else)`,
    );
};

/**
 * A module specifier in emitted JavaScript: after `from`, a bare `import`, or
 * `import(`, quoted.
 */
const SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/gu;

/** A specifier that names a package: not a relative or root-relative path. */
const isPackageSpecifier = (specifier: string): boolean =>
  !specifier.startsWith(".") && !specifier.startsWith("/");

const checkConsumer = (pkg: TypeOnlyPackage): string[] => {
  const problems: string[] = [];
  for (const [path, text] of pkg.files) {
    if (text.includes("@intraverse/se-client-")) {
      problems.push(
        `${pkg.name}/dist/${path}: names a kit package; the game takes only the controller types, which leave no trace in its bundle`,
      );
    }
    if (!path.endsWith(".js")) continue;
    for (const match of text.matchAll(SPECIFIER)) {
      const specifier = match[1] ?? "";
      if (isPackageSpecifier(specifier)) {
        problems.push(
          `${pkg.name}/dist/${path}: imports the package ${specifier}; the game depends on no package at run time`,
        );
      }
    }
  }
  return problems;
};

/** The problems of the type-only subpaths and their consumer; empty is clean. */
export const findTypeOnlyProblems = (
  packages: readonly TypeOnlyPackage[],
): string[] =>
  packages.flatMap(pkg => [
    ...checkRequired(pkg),
    ...[...typeOnlySubpaths(pkg.exportsField)].flatMap(([subpath, target]) =>
      checkSubpath(pkg, subpath, target),
    ),
    ...(pkg.name === TYPE_ONLY_CONSUMER ? checkConsumer(pkg) : []),
  ]);
