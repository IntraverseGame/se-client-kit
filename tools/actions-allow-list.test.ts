import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// The Actions allow-list (ADR-005, Consequences; specs/client-kit/supply-chain.md,
// "Pinned toolchain"): every `uses:` of an external Action in `.github/` names
// an Action on the list, pinned by its full 40-character commit SHA, with the
// list's version in the trailing comment; and every Action on the list is used.
// Local Actions (`./.github/actions/...`) are exempt.

const root = join(import.meta.dirname, "..");

const yamlFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return yamlFiles(path);
    return /\.ya?ml$/u.test(entry.name) ? [path] : [];
  });

type Use = {
  readonly file: string;
  readonly value: string;
  readonly comment: string;
};

const uses: Use[] = yamlFiles(join(root, ".github")).flatMap(path =>
  readFileSync(path, "utf8")
    .split("\n")
    .flatMap(line => {
      const match = /^\s*(?:-\s+)?uses:\s*(\S+)(?:\s+#\s*(.*))?$/u.exec(line);
      if (match === null) return [];
      return [
        {
          file: relative(root, path),
          value: match[1] ?? "",
          comment: (match[2] ?? "").trim(),
        },
      ];
    }),
);

type Allowed = {
  readonly name: string;
  readonly version: string;
  readonly sha: string;
};

const allowed: Allowed[] = readFileSync(
  join(root, "specs", "client-kit", "supply-chain.md"),
  "utf8",
)
  .split("\n")
  .flatMap(line => {
    const match =
      /^\s*\|\s*`([^`@\s]+)`\s*\|\s*(v\d+\.\d+\.\d+)\s*\|\s*`([0-9a-f]{40})`\s*\|/u.exec(
        line,
      );
    return match === null
      ? []
      : [
          {
            name: match[1] ?? "",
            version: match[2] ?? "",
            sha: match[3] ?? "",
          },
        ];
  });

const external = uses.filter(use => !use.value.startsWith("./"));

/** What is wrong with one external `uses:`, if anything. */
const problemOf = (use: Use): string[] => {
  const match = /^([^@\s]+)@([0-9a-f]{40})$/u.exec(use.value);
  if (match === null) {
    return [`${use.file}: ${use.value} is not pinned by a full commit SHA`];
  }
  const entry = allowed.find(candidate => candidate.name === match[1]);
  if (entry === undefined) {
    return [`${use.file}: ${match[1] ?? ""} is not on the allow-list`];
  }
  if (entry.sha !== match[2]) {
    return [`${use.file}: ${use.value} is not the listed ${entry.sha}`];
  }
  if (use.comment !== entry.version) {
    return [
      `${use.file}: ${use.value} is commented "${use.comment}", not ${entry.version}`,
    ];
  }
  return [];
};

/** The first Action on the list, for the refusal cases. */
const listed: Allowed = allowed[0] ?? { name: "", version: "", sha: "" };

const UNPINNED: Use = {
  file: "x.yml",
  value: "actions/checkout@v7",
  comment: "",
};

describe("the Actions allow-list", () => {
  it("reads the list and the workflows", () => {
    expect(allowed.length).toBeGreaterThan(0);
    expect(external.length).toBeGreaterThan(0);
    expect(new Set(allowed.map(entry => entry.name)).size).toBe(allowed.length);
  });

  it("pins every external Action by full commit SHA, on the list, with its version", () => {
    const problems = external.flatMap(use => problemOf(use));
    expect(problems).toEqual([]);
  });

  it("refuses an Action that is unpinned, unlisted, pinned elsewhere, or mislabelled", () => {
    expect(
      [
        UNPINNED,
        { ...UNPINNED, value: `someone/action@${"a".repeat(40)}` },
        { ...UNPINNED, value: `${listed.name}@${"b".repeat(40)}` },
        {
          ...UNPINNED,
          value: `${listed.name}@${listed.sha}`,
          comment: "v0.0.0",
        },
      ].map(use => problemOf(use).length),
    ).toEqual([1, 1, 1, 1]);
    expect(
      problemOf({
        ...UNPINNED,
        value: `${listed.name}@${listed.sha}`,
        comment: listed.version,
      }),
    ).toEqual([]);
  });

  it("lists only Actions that are used", () => {
    const used = new Set(external.map(use => use.value.split("@")[0]));
    expect(allowed.filter(entry => !used.has(entry.name))).toEqual([]);
  });

  it("exempts only the repository's own local Actions", () => {
    for (const use of uses.filter(entry => entry.value.startsWith("./"))) {
      expect(use.value).toMatch(/^\.\/\.github\/actions\/[a-z-]+$/u);
    }
  });
});
