import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  jobNames,
  jobRange,
  keyLine,
  keyLines,
  type Line,
  mappingAt,
  readLines,
  scalarAt,
  stepNamed,
  stepRanges,
} from "./workflow-text.ts";

// The release workflow's gates (.github/workflows/release.yml; runbook,
// Release), read with the small block-style reader of tools/workflow-text.ts,
// and the one CI step of the size budget (.github/workflows/ci.yml). Values
// are compared whole, so an added `|| true`, an extra line of a folded `if:`,
// or a changed refspec fails here.

const workflow = (name: string): Line[] =>
  readLines(
    readFileSync(
      join(import.meta.dirname, "..", ".github", "workflows", name),
      "utf8",
    ),
  );

const release = workflow("release.yml");

const only = <T>(values: readonly T[], what: string): T => {
  const [value] = values;
  if (values.length !== 1 || value === undefined) {
    throw new Error(`expected one ${what}, found ${String(values.length)}`);
  }
  return value;
};

/** The `with:` entries of job `job`'s one checkout step. */
const checkoutWith = (job: string): string[] => {
  const [from, to] = only(
    stepRanges(release, jobRange(release, job)).filter(([start, end]) =>
      keyLines(release, start, end, 8, "uses").some(index =>
        scalarAt(release, index).startsWith("actions/checkout@"),
      ),
    ),
    `checkout step in ${job}`,
  );
  return mappingAt(release, keyLine(release, from, to, 8, "with"));
};

/** Every line of every `run:` script that runs `git ... push`. */
const pushLines = (): string[] =>
  valuesOf(release, "run")
    .map(script => script.replaceAll(/\\\n\s*/gu, ""))
    .flatMap(script => script.split("\n"))
    .map(line => line.trim())
    .filter(line => /\bgit\b.*\bpush\b/u.test(line));

/** Every value of key `key` in `lines`, at any indentation, in file order. */
const valuesOf = (lines: readonly Line[], key: string): string[] =>
  lines.flatMap((line, index) =>
    line.text === `${key}:` || line.text.startsWith(`${key}: `)
      ? [scalarAt(lines, index)]
      : [],
  );

const jobKey = (job: string, key: string): number => {
  const [start, end] = jobRange(release, job);
  return keyLine(release, start, end, 4, key);
};

/** The git options that keep planted hooks and fsmonitors from running. */
const SAFE_GIT = "git -c core.hooksPath=/dev/null -c core.fsmonitor=false";

const PUSH = `${SAFE_GIT} -c credential.helper= -c credential.helper='!f() { echo username=x-access-token; echo "password=\${GITHUB_TOKEN}"; }; f' push --no-verify --force "\${GITHUB_SERVER_URL}/\${GITHUB_REPOSITORY}.git" HEAD:refs/heads/changeset-release/main`;

/**
 * The `run:` script of the version job's step `name`, line continuations
 * joined.
 */
const versionScript = (name: string): string => {
  const [from, to] = stepNamed(release, jobRange(release, "version"), name);
  return scalarAt(release, keyLine(release, from, to, 8, "run")).replaceAll(
    /\\\n\s*/gu,
    "",
  );
};

