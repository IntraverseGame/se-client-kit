// An `index.ts` is a package's or an app's entry point and nothing else
// (AGENTS.md, "Architecture rules"): it lives only at `<packages|apps>/<name>/
// src/index.ts`, and it holds only re-exports (`export ... from "...";`), so
// no logic, declaration, or import hides behind a directory import.
//
// An entry also names each module once. oxlint's `no-duplicate-imports` with
// `includeExports` reports every `export { a, b } from` that names more than
// one binding, so .oxlintrc.json turns `includeExports` off for the entries and
// this check covers duplicate re-exports there instead.

const ENTRY_PATH = /^(?:packages|apps)\/[^/]+\/src\/index\.ts$/u;

/**
 * One re-export statement: `export [type] { a, ... } from "...";` (at least one
 * name; `export {} from` is a side-effect import) or `export * from "...";`
 * (not `export * as ns`, a namespace re-export).
 */
const RE_EXPORT =
  /^export\s+(?:type\s+)?(?:\{\s*[^}\s][^}]*\}|\*)\s+from\s+"([^"]+)";$/u;

/** The empty placeholder of a package with no public API yet. */
const EMPTY_MODULE = "export {};";

/**
 * `text` without its full-line `//` comments. Block comments are not stripped:
 * an entry with `/*` fails, so no comment can hide a statement.
 */
const stripLineComments = (text: string): string =>
  text.replaceAll(/^\s*\/\/.*$/gmu, "");

/** The statements of `text`, split on `;` with whitespace normalized. */
const statementsOf = (text: string): string[] =>
  stripLineComments(text)
    .split(";")
    .map(statement => statement.replaceAll(/\s+/gu, " ").trim())
    .filter(statement => statement !== "")
    .map(statement => `${statement};`);

export const isIndexFile = (path: string): boolean =>
  /(?:^|\/)index\.[cm]?[jt]sx?$/u.test(path);

/**
 * One message per `index` file that is not an entry or holds anything but
 * re-exports.
 */
export const findIndexViolations = (
  files: ReadonlyMap<string, string>,
): string[] => {
  const violations: string[] = [];
  for (const [path, text] of files) {
    if (!isIndexFile(path)) continue;
    if (!ENTRY_PATH.test(path)) {
      violations.push(
        `${path}: an index file is only a package's or app's entry (src/index.ts); name the module after what it holds`,
      );
      continue;
    }
    if (stripLineComments(text).includes("/*")) {
      violations.push(
        `${path}: an entry uses only full-line // comments; a block comment can hide a statement`,
      );
      continue;
    }
    const modules = new Set<string>();
    for (const statement of statementsOf(text)) {
      if (statement === EMPTY_MODULE) continue;
      const module = RE_EXPORT.exec(statement)?.[1];
      if (module === undefined)
        violations.push(
          `${path}: an entry holds only re-exports; move \`${statement.slice(0, 60)}\` into a module`,
        );
      else if (modules.has(module))
        violations.push(
          `${path}: "${module}" is re-exported twice; merge into one statement`,
        );
      else modules.add(module);
    }
  }
  return violations.toSorted();
};
