import { describe, expect, it } from "vitest";

import {
  checkoutWith,
  jobKey,
  only,
  PUBLISH_GATE,
  release,
  usesOf,
  valuesOf,
  VERSION_GATE,
  workflow,
} from "./release-workflow-lines.ts";
import {
  jobNames,
  jobRange,
  keyLine,
  keyLines,
  mappingAt,
  scalarAt,
  stepRanges,
} from "./workflow-text.ts";

// The release workflow's gates (.github/workflows/release.yml; runbook,
// Release), read with the small block-style reader of tools/workflow-text.ts,
// and the one CI step of the size budget (.github/workflows/ci.yml). Values
// are compared whole, so an added `|| true`, an extra line of a folded `if:`,
// or a changed refspec fails here. The split of the tooling from the tokens is
// in tools/release-workflow-split.test.ts.

describe("the release workflow", () => {
  it("has exactly the jobs dry-run, version, version-push, build, publish, attest, and github-release", () => {
    expect(jobNames(release)).toEqual([
      "dry-run",
      "version",
      "version-push",
      "build",
      "publish",
      "attest",
      "github-release",
    ]);
  });

  it("has exactly these if: conditions, whole", () => {
    expect(valuesOf(release, "if")).toEqual([
      "inputs.version && inputs.publish",
      VERSION_GATE,
      "steps.export.outputs.changed == 'true'",
      `${VERSION_GATE} && needs.version.outputs.changed == 'true'`,
      "steps.changes.outputs.changed == 'true'",
      PUBLISH_GATE,
      PUBLISH_GATE,
      PUBLISH_GATE,
      PUBLISH_GATE,
    ]);
    for (const job of ["build", "publish", "attest", "github-release"]) {
      expect(scalarAt(release, jobKey(job, "if"))).toBe(PUBLISH_GATE);
    }
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
    const permissions = Object.fromEntries(
      jobNames(release).map(job => [
        job,
        mappingAt(release, jobKey(job, "permissions")),
      ]),
    );
    expect(permissions).toEqual({
      "dry-run": ["contents: read"],
      version: ["contents: read", "pull-requests: read"],
      "version-push": ["contents: write"],
      build: ["contents: read"],
      publish: ["contents: read", "id-token: write"],
      attest: ["contents: read", "id-token: write", "attestations: write"],
      "github-release": ["contents: write"],
    });
  });

  it("gives an OIDC token only to publish and attest, and a write token only to version-push and github-release", () => {
    const lines = jobNames(release).flatMap(job =>
      mappingAt(release, jobKey(job, "permissions")).map(
        entry => `${job} ${entry}`,
      ),
    );
    expect(lines.filter(line => line.includes("id-token"))).toEqual([
      "publish id-token: write",
      "attest id-token: write",
    ]);
    expect(lines.filter(line => line.endsWith(": write"))).toEqual([
      "version-push contents: write",
      "publish id-token: write",
      "attest id-token: write",
      "attest attestations: write",
      "github-release contents: write",
    ]);
  });

  it("names the release environment in publish and the attest environment in attest, and no other", () => {
    expect(valuesOf(release, "environment")).toEqual(["release", "attest"]);
    expect(scalarAt(release, jobKey("publish", "environment"))).toBe("release");
    expect(scalarAt(release, jobKey("attest", "environment"))).toBe("attest");
  });

  it("orders the jobs: the dry run first, the push after version, publish after build, the release last", () => {
    const needs = Object.fromEntries(
      jobNames(release)
        .filter(job => job !== "dry-run")
        .map(job => [job, scalarAt(release, jobKey(job, "needs"))]),
    );
    expect(needs).toEqual({
      version: "dry-run",
      "version-push": "version",
      build: "dry-run",
      publish: "build",
      attest: "[dry-run, publish]",
      "github-release": "[dry-run, attest]",
    });
  });

  it("checks out without persisted credentials in every job that checks out", () => {
    const jobs = ["dry-run", "version", "version-push", "build", "publish"];
    expect(jobs.map(job => checkoutWith(job))).toEqual([
      ["persist-credentials: false"],
      ["persist-credentials: false", "fetch-depth: 0"],
      ["persist-credentials: false"],
      ["persist-credentials: false"],
      [
        "persist-credentials: false",
        "sparse-checkout: .node-version",
        "sparse-checkout-cone-mode: false",
      ],
    ]);
    expect(valuesOf(release, "persist-credentials")).toEqual(
      jobs.map(() => "false"),
    );
    expect(
      usesOf("attest").some(uses => uses.startsWith("actions/checkout@")),
    ).toBe(false);
    expect(
      usesOf("github-release").some(uses =>
        uses.startsWith("actions/checkout@"),
      ),
    ).toBe(false);
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
