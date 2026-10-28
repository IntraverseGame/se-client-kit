import { describe, expect, it } from "vitest";

import {
  ATTEST,
  CHECKOUT,
  DOWNLOAD,
  gitCalls,
  jobKey,
  NPM_LINES,
  only,
  PUSH,
  pushLines,
  release,
  REPOSITORY_TOOLING,
  runsOf,
  SAFE_GIT,
  SETUP_NODE,
  stepEnv,
  stepScript,
  UPLOAD,
  usesOf,
  valuesOf,
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

// The release workflow's split (.github/workflows/release.yml; ADR-005;
// runbook, Release): repository tooling runs only in jobs without a write
// token or an OIDC token, the version change and the tarballs pass between
// jobs and are checked where they are used, the attestation's inputs, the
// dry run's uploads, and what is pushed and tagged.

/** The `run:` scripts of every job but `job`. */
const scriptsOutside = (job: string): string[] =>
  jobNames(release)
    .filter(name => name !== job)
    .flatMap(name => runsOf(name));

/** The jobs that hold a write token or an OIDC token. */
const TOKEN_JOBS = ["version-push", "publish", "attest", "github-release"];

describe("the release workflow's split", () => {
  it("runs repository tooling only in jobs without a write token or an OIDC token", () => {
    // The jobs that hold `contents: write`, `id-token: write`, or
    // `attestations: write` use only these Actions, never the local setup
    // action (an install), and their scripts run no package manager, Node,
    // or tools/ script; npm appears only as `npm publish`.
    expect(usesOf("version-push")).toEqual([CHECKOUT, DOWNLOAD]);
    expect(usesOf("publish")).toEqual([CHECKOUT, SETUP_NODE, DOWNLOAD]);
    expect(usesOf("attest")).toEqual([ATTEST]);
    expect(usesOf("github-release")).toEqual([DOWNLOAD, DOWNLOAD]);
    const scripts = TOKEN_JOBS.flatMap(job => runsOf(job));
    for (const script of scripts) {
      expect(script).not.toMatch(REPOSITORY_TOOLING);
    }
    expect(
      scripts
        .flatMap(script => script.split("\n"))
        .map(line => line.trim())
        .filter(line => /\bnpm\b/u.test(line)),
    ).toEqual(NPM_LINES);
    // npm runs only as `npm --version` and `npm publish`.
    expect(
      scripts.flatMap(script =>
        [...script.matchAll(/(?:^|\$\(|[;&|]\s*)\s*(npm\s+[a-z-]+)/gmu)].map(
          match => match[1],
        ),
      ),
    ).toEqual(["npm --version", "npm publish"]);
    // The tooling runs where no token can write: the dry run, version (with
    // a read-only token), and build.
    for (const job of ["dry-run", "version", "build"]) {
      expect(usesOf(job)).toContain("./.github/actions/setup");
    }
  });

  it("runs version's tooling with a read-only token and hands the push only a patch", () => {
    expect(stepEnv("version", "Apply the pending changesets")).toEqual([
      "GITHUB_TOKEN: ${{ github.token }}",
    ]);
    expect(usesOf("version")).toEqual([
      CHECKOUT,
      "./.github/actions/setup",
      UPLOAD,
    ]);
    expect(stepScript("version-push", "Apply the version change")).toBe(
      `set -euo pipefail\n${SAFE_GIT} apply "$RUNNER_TEMP/version/version.patch"`,
    );
  });

  it("publishes only the tarballs build planned, checked by SHA-256, with npm", () => {
    expect(stepEnv("publish", "Publish the checked tarballs")).toEqual([
      "PUBLISH_PLAN: ${{ needs.build.outputs.publish-plan }}",
    ]);
    const script = stepScript("publish", "Publish the checked tarballs");
    expect(script).toContain('sha256sum --check --strict "$plan"');
    expect(script.indexOf("sha256sum --check")).toBeLessThan(
      script.indexOf('npm publish "./'),
    );
    expect(mappingAt(release, jobKey("build", "outputs"))).toEqual([
      "publish-plan: ${{ steps.build.outputs.publish-plan }}",
    ]);
  });

  it("attests the dry run's Wrapper digest by name and digest, pushing to no registry", () => {
    const [from, to] = only(
      stepRanges(release, jobRange(release, "attest")),
      "attest step",
    );
    expect(mappingAt(release, keyLine(release, from, to, 8, "with"))).toEqual([
      "subject-name: ${{ needs.dry-run.outputs.wrapper-file-name }}",
      "subject-digest: ${{ needs.dry-run.outputs.wrapper-digest }}",
      "push-to-registry: false",
      "create-storage-record: false",
    ]);
  });

  it("uploads the dry run's Wrapper artifact and its .sha256, one file each, kept 14 days", () => {
    const uploads = stepRanges(release, jobRange(release, "dry-run")).filter(
      ([from, to]) =>
        keyLines(release, from, to, 8, "uses").some(
          index => scalarAt(release, index) === UPLOAD,
        ),
    );
    expect(
      uploads.map(([from, to]) =>
        mappingAt(release, keyLine(release, from, to, 8, "with")),
      ),
    ).toEqual(
      ["", ".sha256"].map(suffix => [
        `path: \${{ steps.tag.outputs.wrapper-path }}${suffix}`,
        "archive: false",
        "if-no-files-found: error",
        "retention-days: 14",
      ]),
    );
  });

  it("pushes only changeset-release/main, and tags only through the GitHub release", () => {
    expect(pushLines()).toEqual([PUSH]);
    for (const script of jobNames(release).flatMap(job => runsOf(job))) {
      expect(script).not.toMatch(/--follow-tags|--mirror|\bgit\s+tag\b/u);
    }
    for (const script of scriptsOutside("github-release")) {
      expect(script).not.toMatch(/\bgh\s+release\b/u);
    }
    for (const script of scriptsOutside("build")) {
      expect(script).not.toMatch(/--tags|refs\/tags/u);
    }
    // The build job only looks a tag up, read-only, before anything runs.
    expect(stepScript("build", "Refuse a release that exists")).toContain(
      `${SAFE_GIT} ls-remote --tags "\${GITHUB_SERVER_URL}/\${GITHUB_REPOSITORY}.git" "refs/tags/\${RELEASE_TAG}"`,
    );
    const create = stepScript("github-release", "Create the GitHub release");
    expect(
      create.split("\n").filter(line => /^gh\s/u.test(line.trim())),
    ).toEqual([
      'gh release create "$RELEASE_TAG" "$WRAPPER_FILE_NAME" "${WRAPPER_FILE_NAME}.sha256" --repo "$GITHUB_REPOSITORY" --target "$GITHUB_SHA" --title "$RELEASE_TAG" --notes-file "$notes"',
    ]);
    expect(create.indexOf("sha256sum --check --strict")).toBeLessThan(
      create.indexOf("gh release create"),
    );
  });

  it("runs every git command of the apply, check, and push steps without hooks or an fsmonitor", () => {
    const calls = [
      "Apply the version change",
      "Check what changeset version changed",
      "Push the changeset-release/main branch",
    ].flatMap(name => gitCalls(stepScript("version-push", name)));
    expect(calls).toHaveLength(7);
    for (const call of calls)
      expect(call.startsWith(`${SAFE_GIT} `)).toBe(true);
    expect(calls.filter(call => /\s(?:commit|push)\s/u.test(call))).toEqual([
      `${SAFE_GIT} -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" commit --no-verify --quiet --message "chore(release): version packages"`,
      PUSH,
    ]);
  });

  it("passes a token only to the changeset step, the push step, and the two release steps", () => {
    expect(
      stepEnv("version-push", "Push the changeset-release/main branch"),
    ).toEqual(["GITHUB_TOKEN: ${{ github.token }}"]);
    expect(valuesOf(release, "GITHUB_TOKEN")).toHaveLength(2);
    expect(valuesOf(release, "GH_TOKEN")).toEqual([
      "${{ github.token }}",
      "${{ github.token }}",
    ]);
    expect(stepEnv("github-release", "Refuse a release that exists")).toEqual([
      "GH_TOKEN: ${{ github.token }}",
      "RELEASE_TAG: ${{ needs.dry-run.outputs.release-tag }}",
    ]);
    expect(stepEnv("github-release", "Create the GitHub release")).toContain(
      "GH_TOKEN: ${{ github.token }}",
    );
    expect(release.filter(line => line.text.includes("secrets."))).toEqual([]);
  });

  it("refuses an existing release, draft or published, before creating one", () => {
    const names = stepRanges(release, jobRange(release, "github-release")).map(
      ([from, to]) =>
        keyLines(release, from, to, 8, "name").map(index =>
          scalarAt(release, index),
        ),
    );
    expect(names).toEqual([
      [],
      [],
      ["Refuse a release that exists"],
      ["Create the GitHub release"],
    ]);
    const guard = stepScript("github-release", "Refuse a release that exists");
    expect(guard.split("\n").filter(line => /\bgh\s/u.test(line))).toEqual([
      `matches="$(gh api --paginate "repos/\${GITHUB_REPOSITORY}/releases?per_page=100" --jq '.[] | select(.tag_name == env.RELEASE_TAG) | .tag_name')"`,
    ]);
    expect(guard.split("\n")[0]).toBe("set -euo pipefail");
  });
});
