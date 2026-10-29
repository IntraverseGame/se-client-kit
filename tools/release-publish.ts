// CLI: the publish command of the release workflow
// (.github/workflows/release.yml, job `publish`; changesets/action's
// `publish-script`; ADR-009; runbook/client-kit-release.md, Release). It runs
// in the checkout of the bump merge, after `pnpm check` and the release dry
// run passed on that commit, in the job that holds the OIDC token (environment
// `release`):
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
//      `publish-plan`;
//   5. with `--publish` only (tools/release-publish-run.ts): checks each
//      planned tarball against the plan's SHA-256, then runs `npm publish
//      <tarball> --provenance --access public --ignore-scripts` on each, in the
//      plan's order, with the npm CLI of the pinned Node (npm trusted
//      publishing exchanges the job's OIDC token itself; no npm token
//      anywhere), then `changeset git-tag`, which tags every package whose
//      version has no tag yet (the Wrapper, which is private and never on
//      npm, and a library a failed run published without its tag) and
//      reports each tag to changesets/action through CHANGESETS_OUTPUT; the
//      action only pushes the tags, and the `publish` job's "Create the
//      GitHub releases" step then creates each release, with that version's
//      CHANGELOG section as its notes.
//
// Without `--publish` it publishes nothing. The five tarballs stay in
// `<out>/packages/`.
//
// Usage: tsx tools/release-publish.ts [--publish] --out <directory>
//          --expect-wrapper-digest sha256:<hex>

import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { loadVectors } from "./build-output-vectors.ts";
import { PUBLISHED_PACKAGES, packageNameOf } from "./package-tarball.ts";
import { checkResolution } from "./release-consumer.ts";
import { publishPlanned, runShown } from "./release-publish-run.ts";
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
  sha256Hex,
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

// The job's own environment (in Actions, its OIDC request variables and the
// action's CHANGESETS_OUTPUT), not the scratch one: npm exchanges the OIDC
// token, and `changeset git-tag` reports its tags.
if (values.publish) {
  publishPlanned({
    plan,
    packagesDirectory: join(out, "packages"),
    root,
    env: process.env,
    registry: `${REGISTRY}/`,
    sha256Of: path => sha256Hex(readFileSync(path)),
    run: runShown,
  });
}
