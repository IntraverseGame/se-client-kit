// A re-export whose every name is marked `type` inline
// (`export { type A, type B } from "./x.ts";`) is written `export type { A, B }
// from "./x.ts";` instead (AGENTS.md, "type-only imports marked as such"). Once
// the types are erased, the inline form leaves an empty `export {} from`, which
// still loads the module: the same side effect `no-import-type-side-effects`
// refuses for `import { type A }`. oxlint has no rule for the export form (its
// `consistent-type-exports` needs type information, which is not enabled), so
// this check covers it. It matters most for the reference game, whose only kit
// import is the type-only controller subpath, which a runtime import cannot
// resolve.

/** `export { ... } from "..."`, with its specifier list and source. */
const RE_EXPORT = /export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/gu;

/** `text` without `//` line comments and block comments. */
const withoutComments = (text: string): string =>
  text.replaceAll(/\/\*[\s\S]*?\*\//gu, "").replaceAll(/\/\/.*$/gmu, "");

export const isSourceFile = (path: string): boolean =>
  /\.[cm]?tsx?$/u.test(path) && !path.endsWith(".d.ts");

/** One message per all-inline-type re-export in `files`. */
export const findInlineTypeReExports = (
  files: ReadonlyMap<string, string>,
): string[] => {
  const problems: string[] = [];
  for (const [path, text] of files) {
    for (const match of withoutComments(text).matchAll(RE_EXPORT)) {
      const names = (match[1] ?? "")
        .split(",")
        .map(name => name.trim())
        .filter(name => name !== "");
      if (names.length > 0 && names.every(name => /^type\s/u.test(name))) {
        problems.push(
          `${path}: \`export { type ... } from "${match[2] ?? ""}"\` re-exports only types; write \`export type { ... }\``,
        );
      }
    }
  }
  return problems.toSorted();
};
