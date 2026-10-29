import { describe, expect, it } from "vitest";

import {
  ATTEST,
  CHANGESETS,
  CHECKOUT,
  DOWNLOAD,
  jobKey,
  only,
  release,
  REPOSITORY_TOOLING,
  runsOf,
  SAFE_GIT,
  SETUP,
  stepEnv,
  stepScript,
  stepWith,
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

// What each job of the release workflow runs (.github/workflows/release.yml;
// ADR-009, decisions 1 and 2, and what it keeps of ADR-005): the read-only mode
// job runs no repository tooling, the two changesets/action jobs run it with
// their write tokens (accepted by ADR-009), the Wrapper's attestation and
// assets run in jobs of their own, every hand-off is checked against the
// producing job's digest, and only the action writes tags and branches, only
// the releases step creates releases, and the assets job only uploads and edits
// the notes.

const STEPPED_JOBS = jobNames(release).filter(job => job !== "production");

/** The `ls-remote` lines of job `job`'s scripts. */
const lookups = (job: string): string[] =>
  runsOf(job)
    .flatMap(script => script.split("\n"))
    .map(line => line.trim())
    .filter(line => line.includes("ls-remote"));

describe("the release workflow's jobs", () => {
  it("runs no repository tooling in changesets-mode, attest, or wrapper-assets", () => {
    expect(usesOf("changesets-mode")).toEqual([CHECKOUT]);
    expect(usesOf("attest")).toEqual([ATTEST]);
    expect(usesOf("wrapper-assets")).toEqual([DOWNLOAD, DOWNLOAD]);
    for (const job of ["changesets-mode", "attest", "wrapper-assets"]) {
      for (const script of runsOf(job)) {
        expect(script).not.toMatch(REPOSITORY_TOOLING);
      }
    }
  });

  it("runs changesets/action in version mode in version, with the version-file guard", () => {
    expect(usesOf("version")).toEqual([CHECKOUT, SETUP, CHANGESETS]);
    const [from, to] = only(
      stepRanges(release, jobRange(release, "version")).filter(([start, end]) =>
        keyLines(release, start, end, 8, "uses").some(
          index => scalarAt(release, index) === CHANGESETS,
        ),
      ),
      "changesets/action step in version",
    );
    expect(mappingAt(release, keyLine(release, from, to, 8, "with"))).toEqual([
      "version-script: bash tools/release-version.sh",
      'commit-message: "chore: bump versions"',
      'pr-title: "chore: bump versions"',
    ]);
    expect(runsOf("version")).toEqual([]);
  });

  it("runs changesets/action in publish mode in publish, after pnpm check and the dry run", () => {
    expect(usesOf("publish")).toEqual([CHECKOUT, SETUP, CHANGESETS]);
    expect(valuesOf(release, "publish-script")).toEqual([
      "pnpm exec tsx tools/release-publish.ts --publish --out ${{ runner.temp }}/publish --expect-wrapper-digest ${{ steps.dry-run.outputs.wrapper-digest }}",
    ]);
    expect(stepWith("publish", "Publish and tag").slice(-1)).toEqual([
      "create-github-releases: false",
    ]);
    const names = stepRanges(release, jobRange(release, "publish")).map(
      ([from, to]) =>
        keyLines(release, from, to, 8, "name")
          .map(index => scalarAt(release, index))
          .join(""),
    );
    expect(names).toEqual([
      "",
      "Check that a version is still untagged",
      "",
      "Check the repository",
      "Require npm 11.5.1 or later",
      "Run the release dry run",
      "Publish and tag",
      "Create the GitHub releases",
    ]);
  });

  it("passes no token to a script in version, and in publish only to the releases step, after the tooling ran; the action keeps its default token", () => {
    const [start, end] = jobRange(release, "version");
    expect(
      release
        .slice(start, end)
        .filter(line => /GITHUB_TOKEN|GH_TOKEN|github\.token/u.test(line.text)),
    ).toEqual([]);
    expect(
      stepEnv("publish", "Create the GitHub releases").filter(entry =>
        /TOKEN|token/u.test(entry),
      ),
    ).toEqual(["GH_TOKEN: ${{ github.token }}"]);
    const [publishStart, publishEnd] = jobRange(release, "publish");
    expect(
      release
        .slice(publishStart, publishEnd)
        .filter(line => /GITHUB_TOKEN|GH_TOKEN|github\.token/u.test(line.text)),
    ).toHaveLength(1);
    expect(valuesOf(release, "github-token")).toEqual([]);
  });

  it("passes the job token only to the mode step and the assets steps", () => {
    const holders = STEPPED_JOBS.flatMap(job =>
      stepRanges(release, jobRange(release, job)).flatMap(([from, to]) =>
        keyLines(release, from, to, 8, "env").flatMap(index =>
          mappingAt(release, index)
            .filter(entry => entry.includes("github.token"))
            .map(entry => `${job} ${entry}`),
        ),
      ),
    );
    expect(holders).toEqual([
      "changesets-mode GH_TOKEN: ${{ github.token }}",
      "publish GH_TOKEN: ${{ github.token }}",
      "wrapper-assets GH_TOKEN: ${{ github.token }}",
      "wrapper-assets GH_TOKEN: ${{ github.token }}",
      "wrapper-assets GH_TOKEN: ${{ github.token }}",
    ]);
  });

  it("builds the Wrapper twice and uploads it and its .sha256, one file each, kept 14 days", () => {
    expect(usesOf("wrapper-build")).toEqual([CHECKOUT, SETUP, UPLOAD, UPLOAD]);
    expect(stepScript("wrapper-build", "Run the release dry run")).toBe(
      'pnpm exec tsx tools/release-dry-run.ts --out "$RUNNER_TEMP/release-dry-run"',
    );
    const uploads = stepRanges(
      release,
      jobRange(release, "wrapper-build"),
    ).filter(([from, to]) =>
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
    expect(stepScript("wrapper-build", "Name the release")).toContain(
      '"@intraverse/se-client-wrapper@${BASH_REMATCH[1]}" != "$RELEASE_TAG"',
    );
  });

  it("attests wrapper-build's Wrapper digest by name and digest, pushing to no registry", () => {
    const [from, to] = only(
      stepRanges(release, jobRange(release, "attest")),
      "attest step",
    );
    expect(mappingAt(release, keyLine(release, from, to, 8, "with"))).toEqual([
      "subject-name: ${{ needs.wrapper-build.outputs.wrapper-file-name }}",
      "subject-digest: ${{ needs.wrapper-build.outputs.wrapper-digest }}",
      "push-to-registry: false",
      "create-storage-record: false",
    ]);
  });

  it("checks the Wrapper's files against the attested digest before attaching them to its release", () => {
    expect(
      stepEnv("wrapper-assets", "Attach the Wrapper artifact").join(" "),
    ).toBe(
      [
        "GH_TOKEN: ${{ github.token }}",
        "RELEASE_TAG: ${{ needs.wrapper-build.outputs.release-tag }}",
        "WRAPPER_DIGEST: ${{ needs.wrapper-build.outputs.wrapper-digest }}",
        "WRAPPER_FILE_NAME:",
        "${{ needs.wrapper-build.outputs.wrapper-file-name }}",
      ].join(" "),
    );
    const attach = stepScript("wrapper-assets", "Attach the Wrapper artifact");
    expect(
      attach.split("\n").filter(line => /^gh\s/u.test(line.trim())),
    ).toEqual([
      'gh release upload "$RELEASE_TAG" "$WRAPPER_FILE_NAME" "${WRAPPER_FILE_NAME}.sha256" --repo "$GITHUB_REPOSITORY"',
    ]);
    expect(attach).toContain(
      '"$(cat "${WRAPPER_FILE_NAME}.sha256")" != "${WRAPPER_DIGEST#sha256:}  ${WRAPPER_FILE_NAME}"',
    );
    expect(attach.indexOf("sha256sum --check --strict")).toBeLessThan(
      attach.indexOf("gh release upload"),
    );
    const names = stepRanges(release, jobRange(release, "wrapper-assets")).map(
      ([from, to]) =>
        keyLines(release, from, to, 8, "name").map(index =>
          scalarAt(release, index),
        ),
    );
    expect(names).toEqual([
      [],
      [],
      ["Find the Wrapper release"],
      ["Attach the Wrapper artifact"],
      ["Add the verify command to the release notes"],
    ]);
  });

  it("creates no tag or branch in a script; only the releases step creates a release, never a tag, and wrapper-assets only uploads and edits the notes", () => {
    const scripts = STEPPED_JOBS.flatMap(job => runsOf(job));
    for (const script of scripts) {
      expect(script).not.toMatch(
        /\bgit\s+(?:-c\s+\S+\s+)*(?:tag|push|commit)\b|--follow-tags|--mirror/u,
      );
      expect(script).not.toMatch(/\bgh\s+release\s+delete\b/u);
    }
    const creates = scripts
      .flatMap(script => script.split("\n"))
      .map(line => line.trim())
      .filter(line => /\bgh\s+release\s+create\b/u.test(line));
    expect(creates).toEqual([
      'gh release create "$tag" --repo "$GITHUB_REPOSITORY" --verify-tag --target "$GITHUB_SHA" --title "$tag" "${prerelease[@]+"${prerelease[@]}"}" --notes-file "$notes"',
    ]);
    expect(stepScript("publish", "Create the GitHub releases")).toContain(
      "gh release create",
    );
    expect(
      scripts
        .flatMap(script => script.split("\n"))
        .map(line => line.trim())
        .filter(line => /\bgh\s+release\s+edit\b/u.test(line)),
    ).toEqual([
      'gh release edit "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --notes-file "$notes"',
    ]);
    // Tags are only looked up, read-only, on the public URL.
    const found = `found="$(${SAFE_GIT} ls-remote --tags "\${GITHUB_SERVER_URL}/\${GITHUB_REPOSITORY}.git" "$tag" |`;
    expect(lookups("changesets-mode")).toEqual([found]);
    expect(lookups("publish")).toEqual([
      found,
      `refs="$(${SAFE_GIT} ls-remote --tags "\${GITHUB_SERVER_URL}/\${GITHUB_REPOSITORY}.git" "$ref")"`,
    ]);
  });

  it("finds the bump merge with one read-only API call", () => {
    const mode = stepScript(
      "changesets-mode",
      "Decide what this push releases",
    );
    expect(
      mode
        .split("\n")
        .map(line => line.trim())
        .filter(line => /\bgh\s/u.test(line)),
    ).toEqual([
      `merges="$(gh api --paginate "repos/\${GITHUB_REPOSITORY}/commits/\${GITHUB_SHA}/pulls?per_page=100" --jq '.[] | select(.head.ref == "changeset-release/main" and .head.repo.full_name == env.GITHUB_REPOSITORY and .base.ref == "main" and .merged_at != null and .merge_commit_sha == env.GITHUB_SHA) | .number')"`,
    ]);
    expect(mappingAt(release, jobKey("changesets-mode", "outputs"))).toEqual([
      "pending: ${{ steps.mode.outputs.pending }}",
      "release-candidate: ${{ steps.mode.outputs.release-candidate }}",
    ]);
  });
});