/** Each git invocation in `script`: from `git` to the end of its line. */
const gitCalls = (script: string): string[] =>
  [...script.matchAll(/(?:^|[\s;(])(git\s[^\n]*)/gmu)].map(
    match => match[1] ?? "",
  );

describe("the release workflow", () => {
  it("has exactly the jobs dry-run, version, and publish", () => {
    expect(jobNames(release)).toEqual(["dry-run", "version", "publish"]);
  });

  it("has exactly these if: conditions, whole", () => {
    expect(valuesOf(release, "if")).toEqual([
      "inputs.version && inputs.publish",
      "inputs.version && !inputs.publish && github.ref == 'refs/heads/main'",
      "steps.changes.outputs.changed == 'true'",
      "inputs.publish && !inputs.version && github.ref == 'refs/heads/main' && vars.RELEASE_PUBLISH_ENABLED == 'true'",
    ]);
  });

  it("fails the dry-run job in its first step when version and publish are both ticked", () => {
    const [from, to] = only(
      stepRanges(release, jobRange(release, "dry-run")).slice(0, 1),
      "first step of dry-run",
    );
    expect(scalarAt(release, keyLine(release, from, to, 8, "name"))).toBe(
      "Refuse version and publish together",
    );
    expect(scalarAt(release, keyLine(release, from, to, 8, "if"))).toBe(
      "inputs.version && inputs.publish",
    );
    expect(scalarAt(release, keyLine(release, from, to, 8, "run"))).toBe(
      'echo "::error::Tick either version or publish, not both: merge the version pull request first, then publish in a run of its own."\nexit 1',
    );
  });

  it("never continues on an error", () => {
    expect(valuesOf(release, "continue-on-error")).toEqual([]);
  });

  it("gives each job exactly its permissions, and no token at the top", () => {
    expect(
      scalarAt(release, keyLine(release, 0, release.length, 0, "permissions")),
    ).toBe("{}");
    expect(mappingAt(release, jobKey("dry-run", "permissions"))).toEqual([
      "contents: read",
    ]);
    expect(mappingAt(release, jobKey("version", "permissions"))).toEqual([
      "contents: write",
      "pull-requests: read",
    ]);
    expect(mappingAt(release, jobKey("publish", "permissions"))).toEqual([
      "contents: read",
      "id-token: write",
    ]);
  });

  it("names the release environment in the publish job only", () => {
    expect(valuesOf(release, "environment")).toEqual(["release"]);
    expect(scalarAt(release, jobKey("publish", "environment"))).toBe("release");
  });

  it("runs version and publish only after the dry run", () => {
    expect(scalarAt(release, jobKey("version", "needs"))).toBe("dry-run");
    expect(scalarAt(release, jobKey("publish", "needs"))).toBe("dry-run");
  });

  it("checks out without persisted credentials in every job", () => {
    expect(jobNames(release).map(job => checkoutWith(job))).toEqual([
      ["persist-credentials: false"],
      ["persist-credentials: false", "fetch-depth: 0"],
      ["persist-credentials: false"],
    ]);
    expect(valuesOf(release, "persist-credentials")).toEqual([
      "false",
      "false",
      "false",
    ]);
  });

  it("pushes only changeset-release/main, never a tag", () => {
    expect(pushLines()).toEqual([PUSH]);
    for (const script of valuesOf(release, "run")) {
      expect(script).not.toMatch(
        /--tags|--follow-tags|--mirror|refs\/tags|\bgit\s+tag\b|\bgh\s+release\b/u,
      );
    }
  });

  it("runs every git command of the check and push steps without hooks or an fsmonitor", () => {
    const calls = [
      "Check what changeset version changed",
      "Push the changeset-release/main branch",
    ].flatMap(name => gitCalls(versionScript(name)));
    expect(calls).toHaveLength(6);
    for (const call of calls)
      expect(call.startsWith(`${SAFE_GIT} `)).toBe(true);
    expect(calls.filter(call => /\s(?:commit|push)\s/u.test(call))).toEqual([
      `${SAFE_GIT} -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" commit --no-verify --quiet --message "chore(release): version packages"`,
      PUSH,
    ]);
  });

  it("passes the token only to the changeset and push steps of the version job", () => {
    const version = jobRange(release, "version");
    for (const name of [
      "Apply the pending changesets",
      "Push the changeset-release/main branch",
    ]) {
      const [from, to] = stepNamed(release, version, name);
      expect(mappingAt(release, keyLine(release, from, to, 8, "env"))).toEqual([
        "GITHUB_TOKEN: ${{ github.token }}",
      ]);
    }
    expect(valuesOf(release, "GITHUB_TOKEN")).toHaveLength(2);
  });

  it("puts no ${{ expression inside any run: script", () => {
    for (const script of valuesOf(release, "run")) {
      expect(script).not.toContain("${{");
    }
  });

  it("pins every Action by full commit SHA or uses a local one", () => {
    for (const uses of valuesOf(release, "uses")) {
      expect(uses).toMatch(/^(?:\.\/|[^@\s]+@[0-9a-f]{40}$)/u);
    }
  });
});

describe("the CI workflow", () => {
  it("holds the Wrapper to its size budget in the build job", () => {
    const ci = workflow("ci.yml");
    const build = jobRange(ci, "build");
    const runs = stepRanges(ci, build).flatMap(([from, to]) =>
      keyLines(ci, from, to, 8, "run").map(index => scalarAt(ci, index)),
    );
    expect(runs).toContain("pnpm run check:size-budget");
  });
});
