import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import allowlist from "./allowed-dependencies.json" with { type: "json" };
import { findViolations, type Manifest } from "./dependency-allowlist.ts";

// Specifier rules of the dependency allow-list: exact registry versions only,
// the workspace protocol for kit packages, and the same names and specifiers in
// overrides and catalogs (package.json and pnpm-workspace.yaml).

const repoRoot = join(import.meta.dirname, "..");
const root = (json: object): Manifest => ({ directory: "", json });
const pkg = (directory: string, json: object): Manifest => ({
  directory,
  json,
});

const withField = (field: string, value: unknown): Manifest[] => [
  root({
    name: "root",
    ...(field.startsWith("pnpm.")
      ? { pnpm: { [field.slice(5)]: value } }
      : { [field]: value }),
  }),
];

const check = (yaml: string): string[] => findViolations([], allowlist, yaml);

describe("specifiers", () => {
  const rejected = [
    ["a git URL", "git+https://example.test/x.git"],
    ["a git ssh URL", "git+ssh://git@example.test/x.git"],
    ["a github shorthand", "github:owner/repo"],
    ["a bare owner/repo", "owner/repo"],
    ["an https tarball", "https://example.test/x.tgz"],
    ["an http tarball", "http://example.test/x.tgz"],
    ["a file path", "file:../x"],
    ["a link", "link:../x"],
    ["an npm alias", "npm:other@1.0.0"],
    ["a caret range", "^1.0.0"],
    ["a tilde range", "~1.0.0"],
    ["a wildcard", "*"],
    ["a tag", "latest"],
    ["a partial version", "1.0"],
    ["an empty string", ""],
  ] as const;

  it.each(rejected)(
    "rejects %s as a development dependency",
    (_name, specifier) => {
      const manifests = [
        root({ name: "root", devDependencies: { typescript: specifier } }),
      ];
      expect(findViolations(manifests, allowlist)).toHaveLength(1);
    },
  );

  it.each(rejected)(
    "rejects %s as a runtime dependency",
    (_name, specifier) => {
      const manifests = [
        pkg("packages/signing", {
          name: "s",
          dependencies: { "@noble/curves": specifier },
        }),
      ];
      expect(findViolations(manifests, allowlist)).toHaveLength(1);
    },
  );

  it("rejects a non-string specifier", () => {
    const manifests = [
      root({ name: "root", devDependencies: { typescript: 7 } }),
    ];
    expect(findViolations(manifests, allowlist)).toHaveLength(1);
  });

  it.each(["1.2.3", "0.0.1", "10.20.30", "1.0.0-rc.1", "1.0.0+build.5"])(
    "accepts the exact version %s",
    version => {
      const manifests = [
        root({ name: "root", devDependencies: { typescript: version } }),
      ];
      expect(findViolations(manifests, allowlist)).toEqual([]);
    },
  );

  it("accepts a catalog reference", () => {
    const manifests = [
      root({ name: "root", devDependencies: { typescript: "catalog:" } }),
    ];
    expect(findViolations(manifests, allowlist)).toEqual([]);
  });
});

