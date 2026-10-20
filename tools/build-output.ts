// Checks of what a build put in `dist/`
// (specs/client-kit/the-contracts-package.md and
// specs/client-kit/supply-chain.md): every `exports` target exists, only the
// intended file types, no test files or build state, and no vector (the
// `contracts` test-only entry) reachable from the `contracts` runtime entry or
// mentioned by another package's output.
//
// tsdown bundles, so a vector has no file of its own. The `contracts` runtime
// entry is checked as an allow-list: every chunk it loads (found through the
// import graph) must have a source map whose sources all lie in the declared
// runtime source set (`src/index.ts`, `src/schemas/`, `src/generated/`); a
// vector, the test-only entry, and any module shared with them that lives
// anywhere else fails by construction. The Wrapper bundle is covered by a Vite
// resolve guard at build time (apps/wrapper), not here: Vite inlines data and
// drops specifiers, so a text scan of its output cannot prove anything; the scan
// below is only an extra layer for a stray reference.

export type Dist = {
  /** `contracts`, `shell`, `wrapper`, and so on (the directory name). */
  readonly name: string;
  /** Files of `dist/`, by path relative to it, with `/` separators. */
  readonly files: ReadonlyMap<string, string>;
  /**
   * The `package.json` `exports` targets (`./dist/index.js`, ...), when the
   * package publishes any. Each must exist in `dist/`.
   */
  readonly exportTargets?: readonly string[];
};

/** The entries of the `contracts` package, as built into `dist/`. */
export const CONTRACTS_RUNTIME_ENTRY = "index.js";
export const CONTRACTS_RUNTIME_DECLARATION = "index.d.ts";
export const CONTRACTS_TEST_ONLY_ENTRY = "testing.js";
export const CONTRACTS_TEST_ONLY_DECLARATION = "testing.d.ts";

/**
 * The sources a `contracts` runtime chunk may contain, relative to the package:
 * the entry file and the two runtime directories. Vectors and the test-only
 * entry are `src/testing.ts` and `src/vectors/`, and nothing else belongs to
 * the runtime graph.
 */
const RUNTIME_SOURCE = /^src\/(?:index\.ts|(?:schemas|generated)\/.+)$/u;

const PACKAGE_FILE = /\.(?:js|js\.map|d\.ts)$/u;
/** The apps Vite builds into a page (HTML, CSS, assets), not a library. */
const VITE_APPS: ReadonlySet<string> = new Set([
  "wrapper",
  "verify",
  "reference-game",
]);
const FORBIDDEN_FILE = /(?:\.(?:test|spec)\.|tsbuildinfo)/u;
/** A declaration file must not point at a map that is not there. */
const DECLARATION_MAP_COMMENT = /\/\/# sourceMappingURL=/u;
/**
 * A relative specifier after `from` or `import`/`import(`: quoted, or a
 * template literal without a substitution. A computed one
 * (`import(\`./${name}.js`)`, string concatenation) is not followed.
 */
