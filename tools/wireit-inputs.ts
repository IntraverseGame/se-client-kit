// Checks that a wireit script lists every file its command reads. A script that
// has `files` is skipped when none of them changed (and, with the GitHub cache,
// restored from a cached pass), so an input that is not listed can change
// without the script running again: a test or a build that silently passes.
//
// `matchesFiles` approximates wireit's `files` semantics (fast-glob with dotfiles
// on; a `!` pattern removes what the others matched). It is built on Node's
// `path.matchesGlob`. Limits: extglobs and bracket expressions are not
// interpreted as fast-glob does, matching is case-sensitive, and a pattern is
// applied to a path relative to the script's package directory (`../` segments
// are compared literally). The patterns used in this repository are `**`, `*`,
// `{a,b}`, literal paths, and `!` exclusions, which behave the same in both.

import { matchesGlob } from "node:path";

export type WireitScript = {
  readonly command?: string;
  readonly files?: readonly string[];
  readonly output?: readonly string[];
  readonly packageLocks?: readonly string[];
  readonly dependencies?: readonly string[];
};

/**
 * Node's matcher skips dotfiles for `*` and `**`; wireit does not. A segment
 * that starts with a dot is spelled with a placeholder in both the pattern and
 * the path, so the two agree. `.` and `..` segments are kept.
 */
const dotSafe = (text: string): string =>
  text
    .split("/")
    .map(segment =>
      segment.startsWith(".") && segment !== "." && segment !== ".."
        ? `\u0001${segment.slice(1)}`
        : segment,
    )
    .join("/");

const matches = (pattern: string, path: string): boolean =>
  matchesGlob(dotSafe(path), dotSafe(pattern));

/** Whether `files` (wireit semantics) select `path`, relative to the package. */
export const matchesFiles = (
  files: readonly string[],
  path: string,
): boolean => {
  const included = files.some(
    pattern => !pattern.startsWith("!") && matches(pattern, path),
  );
  const excluded = files.some(
    pattern => pattern.startsWith("!") && matches(pattern.slice(1), path),
  );
  return included && !excluded;
};

/**
 * The problems of one script: it has no `files` although it has a command, it
 * does not list the lock file, or a path it reads is not selected. `required`
 * are the paths the command reads, relative to the package.
 */
export const findInputGaps = (
  name: string,
  script: WireitScript | undefined,
  required: readonly string[],
): string[] => {
  if (script?.files === undefined) {
    return [`${name}: has no files, so it is not an incremental script`];
  }
  const problems: string[] = [];
  if (script.packageLocks?.includes("pnpm-lock.yaml") !== true) {
    problems.push(`${name}: does not list pnpm-lock.yaml in packageLocks`);
  }
  for (const path of required) {
    if (!matchesFiles(script.files, path)) {
      problems.push(`${name}: the command reads ${path}, which files omits`);
    }
  }
  return problems;
};
