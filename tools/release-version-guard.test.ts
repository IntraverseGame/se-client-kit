import {
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  makeGuard,
  type Outcome,
  write,
} from "./fixtures/version-guard-repository.ts";

// The version-file guard (tools/release-version-guard.sh; ADR-009, Kept):
// after `changeset version`, in the release workflow's `version` job, it
// refuses anything `changeset version` does not write, before
// changesets/action commits the working tree. This test runs the guard script
// with bash (as tools/release-version.sh does) against temporary git
// repositories: each change below is made after a base commit, and the script
// must pass or refuse it. Git runs without any user or system configuration.

const tools = join(import.meta.dirname);
const script = readFileSync(join(tools, "release-version-guard.sh"), "utf8");
const versionScript = readFileSync(join(tools, "release-version.sh"), "utf8");

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const guard = makeGuard(script, directories);

const expectRefused = (outcome: Outcome): void => {
  expect(outcome.status).toBe(1);
  expect(outcome.output).toContain("Unexpected change:");
  expect(outcome.output).toContain(
    "changeset version changed more than it should; nothing pushed.",
  );
  expect(outcome.staged).toBe("");
};

const check = (
  change: (root: string, git: (...args: string[]) => void) => void,
): Outcome => guard(change);

describe("the version job's version-file guard", () => {
  it("runs after changeset version in the version script, holding no token", () => {
    expect(
      versionScript.split("\n").filter(line => /^[a-z]/u.test(line)),
    ).toEqual([
      "set -euo pipefail",
      "pnpm exec changeset version",
      "bash tools/release-version-guard.sh",
    ]);
    for (const text of [script, versionScript]) {
      const code = text.split("\n").filter(line => !line.startsWith("#"));
      expect(code.join("\n")).not.toMatch(/TOKEN|token|secret/u);
    }
    expect(script.split("\n").find(line => !line.startsWith("#"))).toBe(
      "set -euo pipefail",
    );
  });

  it("passes what changeset version writes", () => {
    const outcome = check(root => {
      write(root, "package.json", '{"private":true}\n');
      write(root, "packages/a/package.json", '{"version":"0.2.0"}\n');
      write(root, "packages/a/CHANGELOG.md", "# a\n\n## 0.2.0\n");
      write(root, "CHANGELOG.md", "# kit\n");
      write(root, "packages/b/CHANGELOG.md", "# b\n");
      unlinkSync(join(root, ".changeset/one.md"));
      unlinkSync(join(root, ".changeset/two.md"));
    });
    expect(outcome.output).not.toContain("Unexpected change:");
    expect(outcome.status).toBe(0);
    expect(outcome.output).toContain(
      "changeset version changed only versions, changelogs, and consumed changesets.",
    );
    expect(outcome.staged).toBe("");
  });

  it("pushes nothing when nothing changed", () => {
    const outcome = check(() => {
      // Nothing changes after the base commit.
    });
    expect(outcome.status).toBe(0);
    expect(outcome.output).toContain("No pending changesets; nothing to push.");
    expect(outcome.staged).toBe("");
  });

  it.each<[string, (root: string, git: (...args: string[]) => void) => void]>([
    [
      "a rename onto a CHANGELOG.md",
      (_, git) => git("mv", "tools/guard.ts", "tools/CHANGELOG.md"),
    ],
    [
      "a deleted package.json",
      root => unlinkSync(join(root, "packages/a/package.json")),
    ],
    [
      "a deleted CHANGELOG.md",
      root => unlinkSync(join(root, "packages/a/CHANGELOG.md")),
    ],
    [
      "an added package.json",
      root => write(root, "packages/c/package.json", "{}\n"),
    ],
    [
      "an added changeset",
      root => write(root, ".changeset/new.md", "---\n---\nnew\n"),
    ],
    [
      "an edited changeset",
      root => write(root, ".changeset/one.md", "edited\n"),
    ],
    [
      "a deleted file below .changeset/",
      root => unlinkSync(join(root, ".changeset/x/y.md")),
    ],
    [
      "the deleted .changeset/README.md",
      root => unlinkSync(join(root, ".changeset/README.md")),
    ],
    [
      "an edited source file",
      root => write(root, "tools/guard.ts", "export const x = 1;\n"),
    ],
    [
      "a CHANGELOG.md added inside .changeset/",
      root => write(root, ".changeset/CHANGELOG.md", "# not a changelog\n"),
    ],
    [
      "a CHANGELOG.md added below .changeset/",
      root => write(root, ".changeset/x/CHANGELOG.md", "# not a changelog\n"),
    ],
    [
      "a modified CHANGELOG.md under .github/",
      root => write(root, ".github/CHANGELOG.md", "# changed\n"),
    ],
    [
      "a modified package.json under .github/",
      root =>
        write(root, ".github/actions/x/package.json", '{"version":"1"}\n'),
    ],
    [
      "a CHANGELOG.md added under .github/",
      root =>
        write(root, ".github/workflows/CHANGELOG.md", "# not a changelog\n"),
    ],
    [
      "an added workflow",
      root => write(root, ".github/workflows/x.yml", "on: push\n"),
    ],
    [
      "a package.json turned into a symbolic link",
      root => {
        unlinkSync(join(root, "packages/a/package.json"));
        symlinkSync(
          "../../package.json",
          join(root, "packages/a/package.json"),
        );
      },
    ],
    [
      "a package.json made executable",
      root => chmodSync(join(root, "packages/a/package.json"), 0o755),
    ],
    [
      "a CHANGELOG.md added as a symbolic link",
      root =>
        symlinkSync(
          "../../tools/guard.ts",
          join(root, "packages/a/../CHANGELOG.md"),
        ),
    ],
    [
      "a path with a newline",
      root =>
        write(root, "packages/odd\nname/package.json", '{"version":"1"}\n'),
    ],
    [
      "a path with a quote",
      root => write(root, 'packages/q"uote/package.json', '{"version":"1"}\n'),
    ],
  ])("refuses %s", (_, change) => {
    const outcome = check(change);
    expect(outcome.status).toBe(1);
    expectRefused(outcome);
  });

  it("refuses an allowed change together with a refused one", () => {
    const outcome = check(root => {
      write(root, "packages/a/package.json", '{"version":"0.2.0"}\n');
      write(root, "tools/guard.ts", "export const x = 1;\n");
    });
    expect(outcome.output).toContain("Unexpected change: M tools/guard.ts");
    expectRefused(outcome);
  });
});
