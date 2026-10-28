// CLI: the build step of the release workflow's publish path
// (.github/workflows/release.yml, job `build`; runbook/client-kit-release.md,
// Release step 3). It runs in the checkout of the commit being released, after
// the dry run passed on that commit, in a job that holds no OIDC token and no
// write token, and it publishes nothing:
//
//   1. builds everything without the task cache, packs the five libraries,
//      and runs the same tarball and consumer checks as the dry run;
//   2. refuses to go on (tools/release-readiness.ts) while a changeset is
//      pending, while a library is still `private` or at 0.0.0, while the
//      Wrapper is at 0.0.0, while the Wrapper build is not the one the dry run
//      reported
//      (`--expect-wrapper-digest`, required), or while the Wrapper or the
//      verify page in it is over its size budget (tools/size-budget.ts);
//   3. asks the registry about each version: a version the registry already
//      has is skipped only when the registry holds exactly these bytes; other
//      bytes fail;
//   4. writes the publish plan: one `<sha256>  <tarball>` line per tarball to
//      publish, in dependency order (`sha256sum --check` format), to
//      `<out>/publish-plan.sha256` and, in Actions, to the step output
//      `publish-plan`.
//
// The five tarballs stay in `<out>/packages/`; the workflow uploads them, and
// the `publish` job (which holds `id-token: write` and runs no repository
// tooling) checks each against the plan's SHA-256 and runs
// `npm publish <tarball>` on it, in the plan's order.
//
// Usage: tsx tools/release-publish.ts --out <directory>
//          --expect-wrapper-digest sha256:<hex>

import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
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
  checkReleaseSize,
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
    wrapperVersion: readJson(join(root, "apps", "wrapper", "package.json"))[
      "version"
    ],
    expectedDigest: values["expect-wrapper-digest"],
    actualDigest: wrapper.digest,
  }),
  ...checkReleaseSize(root).problems,
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

// In dependency order (PUBLISHED_PACKAGES), so the publish job puts a
// dependency on the registry before the package that needs it.
const plan: string[] = [];
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
  console.log(`${label} is to be published`);
  plan.push(`${library.sha256}  ${basename(library.tarball)}`);
}
const planText = plan.map(line => `${line}\n`).join("");
writeFileSync(join(out, "publish-plan.sha256"), planText);
console.log(`Wrapper ${wrapper.fileName}: ${wrapper.digest}`);
console.log(
  `Publish plan:\n${planText === "" ? "(nothing to publish)\n" : planText}`,
);
const stepOutput = process.env["GITHUB_OUTPUT"];
if (stepOutput !== undefined && existsSync(stepOutput)) {
  const delimiter = `publish-plan-${randomUUID()}`;
  appendFileSync(
    stepOutput,
    `publish-plan<<${delimiter}\n${planText}${delimiter}\n`,
  );
}
