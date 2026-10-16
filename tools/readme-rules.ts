// Rules for the README.md of every package and app
// (specs/client-kit/packages.md). A package README is public documentation: npm renders it on the
// package page, and it is read by someone who has never seen this repository. It
// is written for a consumer, its links stay inside this repository and work on
// npm, and it holds no contributor or agent process. The check is hermetic: it
// reads only the worktree (and runs `git ls-files` when there is a .git), never
// the network.

import { checkLink, linksOf } from "./readme-links.ts";
import { foldForMatching } from "./readme-text.ts";

export type ReadmeInput = {
  readonly text: string;
  /** The package name, from its package.json. */
  readonly name: string;
  readonly kind: "package" | "app";
  /** Whether the package.json says `"private": true`. */
  readonly isPrivate: boolean;
  /** The repository root, where link targets are looked up. */
  readonly root: string;
};

/**
 * Contributor, build, and agent-process terms that do not belong in a README a
 * consumer reads. They live in CONTRIBUTING.md and the specification.
 */
export const FORBIDDEN_TERMS: readonly string[] = [
  "wireit",
  "tsdown",
  "oxlint",
  "oxfmt",
  "stylelint",
  "check:build-output",
  "check:deps",
  "check:contracts",
  "pnpm check",
  "pnpm --filter",
  "reviewer agent",
  "AGENTS.md",
  "CLAUDE.md",
  "allowBuilds",
  "lifecycle script",
  "localhost",
  "#12",
];

/** A status line that says there is no real code behind the text yet. */
const UNIMPLEMENTED_STATUS = /no public api yet|empty entry/iu;
const SPECIFIED_NOT_IMPLEMENTED = /specified, not implemented yet/iu;

/** A term in folded text; `#12` must not match `#123` or `#12abc`. */
const mentions = (folded: string, term: string): boolean =>
  term.startsWith("#")
    ? new RegExp(`(?<![\\w#])${term}(?!\\w)`, "u").test(folded)
    : folded.includes(term);

/** The prose of a README: without fenced code, inline code, and HTML comments. */
const proseOf = (text: string): string =>
  text
    .replaceAll(/^(```|~~~)[\s\S]*?^\1/gmu, "")
    .replaceAll(/`[^`\n]*`/gu, "")
    .replaceAll(/<!--[\s\S]*?-->/gu, "");

const checkWords = (text: string): string[] => {
  const problems: string[] = [];
  const folded = foldForMatching(text);
  if (/\b(?:todo|fixme|xxx)\b/u.test(folded)) {
    problems.push("contains TODO, FIXME, or XXX");
  }
  for (const term of FORBIDDEN_TERMS) {
    if (mentions(folded, foldForMatching(term))) {
      problems.push(
        `mentions "${term}", which belongs in CONTRIBUTING.md or the specification`,
      );
    }
  }
  return problems;
};

const checkLinks = (input: ReadmeInput): string[] => {
  const links = linksOf(input.text);
  const problems =
    links.length === 0 ? ["has no link to the specification"] : [];
  for (const link of links) {
    problems.push(
      ...checkLink(link, input.text, input.root).map(
        message => `link ${message}`,
      ),
    );
  }
  return problems;
};

/** The problems found in one README; empty means it follows the rules. */
export const findReadmeProblems = (input: ReadmeInput): string[] => {
  const problems: string[] = [];
  if (!input.text.includes(`\`${input.name}\``)) {
    problems.push(`does not name the package as \`${input.name}\``);
  }
  if (input.kind === "package") {
    if (!input.text.includes(`pnpm add ${input.name}`)) {
      problems.push(`has no install line (pnpm add ${input.name})`);
    }
    if (input.isPrivate && !/not published to npm yet/iu.test(input.text)) {
      problems.push(
        "does not say, in plain words, that it is not published yet",
      );
    }
  }
  if (
    UNIMPLEMENTED_STATUS.test(input.text) &&
    !SPECIFIED_NOT_IMPLEMENTED.test(proseOf(input.text))
  ) {
    problems.push(
      'says there is no public API (or an empty entry) yet but has no "Specified, not implemented yet" line next to its guarantees',
    );
  }
  problems.push(...checkLinks(input), ...checkWords(input.text));
  return problems;
};
