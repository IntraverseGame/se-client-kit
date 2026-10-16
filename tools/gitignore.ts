// A small matcher for the repository's own .gitignore, used when there is no
// .git directory (a rsync copy, an unpacked archive) to tell whether a path
// would be ignored. It fails closed: a line it cannot interpret throws, rather
// than being skipped. With a .git directory, `git ls-files` is used instead.

export class UninterpretableGitignoreLine extends Error {}

type Rule = {
  readonly negated: boolean;
  readonly directoryOnly: boolean;
  readonly regex: RegExp;
};

const escapeRegex = (text: string): string =>
  text.replaceAll(/[.+^${}()|\\]/gu, String.raw`\$&`);

/** One glob segment sequence (`*`, `?`, `[...]`, `**`) as a regex source. */
const globToRegex = (glob: string, line: string): string => {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob.charAt(index);
    if (char === "\\") throw new UninterpretableGitignoreLine(line);
    if (char === "*") {
      if (glob.charAt(index + 1) === "*") {
        const before = index === 0 || glob.charAt(index - 1) === "/";
        const after =
          glob.charAt(index + 2) === "/" || index + 2 >= glob.length;
        if (!before || !after) throw new UninterpretableGitignoreLine(line);
        if (glob.charAt(index + 2) === "/") {
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else if (char === "[") {
      const close = glob.indexOf("]", index + 2);
      if (close === -1) throw new UninterpretableGitignoreLine(line);
      const body = glob.slice(index + 1, close).replace(/^!/u, "^");
      source += `[${body}]`;
      index = close;
    } else {
      source += escapeRegex(char);
    }
  }
  return source;
};

const parseLine = (raw: string): Rule | undefined => {
  const line = raw.trimEnd();
  if (line === "" || line.startsWith("#")) return undefined;
  const negated = line.startsWith("!");
  let pattern = negated ? line.slice(1) : line;
  const directoryOnly = pattern.endsWith("/");
  if (directoryOnly) pattern = pattern.slice(0, -1);
  const anchored = pattern.includes("/");
  pattern = pattern.replace(/^\//u, "");
  const source = globToRegex(pattern, line);
  const prefix = anchored ? "^" : "^(?:.*/)?";
  return {
    negated,
    directoryOnly,
    regex: new RegExp(`${prefix}${source}$`, "u"),
  };
};

export const parseGitignore = (text: string): Rule[] =>
  text
    .split("\n")
    .map(line => parseLine(line))
    .filter((rule): rule is Rule => rule !== undefined);

/**
 * Whether `path` (relative, `/`-separated) is ignored: a path is ignored when
 * it or any parent directory is, the last matching rule deciding for each.
 */
export const isIgnored = (rules: readonly Rule[], path: string): boolean => {
  const segments = path.split("/");
  for (let length = 1; length <= segments.length; length += 1) {
    const candidate = segments.slice(0, length).join("/");
    const isDirectory = length < segments.length;
    let ignored = false;
    for (const rule of rules) {
      if (rule.directoryOnly && !isDirectory) continue;
      if (rule.regex.test(candidate)) ignored = !rule.negated;
    }
    if (ignored) return true;
  }
  return false;
};
