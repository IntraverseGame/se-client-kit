import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import allowlist from "./allowed-dependencies.json" with { type: "json" };
import { PUBLISHED_PACKAGES, packageNameOf } from "./package-tarball.ts";

// The changesets configuration (.changeset/config.json): releases get their
// changelog from the GitHub generator for this repository, and `ignore` names
// workspace packages that exist (a rename must not leave a stale entry) and
// every workspace package that is never released: the publish command's
// `changeset git-tag` (tools/release-publish.ts) tags every package it does not
// ignore, so a package left out would get a permanent `<name>@0.0.0` tag and
// GitHub release (ADR-009).

const root = join(import.meta.dirname, "..");
const config = JSON.parse(
  readFileSync(join(root, ".changeset", "config.json"), "utf8"),
) as { changelog: unknown; ignore: string[] };

const workspaceNames = new Set(
  ["packages", "apps", "e2e"].flatMap(group => {
    const directories =
      group === "e2e"
        ? [join(root, "e2e")]
        : readdirSync(join(root, group), { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => join(root, group, entry.name));
    return directories.map(
      directory =>
        (
          JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as {
            name: string;
          }
        ).name,
    );
  }),
);

describe("changesets configuration", () => {
  it("uses the GitHub changelog generator for this repository", () => {
    expect(config.changelog).toEqual([
      "@changesets/changelog-github",
      { repo: "IntraverseGame/se-client-kit" },
    ]);
  });

  it("uses a generator that is on the dependency allow-list", () => {
    expect(allowlist.development).toContain("@changesets/changelog-github");
  });

  it("ignores only workspace packages that exist", () => {
    expect(config.ignore.filter(name => !workspaceNames.has(name))).toEqual([]);
  });

  it("ignores every workspace package but the five libraries and the Wrapper", () => {
    const released = new Set([
      ...PUBLISHED_PACKAGES.map(name => packageNameOf(name)),
      "@intraverse/se-client-wrapper",
    ]);
    expect(
      [...workspaceNames].filter(name => !released.has(name)).toSorted(),
    ).toEqual(config.ignore.toSorted());
  });
});
