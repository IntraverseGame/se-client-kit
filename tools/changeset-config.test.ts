import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import allowlist from "./allowed-dependencies.json" with { type: "json" };

// The changesets configuration (.changeset/config.json): releases get their
// changelog from the GitHub generator for this repository, and `ignore` names
// workspace packages that exist (a rename must not leave a stale entry).

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
});
