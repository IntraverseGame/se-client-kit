import { describe, expect, it } from "vitest";

import { PUBLISHED_PACKAGES } from "./package-tarball.ts";
import {
  findReadinessProblems,
  type Readiness,
  registryDecision,
} from "./release-readiness.ts";

const DIGEST = `sha256:${"a".repeat(64)}`;

const manifests = (
  overrides: Readonly<Record<string, Record<string, unknown> | undefined>> = {},
): Map<string, Record<string, unknown>> => {
  const map = new Map<string, Record<string, unknown>>();
  for (const name of PUBLISHED_PACKAGES) {
    const manifest = name in overrides ? overrides[name] : { version: "1.0.0" };
    if (manifest !== undefined) map.set(name, manifest);
  }
  return map;
};

const ready = (overrides: Partial<Readiness> = {}): Readiness => ({
  changesetFiles: ["README.md", "config.json"],
  manifests: manifests(),
  wrapperVersion: "1.0.0",
  expectedDigest: DIGEST,
  actualDigest: DIGEST,
  ...overrides,
});

describe("findReadinessProblems", () => {
  it("passes a versioned, public release whose digest matches", () => {
    expect(findReadinessProblems(ready())).toEqual([]);
  });

  it("refuses a pending changeset", () => {
    expect(
      findReadinessProblems(
        ready({ changesetFiles: ["README.md", "config.json", "a-change.md"] }),
      ),
    ).toEqual([
      "1 changesets are pending: merge the version pull request first",
    ]);
  });

  it.each([[true], ["true"], [1]])("refuses private: %j", value => {
    expect(
      findReadinessProblems(
        ready({
          manifests: manifests({ shell: { version: "1.0.0", private: value } }),
        }),
      ),
    ).toEqual(["@intraverse/se-client-shell is still private"]);
  });

  it("accepts private: false", () => {
    expect(
      findReadinessProblems(
        ready({
          manifests: manifests({ shell: { version: "1.0.0", private: false } }),
        }),
      ),
    ).toEqual([]);
  });

  it("refuses a library at 0.0.0", () => {
    expect(
      findReadinessProblems(
        ready({ manifests: manifests({ signing: { version: "0.0.0" } }) }),
      ),
    ).toEqual(["@intraverse/se-client-signing is at 0.0.0"]);
  });

  it("refuses a library without a version or a manifest", () => {
    expect(
      findReadinessProblems(
        ready({ manifests: manifests({ snapshot: {}, contracts: undefined }) }),
      ),
    ).toEqual([
      "@intraverse/se-client-contracts has no manifest",
      "@intraverse/se-client-snapshot has no version",
    ]);
  });

  it("refuses a Wrapper at 0.0.0 or without a version", () => {
    expect(findReadinessProblems(ready({ wrapperVersion: "0.0.0" }))).toEqual([
      "@intraverse/se-client-wrapper is at 0.0.0",
    ]);
    expect(findReadinessProblems(ready({ wrapperVersion: undefined }))).toEqual(
      ["@intraverse/se-client-wrapper has no version"],
    );
  });

  it("refuses a digest mismatch", () => {
    const other = `sha256:${"b".repeat(64)}`;
    expect(findReadinessProblems(ready({ actualDigest: other }))).toEqual([
      `the Wrapper build (${other}) is not the dry run's (${DIGEST})`,
    ]);
  });

  it("refuses a missing digest", () => {
    expect(findReadinessProblems(ready({ expectedDigest: undefined }))).toEqual(
      ["--expect-wrapper-digest is required (the dry run's Wrapper digest)"],
    );
  });
});

describe("registryDecision", () => {
  const LOCAL = "sha512-local";

  it("publishes a version the registry does not have", () => {
    expect(registryDecision("x@1", LOCAL, { state: "absent" })).toEqual({
      action: "publish",
    });
  });

  it("skips a version the registry has with the same bytes", () => {
    expect(
      registryDecision("x@1", LOCAL, {
        state: "present",
        document: { dist: { integrity: LOCAL } },
      }),
    ).toEqual({ action: "skip" });
  });

  it("fails on a version the registry has with other bytes", () => {
    expect(
      registryDecision("x@1", LOCAL, {
        state: "present",
        document: { dist: { integrity: "sha512-other" } },
      }),
    ).toEqual({
      problem:
        "x@1 is on the registry with other bytes (sha512-other, local sha512-local)",
    });
  });

  it.each([[{}], [{ dist: {} }], [null], ["text"]])(
    "fails when the registry gives no integrity: %j",
    document => {
      expect(
        registryDecision("x@1", LOCAL, { state: "present", document }),
      ).toEqual({
        problem: "x@1 is on the registry without an integrity to compare",
      });
    },
  );
});
