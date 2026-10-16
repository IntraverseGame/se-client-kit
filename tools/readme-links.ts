// Every link in a README, in every form it can take, and whether it is allowed.
// Only absolute links into this repository (https://github.com/IntraverseGame/
// se-client-kit/blob/main/... or /tree/main/...) and anchors inside the README
// itself are allowed, and a repository link must point at a path that is tracked
// or at least not ignored.

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  isIgnored,
  parseGitignore,
  UninterpretableGitignoreLine,
} from "./gitignore.ts";

const REPOSITORY_LINK =
  /^https:\/\/github\.com\/IntraverseGame\/se-client-kit\/(?:blob|tree)\/main\/([^#?]*)(?:#(.*))?$/iu;

/** Attributes whose value is a URL (or, for `srcset`, a list of them). */
const URL_ATTRIBUTES =
  "href|src|srcset|data|poster|action|formaction|cite|background|longdesc|usemap|ping|manifest|xlink:href";

// A fenced code block that closes: an opening fence of three or more backticks
// (no backtick in its info string, or it is an inline code span) or tildes, up to
// three spaces of indentation, and the first later line that holds the same
// character at least as often. An unclosed fence is not stripped (fail closed:
// its links stay visible).
const FENCED_BLOCKS = [
  /^ {0,3}(`{3,})[^`\n]*\n(?:[\s\S]*?\n)? {0,3}\1`*[ \t]*(?:\n|$)/gmu,
  /^ {0,3}(~{3,})[^\n]*\n(?:[\s\S]*?\n)? {0,3}\1~*[ \t]*(?:\n|$)/gmu,
] as const;

// An inline code span: a backtick run and the next run of exactly the same
// length, without a blank line between them (CommonMark). A run with no match
// is literal text and stays.
const CODE_SPAN = /(?<!`)(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?(?<!`)\1(?!`)/gu;

/**
 * The text of a README without the code in it, so that `fns[i](event)` written
 * as code is not read as a link. A fenced block is dropped; an inline code span
 * becomes a placeholder rather than nothing, so a destination written as code
 * (a backtick-quoted path inside the parentheses, which renderers do treat as a
 * link) still shows up as a (relative) destination and fails. Indented code
 * blocks are not recognized: links in them are still extracted (fail closed).
 */
const withoutCode = (text: string): string =>
  FENCED_BLOCKS.reduce(
    (rest, fence) => rest.replaceAll(fence, "\n"),
    text,
  ).replaceAll(CODE_SPAN, "CODE-SPAN");

/** The heading anchors of a Markdown file, the way GitHub builds them. */
export const anchorsOf = (text: string): Set<string> =>
  new Set(
    text
      .split("\n")
      .filter(line => /^#{1,6} /u.test(line))
      .map(line =>
        line
          .replace(/^#+ /u, "")
          .toLowerCase()
          .replaceAll("`", "")
          .replaceAll(/[^a-z0-9 _-]/gu, "")
          .replaceAll(" ", "-"),
      ),
  );

const srcsetUrls = (value: string): string[] =>
  value
    .split(",")
    .map(entry => entry.trim().split(/\s+/u)[0] ?? "")
    .filter(url => url !== "");

/** Every URL a README contains: Markdown, reference definitions, HTML, bare. */
export const linksOf = (text: string): string[] => {
  const found: string[] = [];
  // Inline links and images, with a `<...>` or a plain destination (one level of
  // balanced parentheses, spaces and newlines allowed around it) and an optional
  // title. Every destination is a link, whatever it looks like: a renderer
  // resolves `README`, `docs`, `page#sec`, and `%2e%2fa` relative to the page.
  // Code is removed first, so `fns[i](event)` written as code is not one.
  for (const match of withoutCode(text).matchAll(
    /\]\(\s*(?:<([^>\n]*)>|((?:[^\s()<]|\([^\s()]*\))*))/gu,
  )) {
    found.push(match[1] ?? match[2] ?? "");
  }
  // Reference definitions: [label]: destination
  for (const match of text.matchAll(
    /^\s{0,3}\[[^\]]+\]:\s*(?:<([^>]*)>|(\S+))/gmu,
  )) {
    found.push(match[1] ?? match[2] ?? "");
  }
  // Autolinks: <scheme:...> and <www....>
  for (const match of text.matchAll(
    /<((?:[a-z][a-z\d+.-]*:|www\.|\/\/)[^>\s]*)>/giu,
  )) {
    found.push(match[1] ?? "");
  }
  // HTML attributes, in any quoting.
  const attribute = new RegExp(
    String.raw`\b(${URL_ATTRIBUTES})\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`,
    "giu",
  );
  for (const match of text.matchAll(attribute)) {
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    found.push(
      ...(match[1]?.toLowerCase() === "srcset" ? srcsetUrls(value) : [value]),
    );
  }
  // url() in style attributes and <style> blocks, and a meta refresh target.
  for (const match of text.matchAll(
    /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')|<style\b[^>]*>([\s\S]*?)<\/style>/giu,
  )) {
    const css = match[1] ?? match[2] ?? match[3] ?? "";
    for (const inner of css.matchAll(/url\(\s*(["']?)([^)"']+)\1\s*\)/giu)) {
      found.push(inner[2] ?? "");
    }
  }
  for (const match of text.matchAll(
    /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/giu,
  )) {
    const refresh = /^\s*\d+\s*[;,]\s*url\s*=\s*['"]?(.+?)['"]?\s*$/iu.exec(
      match[1] ?? match[2] ?? "",
    );
    if (refresh?.[1] !== undefined) found.push(refresh[1]);
  }
  // Bare URLs and hosts in prose or code, case-insensitively.
  for (const match of text.matchAll(
    /\b(?:https?|ftp|file|javascript|data|mailto|vbscript):[^\s<>)"'`\]]+|\bwww\.[^\s<>)"'`\]]+/giu,
  )) {
    found.push(match[0]);
  }
  return [...new Set(found.filter(url => url !== ""))];
};

const isTrackedByGit = (root: string, path: string): boolean => {
  const listed = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-per-directory=.gitignore",
      "--",
      path,
    ],
    { cwd: root, encoding: "utf8" },
  );
  return listed.trim() !== "";
};

/**
 * Without git: a path through a symlinked directory is not tracked (git lists
 * the symlink, never the files behind it), and a nested .gitignore is not
 * interpreted, so a path below one fails closed.
 */
const throughSymlinkOrNestedIgnore = (root: string, path: string): boolean => {
  const segments = path.split("/");
  for (let length = 1; length <= segments.length; length += 1) {
    const prefix = join(root, ...segments.slice(0, length));
    if (
      lstatSync(prefix, { throwIfNoEntry: false })?.isSymbolicLink() === true
    ) {
      return true;
    }
    if (length < segments.length && existsSync(join(prefix, ".gitignore"))) {
      return true;
    }
  }
  return false;
};

const HARD_IGNORED =
  /(?:^|\/)(?:dist|node_modules|\.wireit)(?:\/|$)|\.tsbuildinfo$/u;

/**
 * Whether `path` is tracked, or not ignored by .gitignore. With a `.git`
 * directory, `git ls-files` decides (tracked files, and untracked files that
 * .gitignore does not ignore: a new file added in the same change is normal).
 * Without one, the repository's own .gitignore is applied by a small matcher
 * that fails closed on a line it cannot interpret, plus a hard rule that
 * `dist/`, `node_modules/`, `.wireit/`, and `*.tsbuildinfo` are never links.
 */
export const isTrackedOrNotIgnored = (root: string, path: string): boolean => {
  if (HARD_IGNORED.test(path)) return false;
  if (existsSync(join(root, ".git"))) return isTrackedByGit(root, path);
  if (throughSymlinkOrNestedIgnore(root, path)) return false;
  const ignore = join(root, ".gitignore");
  if (!existsSync(ignore)) return true;
  try {
    return !isIgnored(parseGitignore(readFileSync(ignore, "utf8")), path);
  } catch (error) {
    if (error instanceof UninterpretableGitignoreLine) return false;
    throw error;
  }
};

const anchorProblem = (
  file: string,
  anchor: string | undefined,
  link: string,
): string[] => {
  if (anchor === undefined || !file.endsWith(".md")) return [];
  return anchorsOf(readFileSync(file, "utf8")).has(anchor)
    ? []
    : [`${link}: the heading does not exist in the target`];
};

const ONLY_REPOSITORY =
  "only absolute links into this repository are allowed (https://github.com/IntraverseGame/se-client-kit/blob/main/... or /tree/main/...)";

/** The problems with one link; empty means it is allowed. */
export const checkLink = (
  link: string,
  readme: string,
  root: string,
): string[] => {
  if (link.startsWith("#")) {
    return anchorsOf(readme).has(link.slice(1))
      ? []
      : [`${link}: the heading does not exist in this README`];
  }
  const repository = REPOSITORY_LINK.exec(link);
  if (repository === null) {
    const scheme = /^([a-z][a-z\d+.-]*):/iu.exec(link)?.[1]?.toLowerCase();
    if (scheme === undefined) {
      return [
        `${link}: a relative, bare, or protocol-relative link breaks or leaks on the npm package page; ${ONLY_REPOSITORY}`,
      ];
    }
    return scheme === "https" || scheme === "http"
      ? [`${link}: ${ONLY_REPOSITORY}`]
      : [`${link}: a ${scheme}: link is not allowed; ${ONLY_REPOSITORY}`];
  }
  const path = repository[1] ?? "";
  const target = join(root, path);
  if (!existsSync(target)) return [`${link}: the path does not exist`];
  if (!isTrackedOrNotIgnored(root, path)) {
    return [
      `${link}: the path is ignored by .gitignore or is build output, so it is not in the repository`,
    ];
  }
  return statSync(target).isFile()
    ? anchorProblem(target, repository[2], link)
    : [];
};
