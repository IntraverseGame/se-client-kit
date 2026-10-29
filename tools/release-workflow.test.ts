import { describe, expect, it } from "vitest";

import {
  checkoutWith,
  only,
  jobKey,
  jobKeys,
  prod,
  release,
  stepRun,
  usesOf,
  valuesOf,
  workflow,
} from "./release-workflow-lines.ts";
import {
  blockEnd,
  jobNames,
  jobRange,
  keyLine,
  keyLines,
  type Line,
  mappingAt,
  scalarAt,
  stepRanges,
} from "./workflow-text.ts";

// The release workflow's layout (.github/workflows/release.yml; ADR-009;
// runbook, Release), read with the small block-style reader of
// tools/workflow-text.ts: its trigger, jobs, gates, permissions, environments,
// and concurrency, and the one CI step of the size budget
// (.github/workflows/ci.yml). Values are compared whole, so an added
// `|| true`, an extra line of a folded `if:`, or a changed permission fails
// here. What each job runs is in tools/release-workflow-split.test.ts; the
// scripts themselves run in tools/release-mode.test.ts and
// tools/release-assets-guard.test.ts.

const JOBS = [
  "changesets-mode",
  "version",
  "publish",
  "wrapper-build",
  "attest",
  "wrapper-assets",
  "production",
];

/** The lines at `indent` inside the block of line `index`, comments left out. */
const keysIn = (lines: readonly Line[], index: number, indent: number) =>
  lines
    .slice(index + 1, blockEnd(lines, index))
    .filter(line => line.indent === indent && !line.text.startsWith("#"))
    .map(line => line.text);

const PUBLISH_IF =
  "needs.changesets-mode.outputs.release-candidate == 'true' && vars.RELEASE_PUBLISH_ENABLED == 'true'";

