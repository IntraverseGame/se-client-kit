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
  type Route,
  write,
} from "./fixtures/version-guard-repository.ts";
import {
  jobRange,
  keyLine,
  keyLines,
  readLines,
  scalarAt,
  stepNamed,
} from "./workflow-text.ts";

// The release workflow's `version-push` job refuses to push anything but what
// `changeset version` writes (.github/workflows/release.yml, step "Check what
// changeset version changed"). This test runs that step's own script, read
// from the workflow, with bash against temporary git repositories: each
// change below is made after a base commit, and the script must pass or
// refuse it. Git runs without any user or system configuration.

const STEP = "Check what changeset version changed";
const lines = readLines(
  readFileSync(
    join(import.meta.dirname, "..", ".github", "workflows", "release.yml"),
    "utf8",
  ),
);
const step = stepNamed(lines, jobRange(lines, "version-push"), STEP);
const script = scalarAt(lines, keyLine(lines, step[0], step[1], 8, "run"));

/** The `run:` script of step `name` of job `job`. */
const scriptOf = (job: string, name: string): string => {
  const [from, to] = stepNamed(lines, jobRange(lines, job), name);
  return scalarAt(lines, keyLine(lines, from, to, 8, "run"));
};

// The hand-over between the two jobs: `version` exports the change as a
// patch, `version-push` applies it to a fresh checkout of the same commit.
const exportScript = scriptOf("version", "Export the version change");
const applyScript = scriptOf("version-push", "Apply the version change");

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const guard = makeGuard(
  { guard: script, exportScript, applyScript },
  directories,
);

const expectRefused = (outcome: Outcome): void => {
  expect(outcome.status).toBe(1);
  expect(outcome.output).toContain("Unexpected change:");
  expect(outcome.output).toContain(
    "changeset version changed more than it should; nothing pushed.",
  );
  expect(outcome.result).toBe("");
};

describe.each<Route>(["direct", "patch"])(
  "the version-push job's push guard (%s)",
  route => {
    const check = (
      change: (root: string, git: (...args: string[]) => void) => void,
    ): Outcome => guard(change, route);

    it("is a bash script that holds no token", () => {
      expect(
        scalarAt(lines, keyLine(lines, step[0], step[1], 8, "shell")),
      ).toBe("bash");
      expect(keyLines(lines, step[0], step[1], 8, "env")).toEqual([]);
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
      expect(outcome.result).toBe("changed=true\n");
    });

    it("pushes nothing when nothing changed", () => {
      const outcome = check(() => {
        // Nothing changes after the base commit.
      });
      expect(outcome.status).toBe(0);
      expect(outcome.output).toContain(
        "No pending changesets; nothing to push.",
      );
      expect(outcome.result).toBe("changed=false\n");
    });

    it.each<[string, (root: string, git: (...args: string[]) => void) => void]>(
      [
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
          root =>
            write(root, ".changeset/x/CHANGELOG.md", "# not a changelog\n"),
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
            write(
              root,
              ".github/workflows/CHANGELOG.md",
              "# not a changelog\n",
            ),
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
          root =>
            write(root, 'packages/q"uote/package.json', '{"version":"1"}\n'),
        ],
      ],
    )("refuses %s", (_, change) => {
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
  },
);