describe("overrides and catalogs in package.json", () => {
  it.each(["overrides", "pnpm.overrides", "resolutions"])(
    "accepts an allowed exact %s",
    field => {
      expect(
        findViolations(withField(field, { typescript: "7.0.2" }), allowlist),
      ).toEqual([]);
    },
  );

  it.each(["overrides", "pnpm.overrides", "resolutions"])(
    "rejects an unlisted name in %s",
    field => {
      expect(
        findViolations(withField(field, { "left-pad": "1.3.0" }), allowlist),
      ).toHaveLength(1);
    },
  );

  it.each(["overrides", "pnpm.overrides", "resolutions"])(
    "rejects a bad specifier in %s",
    field => {
      const value = { typescript: "github:owner/repo" };
      expect(findViolations(withField(field, value), allowlist)).toHaveLength(
        1,
      );
    },
  );

  it("reads the target of a selector with a parent and a version range", () => {
    const ok = withField("overrides", { "vite>typescript@^7": "7.0.2" });
    expect(findViolations(ok, allowlist)).toEqual([]);
    const bad = withField("overrides", { "typescript>left-pad@1": "1.3.0" });
    expect(findViolations(bad, allowlist)).toHaveLength(1);
  });

  it("accepts a reference to an allowed direct dependency and rejects another", () => {
    expect(
      findViolations(
        withField("overrides", { vite: "$typescript" }),
        allowlist,
      ),
    ).toEqual([]);
    expect(
      findViolations(withField("overrides", { vite: "$left-pad" }), allowlist),
    ).toHaveLength(1);
  });

  it("checks nested overrides", () => {
    const nested = withField("overrides", {
      vite: { ".": "8.3.4", "left-pad": "1.3.0" },
    });
    expect(findViolations(nested, allowlist)).toHaveLength(1);
  });

  it("checks catalog and catalogs", () => {
    expect(
      findViolations(withField("catalog", { typescript: "7.0.2" }), allowlist),
    ).toEqual([]);
    expect(
      findViolations(withField("catalog", { "left-pad": "1.3.0" }), allowlist),
    ).toHaveLength(1);
    expect(
      findViolations(withField("catalog", { typescript: "^7.0.2" }), allowlist),
    ).toHaveLength(1);
    expect(
      findViolations(
        withField("catalogs", { tools: { typescript: "7.0.2" } }),
        allowlist,
      ),
    ).toEqual([]);
    expect(
      findViolations(
        withField("catalogs", { tools: { typescript: "link:../x" } }),
        allowlist,
      ),
    ).toHaveLength(1);
    expect(
      findViolations(
        withField("pnpm.catalog", { "left-pad": "1.3.0" }),
        allowlist,
      ),
    ).toHaveLength(1);
  });
});

describe("overrides and catalogs in pnpm-workspace.yaml", () => {
  it("accepts a workspace file without those sections", () => {
    expect(
      check("packages:\n  - packages/*\nminimumReleaseAge: 10080\n"),
    ).toEqual([]);
  });

  it("accepts allowed exact entries, with comments and quotes", () => {
    const yaml = [
      "overrides:",
      "  # a comment",
      "  typescript: 7.0.2",
      "  'vite>vitest': \"5.0.3\" # trailing comment",
      "catalog:",
      "  oxlint: 1.87.0",
      "catalogs:",
      "  tools:",
      "    oxfmt: 0.72.0",
      "packages:",
      "  - packages/*",
      "",
    ].join("\n");
    expect(check(yaml)).toEqual([]);
  });

  it("rejects an unlisted name and a bad specifier in each section", () => {
    expect(check("overrides:\n  left-pad: 1.3.0\n")).toHaveLength(1);
    expect(check("overrides:\n  typescript: github:owner/repo\n")).toHaveLength(
      1,
    );
    expect(check("catalog:\n  left-pad: 1.3.0\n")).toHaveLength(1);
    expect(check("catalog:\n  typescript: ^7.0.2\n")).toHaveLength(1);
    expect(
      check("catalogs:\n  tools:\n    typescript: file:../x\n"),
    ).toHaveLength(1);
    expect(check("catalogs:\n  tools:\n    left-pad: 1.3.0\n")).toHaveLength(1);
  });

  it("fails closed on YAML it does not read", () => {
    expect(check("overrides: { typescript: 7.0.2 }\n").length).toBeGreaterThan(
      0,
    );
    expect(
      check("overrides:\n  typescript: &pin 7.0.2\n").length,
    ).toBeGreaterThan(0);
    expect(check("catalog:\n  - typescript\n").length).toBeGreaterThan(0);
  });

  it("accepts the repository's own pnpm-workspace.yaml", () => {
    const yaml = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8");
    expect(check(yaml)).toEqual([]);
  });
});