describe("the release workflow", () => {
  it("runs on every push to main, and on nothing else", () => {
    const on = keyLine(release, 0, release.length, 0, "on");
    expect(keysIn(release, on, 2)).toEqual(["push:"]);
    const push = keyLine(release, on, blockEnd(release, on), 2, "push");
    expect(keysIn(release, push, 4)).toEqual(["branches: [main]"]);
  });

  it("has no concurrency group, at the top or in any job", () => {
    expect(valuesOf(release, "concurrency")).toEqual([]);
    expect(valuesOf(release, "cancel-in-progress")).toEqual([]);
  });

  it("has exactly the jobs of ADR-009, in order", () => {
    expect(jobNames(release)).toEqual(JOBS);
  });

  it("has exactly these job conditions, whole", () => {
    const conditions = Object.fromEntries(
      JOBS.map(job => [
        job,
        jobKeys(job, "if").map(index => scalarAt(release, index)),
      ]),
    );
    expect(conditions).toEqual({
      "changesets-mode": ["github.ref == 'refs/heads/main'"],
      version: ["needs.changesets-mode.outputs.pending == 'true'"],
      publish: [PUBLISH_IF],
      "wrapper-build": ["needs.publish.outputs.wrapper-tag != ''"],
      attest: [],
      "wrapper-assets": [],
      production: [],
    });
  });

  it("gates publishing on RELEASE_PUBLISH_ENABLED in publish alone; the mode step reads it only for its notice", () => {
    expect(
      release
        .filter(line => line.text.includes("RELEASE_PUBLISH_ENABLED"))
        .filter(line => !line.text.startsWith("#"))
        .map(line => line.text),
    ).toEqual([
      "RELEASE_PUBLISH_ENABLED: ${{ vars.RELEASE_PUBLISH_ENABLED }}",
      'elif [ "$candidate" = true ] && [ "${RELEASE_PUBLISH_ENABLED:-}" = true ]; then',
      'echo "::notice::Publishing was off: nothing was published for${untagged}. Re-run this run within 30 days once RELEASE_PUBLISH_ENABLED is true (runbook/client-kit-release.md, Release)."',
      "vars.RELEASE_PUBLISH_ENABLED == 'true'",
    ]);
    expect(
      release
        .filter(line => /\bvars\./u.test(line.text))
        .map(line => line.text),
    ).toEqual([
      "RELEASE_PUBLISH_ENABLED: ${{ vars.RELEASE_PUBLISH_ENABLED }}",
      "vars.RELEASE_PUBLISH_ENABLED == 'true'",
    ]);
  });

  it("orders the jobs: mode first, then version or publish, the Wrapper's jobs, production last", () => {
    const needs = Object.fromEntries(
      JOBS.filter(job => job !== "changesets-mode").map(job => [
        job,
        scalarAt(release, jobKey(job, "needs")),
      ]),
    );
    expect(needs).toEqual({
      version: "changesets-mode",
      publish: "changesets-mode",
      "wrapper-build": "publish",
      attest: "wrapper-build",
      "wrapper-assets": "[wrapper-build, attest]",
      production: "[wrapper-build, wrapper-assets]",
    });
  });

  it("never continues on an error", () => {
    expect(valuesOf(release, "continue-on-error")).toEqual([]);
  });

  it("gives each job exactly its permissions, and no token at the top", () => {
    expect(
      scalarAt(release, keyLine(release, 0, release.length, 0, "permissions")),
    ).toBe("{}");
    const permissions = Object.fromEntries(
      JOBS.map(job => [job, mappingAt(release, jobKey(job, "permissions"))]),
    );
    expect(permissions).toEqual({
      "changesets-mode": ["contents: read", "pull-requests: read"],
      version: ["contents: write", "pull-requests: write"],
      publish: ["contents: write", "id-token: write"],
      "wrapper-build": ["contents: read"],
      attest: ["contents: read", "id-token: write", "attestations: write"],
      "wrapper-assets": ["contents: write"],
      production: ["contents: read", "attestations: read", "actions: read"],
    });
  });

  it("never gives one job both the pull-request write and the OIDC token", () => {
    const lines = JOBS.flatMap(job =>
      mappingAt(release, jobKey(job, "permissions")).map(
        entry => `${job} ${entry}`,
      ),
    );
    expect(lines.filter(line => line.includes("id-token"))).toEqual([
      "publish id-token: write",
      "attest id-token: write",
    ]);
    expect(lines.filter(line => line.includes("pull-requests"))).toEqual([
      "changesets-mode pull-requests: read",
      "version pull-requests: write",
    ]);
  });

  it("names the release environment in publish and the attest environment in attest, and no other", () => {
    expect(valuesOf(release, "environment")).toEqual(["release", "attest"]);
    expect(scalarAt(release, jobKey("publish", "environment"))).toBe("release");
    expect(scalarAt(release, jobKey("attest", "environment"))).toBe("attest");
    expect(jobKeys("version", "environment")).toEqual([]);
  });

  it("deploys production through pages-prod.yml with the released tag, passing it no secret", () => {
    expect(scalarAt(release, jobKey("production", "uses"))).toBe(
      "./.github/workflows/pages-prod.yml",
    );
    expect(mappingAt(release, jobKey("production", "with"))).toEqual([
      "tag: ${{ needs.wrapper-build.outputs.release-tag }}",
    ]);
    expect(jobKeys("production", "secrets")).toEqual([]);
    expect(release.filter(line => line.text.includes("secrets."))).toEqual([]);
  });

  it("gives production exactly what pages-prod.yml's jobs ask for", () => {
    const asked = new Set(
      jobNames(prod).flatMap(job =>
        mappingAt(prod, jobKey(job, "permissions", prod)),
      ),
    );
    expect([...asked].toSorted()).toEqual(
      mappingAt(release, jobKey("production", "permissions")).toSorted(),
    );
  });

  it("checks out without persisted credentials in every job that checks out", () => {
    expect(
      ["changesets-mode", "version", "publish", "wrapper-build"].map(job =>
        checkoutWith(job),
      ),
    ).toEqual([
      ["persist-credentials: false"],
      ["persist-credentials: false", "fetch-depth: 0"],
      ["persist-credentials: false", "fetch-tags: true"],
      ["persist-credentials: false"],
    ]);
    for (const job of ["attest", "wrapper-assets"]) {
      expect(
        usesOf(job).some(uses => uses.startsWith("actions/checkout@")),
      ).toBe(false);
    }
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

  it("re-checks the tags at the start of publish, and runs nothing else but the releases step when they are all tagged", () => {
    const steps = stepRanges(release, jobRange(release, "publish"));
    const [start, end] = only(steps.slice(1, 2), "second step of publish");
    expect(scalarAt(release, keyLine(release, start, end, 8, "name"))).toBe(
      "Check that a version is still untagged",
    );
    const conditions = steps
      .slice(2)
      .map(([from, to]) =>
        scalarAt(release, keyLine(release, from, to, 8, "if")),
      );
    expect(conditions).toEqual([
      ...Array.from(
        { length: 5 },
        () => "steps.recheck.outputs.release == 'true'",
      ),
      "steps.changesets.outputs.published == 'true' || steps.recheck.outputs.release == 'false'",
    ]);
    expect(stepRun("publish", "Check the repository")).toBe("pnpm check");
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
