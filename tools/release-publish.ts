// CLI: the publish step of the release workflow (.github/workflows/release.yml,
// job `publish`; runbook/client-kit-release.md). It runs in the checkout of the
// commit being released, after the dry run passed on that commit:
//
//   1. builds everything without the task cache, packs the five libraries,
//      and runs the same tarball and consumer checks as the dry run;
//   2. refuses to go on (tools/release-readiness.ts) while a changeset is
//      pending, while a library is still `private` or at 0.0.0, while the
//      Wrapper build is not the one the dry run reported
//      (`--expect-wrapper-digest`, required with `--publish`), or while the
//      Wrapper is over its size budget (tools/size-budget.ts);
//   3. publishes **the checked tarballs themselves** (`pnpm publish <tarball>`,
//      with provenance, public access, and lifecycle scripts off), in
//      dependency order. A version the registry already has is skipped only
//      when the registry holds exactly these bytes; other bytes fail.
//
// Without `--publish`, every `pnpm publish` runs with `--dry-run`. The
// credential is not handled here: npm trusted publishing exchanges the job's
// OIDC token itself, and nothing is read from or written to a file.
//
// This script still runs repository tooling in the job that holds
// `id-token: write`. Before any real publish, the job is split in two (a build
// job without `id-token`, and a publish-only job that verifies the digests and
// publishes the downloaded tarballs): runbook, Bootstrap step 7.
//
// Usage: tsx tools/release-publish.ts --out <directory>
//          [--expect-wrapper-digest sha256:<hex>] [--publish]

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { loadVectors } from "./build-output-vectors.ts";
import { PUBLISHED_PACKAGES, packageNameOf } from "./package-tarball.ts";
import { checkResolution } from "./release-consumer.ts";
import {
  findReadinessProblems,
  type RegistryVersion,
  registryDecision,
} from "./release-readiness.ts";
import {
  buildWrapperArtifact,
  checkTarballs,
  checkWrapperSize,
  packLibraries,
  prepareOut,
  readJson,
  run,
  scratchEnvironment,
} from "./release-steps.ts";

/** The public npm registry; the kit publishes nowhere else. */
const REGISTRY = "https://registry.npmjs.org";

const root = resolve(import.meta.dirname, "..");

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    "expect-wrapper-digest": { type: "string" },
    publish: { type: "boolean", default: false },
  },
});
if (values.out === undefined) throw new Error("--out is required.");
const out = prepareOut(root, values.out);

const fail = (problems: readonly string[], message: string): never => {
  for (const problem of problems) console.error(`  ${problem}`);
  throw new Error(message);
};

const env = scratchEnvironment(process.env, root);
console.log("building without the task cache");
run("pnpm", ["build"], { cwd: root, env });
const packed = packLibraries(root, join(out, "packages"), env);
const loaded = loadVectors(root);
const wrapper = buildWrapperArtifact(root);
const problems = [
  ...findReadinessProblems({
    changesetFiles: readdirSync(join(root, ".changeset")),
    manifests: new Map(
      PUBLISHED_PACKAGES.map(name => [
        name,
        readJson(join(root, "packages", name, "package.json")),
      ]),
    ),
    publish: values.publish,
    expectedDigest: values["expect-wrapper-digest"],
    actualDigest: wrapper.digest,
  }),
  ...checkWrapperSize(root).problems,
  ...loaded.problems,
  ...checkTarballs(packed, loaded.vectors),
  ...checkResolution(root, packed, join(out, "consumer"), env),
];
if (problems.length > 0) {
  fail(problems, "Not ready to publish; nothing was published.");
}

/** The registry's document for one version, or `absent` on a 404. */
const registryVersion = async (
  name: string,
  version: string,
): Promise<RegistryVersion> => {
  const response = await fetch(
    `${REGISTRY}/${name.replace("/", "%2f")}/${encodeURIComponent(version)}`,
  );
  if (response.status === 404) return { state: "absent" };
  if (!response.ok) {
    throw new Error(
      `The registry answered ${String(response.status)} for ${name}@${version}.`,
    );
  }
  return { state: "present", document: (await response.json()) as unknown };
};

const decisions = await Promise.all(
  packed.map(async library =>
    registryDecision(
      `${packageNameOf(library.name)}@${library.version}`,
      library.integrity,
      await registryVersion(packageNameOf(library.name), library.version),
    ),
  ),
);
const registryProblems = decisions.flatMap(decision =>
  "problem" in decision ? [decision.problem] : [],
);
if (registryProblems.length > 0) {
  fail(registryProblems, "The registry disagrees; nothing was published.");
}

// One at a time, in dependency order (PUBLISHED_PACKAGES), so a dependency is
// on the registry before the package that needs it.
for (const [index, library] of packed.entries()) {
  const label = `${packageNameOf(library.name)}@${library.version}`;
  const decision = decisions[index];
  if (decision === undefined || !("action" in decision)) {
    throw new Error(`No registry decision for ${label}.`);
  }
  if (decision.action === "skip") {
    console.log(`${label} is already published with these bytes; skipped`);
    continue;
  }
  const args = [
    "publish",
    library.tarball,
    "--provenance",
    "--access",
    "public",
    "--ignore-scripts",
    "--no-git-checks",
    ...(values.publish ? [] : ["--dry-run"]),
  ];
  console.log(`pnpm ${args.join(" ")}`);
  // The publish needs the job's OIDC variables, so it gets the real
  // environment, not the scratch one.
  console.log(run("pnpm", args, { cwd: root, env: process.env }));
}
console.log(`Wrapper ${wrapper.fileName}: ${wrapper.digest}`);