const IMPORT_SPECIFIER =
  /(?:from|import)\s*\(?\s*(?:["'](\.\.?\/[^"']+)["']|`(\.\.?\/(?:[^`$\\]|\$(?!\{))+)`)/gu;
/**
 * A line a chunk may have without a source map: blank, a comment, or a pure
 * re-export or import (`export * from`, `export { ... } from`, `import "..."`,
 * `import ... from`). Any other line, `export const` and `export { x }` of a
 * local included, is code.
 */
const LINKING_LINE =
  /^\s*(?:\/\/.*|(?:import\s+(?:[\w$*{},\s]+\s+from\s+)?|export\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+)["'][^"']+["']\s*;?)?\s*$/u;

/** A bare import of a `contracts` subpath other than the runtime entry. */
const CONTRACTS_SUBPATH = /["']@intraverse\/se-client-contracts\/[^"']+["']/u;

/** Resolve `specifier` against the directory of the file `from`. */
const resolveRelative = (from: string, specifier: string): string => {
  const parts = from.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
};

/** The files an entry loads, itself included, following relative imports. */
export const reachableFrom = (
  entry: string,
  files: ReadonlyMap<string, string>,
  declarations = false,
): Set<string> => {
  const seen = new Set<string>();
  const queue = [entry];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    const text = files.get(next);
    if (seen.has(next) || text === undefined) continue;
    seen.add(next);
    for (const match of text.matchAll(IMPORT_SPECIFIER)) {
      const target = resolveRelative(next, match[1] ?? match[2] ?? "");
      // A declaration file imports `./x.js` and means `./x.d.ts`.
      queue.push(declarations ? target.replace(/\.js$/u, ".d.ts") : target);
    }
  }
  return seen;
};

const checkExportTargets = (dist: Dist): string[] => {
  const problems: string[] = [];
  for (const target of dist.exportTargets ?? []) {
    const path = target.replace(/^\.\/dist\//u, "");
    if (path === target) {
      problems.push(
        `${dist.name}: export target ${target} is not under ./dist`,
      );
    } else if (!dist.files.has(path)) {
      problems.push(`${dist.name}: export target ${target} does not exist`);
    }
  }
  return problems;
};

const checkFileTypes = (dist: Dist): string[] => {
  const problems: string[] = [];
  for (const path of dist.files.keys()) {
    if (FORBIDDEN_FILE.test(path)) {
      problems.push(
        `${dist.name}/dist/${path}: a test file or build state must not be in dist`,
      );
    } else if (!VITE_APPS.has(dist.name) && !PACKAGE_FILE.test(path)) {
      problems.push(
        `${dist.name}/dist/${path}: not an intended output (.js, its .js.map, and .d.ts)`,
      );
    } else if (
      path.endsWith(".d.ts") &&
      DECLARATION_MAP_COMMENT.test(dist.files.get(path) ?? "")
    ) {
      problems.push(
        `${dist.name}/dist/${path}: a declaration file must not reference a source map`,
      );
    }
  }
  return problems;
};

const checkNoVectorReference = (dist: Dist): string[] => {
  const problems: string[] = [];
  for (const [path, text] of dist.files) {
    if (text.includes("contracts/testing")) {
      problems.push(
        `${dist.name}/dist/${path}: mentions the contracts test-only entry`,
      );
    }
  }
  return problems;
};

/**
 * The package-relative path of a source-map entry (`../src/x.ts` ->
 * `src/x.ts`), or undefined when it climbs above the package root. A source is
 * never clamped to the root: an escape fails.
 */
const packageRelative = (
  mapPath: string,
  source: string,
): string | undefined => {
  const parts = mapPath.split("/").slice(0, -1);
  for (const part of source.split("/")) {
    if (part === "..") {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else if (part !== "." && part !== "") parts.push(part);
  }
  return parts.join("/");
};

const parseMap = (
  map: string,
): { sources: string[]; sourceRoot: unknown } | undefined => {
  try {
    const parsed = JSON.parse(map) as {
      sources?: unknown;
      sourceRoot?: unknown;
    };
    return {
      sources: Array.isArray(parsed.sources)
        ? parsed.sources.filter(
            (source): source is string => typeof source === "string",
          )
        : [],
      sourceRoot: parsed.sourceRoot,
    };
  } catch {
    return undefined;
  }
};

const checkContractsChunk = (dist: Dist, path: string): string[] => {
  const where = `contracts/dist/${path}`;
  const text = dist.files.get(path) ?? "";
  const problems: string[] = [];
  if (CONTRACTS_SUBPATH.test(text)) {
    problems.push(
      `${where}: imports a contracts subpath by name (only the runtime entry may be loaded)`,
    );
  }
  const map = dist.files.get(`${path}.map`);
  if (map === undefined) {
    // A chunk of pure re-exports has no code of its own, so no map is written.
    // Block comments are not recognized: a line that is not blank, a line
    // comment, or a pure re-export or import counts as code (fail closed), so a
    // `/*` cannot be used to hide code from the check.
    const hasCode = !text.split("\n").every(line => LINKING_LINE.test(line));
    return hasCode
      ? [...problems, `${where}: has code but no source map to verify it`]
      : problems;
  }
  const parsed = parseMap(map);
  if (parsed === undefined)
    return [...problems, `${where}: its source map is not valid JSON`];
  if (
    typeof parsed.sourceRoot === "string" &&
    !["", "."].includes(parsed.sourceRoot)
  ) {
    problems.push(
      `${where}: its source map has a sourceRoot, which the check does not resolve`,
    );
  }
  if (parsed.sources.length === 0) {
    problems.push(`${where}: has code but its source map lists no source`);
  }
  for (const source of parsed.sources) {
    const relative = packageRelative(`dist/${path}.map`, source);
    if (relative === undefined) {
      problems.push(`${where}: a source (${source}) lies outside the package`);
    } else if (!RUNTIME_SOURCE.test(relative)) {
      problems.push(
        `${where}: a chunk the runtime entry loads contains ${relative}, which is outside the runtime sources (src/index.ts, src/schemas/, src/generated/)`,
      );
    }
  }
  return problems;
};

const checkContractsRuntimeEntry = (dist: Dist): string[] => {
  if (!dist.files.has(CONTRACTS_RUNTIME_ENTRY)) {
    return [`contracts/dist/${CONTRACTS_RUNTIME_ENTRY} is missing`];
  }
  const problems: string[] = [];
  const reachable = reachableFrom(CONTRACTS_RUNTIME_ENTRY, dist.files);
  if (reachable.has(CONTRACTS_TEST_ONLY_ENTRY)) {
    problems.push(
      `contracts/dist/${CONTRACTS_RUNTIME_ENTRY} loads the test-only entry ${CONTRACTS_TEST_ONLY_ENTRY}`,
    );
  }
  for (const path of reachable) {
    problems.push(...checkContractsChunk(dist, path));
  }
  const declarations = reachableFrom(
    CONTRACTS_RUNTIME_DECLARATION,
    dist.files,
    true,
  );
  if (declarations.has(CONTRACTS_TEST_ONLY_DECLARATION)) {
    problems.push(
      `contracts/dist/${CONTRACTS_RUNTIME_DECLARATION} loads ${CONTRACTS_TEST_ONLY_DECLARATION}`,
    );
  }
  return problems;
};

/** The problems found in the given `dist/` directories; empty means clean. */
export const findBuildOutputProblems = (dists: readonly Dist[]): string[] => {
  return dists.flatMap(dist => [
    ...checkExportTargets(dist),
    ...checkFileTypes(dist),
    ...(dist.name === "contracts"
      ? checkContractsRuntimeEntry(dist)
      : checkNoVectorReference(dist)),
  ]);
};
