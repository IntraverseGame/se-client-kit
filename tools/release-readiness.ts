// The publish gate of the release workflow (tools/release-publish.ts;
// runbook/client-kit-release.md, Release), as pure functions so every refusal
// is unit-tested (tools/release-readiness.test.ts).

import { packageNameOf, PUBLISHED_PACKAGES } from "./package-tarball.ts";

export type Readiness = {
  /** The file names in `.changeset/`. */
  readonly changesetFiles: readonly string[];
  /** Each published library's `package.json`, by directory name. */
  readonly manifests: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  /** The Wrapper's `package.json` version (`apps/wrapper`), if it has one. */
  readonly wrapperVersion: unknown;
  /** The dry run's Wrapper digest (`--expect-wrapper-digest`), if given. */
  readonly expectedDigest: string | undefined;
  /** The digest of the Wrapper this run built. */
  readonly actualDigest: string;
};

/**
 * The reasons not to publish; empty means ready. It refuses a pending changeset
 * (the version pull request is not merged), a library that is missing,
 * `private`, or at 0.0.0, a Wrapper without a version or at 0.0.0 (its release
 * would be tagged `@intraverse/se-client-wrapper@0.0.0`), and a missing
 * expected digest or one that differs from this run's build (fail closed).
 *
 * This is the guard the kit relies on against publishing a `private` package:
 * the kit publishes tarballs (`npm publish <tarball>` in the release workflow's
 * `publish` job), and pnpm 12.10.1, which the dry run's publish checks use,
 * does not refuse a private package's tarball (its `--dry-run` goes through).
 */
export const findReadinessProblems = (readiness: Readiness): string[] => {
  const problems: string[] = [];
  const pending = readiness.changesetFiles.filter(
    file => file.endsWith(".md") && file !== "README.md",
  );
  if (pending.length > 0) {
    problems.push(
      `${String(pending.length)} changesets are pending: merge the version pull request first`,
    );
  }
  for (const name of PUBLISHED_PACKAGES) {
    const manifest = readiness.manifests.get(name);
    if (manifest === undefined) {
      problems.push(`${packageNameOf(name)} has no manifest`);
      continue;
    }
    if (manifest["private"] !== undefined && manifest["private"] !== false) {
      problems.push(`${packageNameOf(name)} is still private`);
    }
    if (typeof manifest["version"] !== "string") {
      problems.push(`${packageNameOf(name)} has no version`);
    } else if (manifest["version"] === "0.0.0") {
      problems.push(`${packageNameOf(name)} is at 0.0.0`);
    }
  }
  if (typeof readiness.wrapperVersion !== "string") {
    problems.push("@intraverse/se-client-wrapper has no version");
  } else if (readiness.wrapperVersion === "0.0.0") {
    problems.push("@intraverse/se-client-wrapper is at 0.0.0");
  }
  if (readiness.expectedDigest === undefined) {
    problems.push(
      "--expect-wrapper-digest is required (the dry run's Wrapper digest)",
    );
  } else if (readiness.expectedDigest !== readiness.actualDigest) {
    problems.push(
      `the Wrapper build (${readiness.actualDigest}) is not the dry run's (${readiness.expectedDigest})`,
    );
  }
  return problems;
};

export type RegistryVersion =
  | { readonly state: "absent" }
  | { readonly state: "present"; readonly document: unknown };

/**
 * What to do with one tarball given the registry's answer for its version:
 * publish it when the version is absent, skip it when the registry already has
 * exactly these bytes (`dist.integrity`, the tarball's SHA-512), and fail when
 * the registry holds other bytes under the same version, or gives no
 * integrity.
 */
export const registryDecision = (
  label: string,
  localIntegrity: string,
  registry: RegistryVersion,
): { readonly action: "publish" | "skip" } | { readonly problem: string } => {
  if (registry.state === "absent") return { action: "publish" };
  const { document } = registry;
  const dist =
    typeof document === "object" && document !== null && "dist" in document
      ? (document as { dist?: unknown }).dist
      : undefined;
  const integrity =
    typeof dist === "object" && dist !== null && "integrity" in dist
      ? (dist as { integrity?: unknown }).integrity
      : undefined;
  if (typeof integrity !== "string") {
    return {
      problem: `${label} is on the registry without an integrity to compare`,
    };
  }
  if (integrity !== localIntegrity) {
    return {
      problem: `${label} is on the registry with other bytes (${integrity}, local ${localIntegrity})`,
    };
  }
  return { action: "skip" };
};
