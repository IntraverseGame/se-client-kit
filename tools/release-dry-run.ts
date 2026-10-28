// CLI: the release dry run (`pnpm release:dry-run`, the `release-dry-run` CI
// job, and the first job of the release workflow; runbook/client-kit-release.md).
// It publishes nothing and needs no credential and no network:
//
//   1. copies the working tree (the files git would commit) twice, into two
//      scratch directories of different path lengths, and installs each from
//      the lockfile offline with lifecycle scripts off;
//   2. in each copy, applies the pending changesets (`changeset version`, with
//      the changelog generator off: it would call the GitHub API) and builds
//      everything without the task cache;
//   3. in the first copy, runs the build-output and package-files checks, packs
//      the five published libraries, checks every tarball's contents
//      (tools/package-tarball.ts), and imports each packed package the way a
//      consumer would (a type-only entry must have its declaration file and
//      must not import), with the `contracts` test-only entry required not to
//      resolve;
//   4. runs `pnpm publish <tarball> --dry-run` for each tarball against an
//      unreachable local registry address, so pnpm's own publish checks run
//      without any network (provenance is exercised only in Actions, where the
//      OIDC token exists);
//   5. builds the Wrapper release artifact in each copy (the second with
//      another time zone and locale) and requires the two digests to be equal,
//      and the two copies' package tarballs to be byte-identical;
//   6. holds the first copy's Wrapper and verify page to their size budgets (tools/size-budget.ts);
//   7. writes the artifact, its `.sha256`, the tarballs, and a report to
//      `--out`, and prints the digests and the sizes against the budget.
//
// Usage: pnpm release:dry-run, or pnpm exec tsx tools/release-dry-run.ts
// [--out <empty directory outside the repository; default: a new temporary
// one>] [--keep (the scratch copies)]; not `pnpm release:dry-run -- ...` (wireit
// passes extra arguments unescaped). Installs use `pnpm store path`'s store.

import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { loadVectors } from "./build-output-vectors.ts";
import { PUBLISHED_PACKAGES, packageNameOf } from "./package-tarball.ts";
import { checkResolution } from "./release-consumer.ts";
import { publishDryRun, storeDirectory } from "./release-pnpm.ts";
import {
  buildWrapperArtifact,
  checkTarballs,
  checkReleaseSize,
  copyTree,
  type PackedLibrary,
  packLibraries,
  prepareOut,
  readJson,
  run,
  scratchEnvironment,
  sourceOf,
  versionOf,
  workingTreeFiles,
} from "./release-steps.ts";
import type { WrapperArtifact } from "./wrapper-artifact.ts";

const root = resolve(import.meta.dirname, "..");

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    keep: { type: "boolean", default: false },
  },
});

const out = prepareOut(
  root,
  values.out ?? mkdtempSync(join(tmpdir(), "se-client-kit-release-")),
);
// An empty user configuration, so no `~/.npmrc` (a token, a registry) is read
// by the scratch commands.
const userConfig = join(out, "scratch-npmrc");
writeFileSync(userConfig, "");
/** An address nothing listens on: the publish dry run reaches no registry. */
const NO_REGISTRY = "http://127.0.0.1:9/";

type CopyResult = {
  readonly directory: string;
  readonly versions: Readonly<Record<string, string>>;
  readonly packed: readonly PackedLibrary[];
  readonly wrapper: WrapperArtifact;
};

const source = sourceOf(root);
/** The offline install of a scratch copy, from the setup install's store. */
const offlineInstall = [
  "install",
  "--frozen-lockfile",
  "--offline",
  "--ignore-scripts",
  "--store-dir",
  storeDirectory(root),
];
const paths = workingTreeFiles(root);

/** Steps 1, 2, and the packing and Wrapper parts of 3 and 4, in one copy. */
const prepareCopy = (
  label: string,
  locale: Readonly<Record<string, string>>,
): CopyResult => {
  const directory = join(out, label);
  console.log(`[${label}] copying ${String(paths.length)} files`);
  copyTree(root, paths, directory);
  const env = scratchEnvironment(process.env, root, {
    ...locale,
    npm_config_userconfig: userConfig,
  });
  const options = { cwd: directory, env };
  console.log(`[${label}] installing from the lockfile (offline)`);
  run("pnpm", offlineInstall, options);
  // The changelog generator calls the GitHub API; the dry run checks versions
  // and contents, so it runs with the changelog off.
  const configPath = join(directory, ".changeset", "config.json");
  writeFileSync(
    configPath,
    `${JSON.stringify({ ...readJson(configPath), changelog: false }, undefined, 2)}\n`,
  );
  console.log(`[${label}] applying the pending changesets`);
  run("pnpm", ["exec", "changeset", "version"], options);
  // The manifests changed: install again, explicitly with lifecycle scripts
  // off (pnpm's own install-before-run is off in the scratch environment).
  run("pnpm", offlineInstall, options);
  const versions = Object.fromEntries([
    ...PUBLISHED_PACKAGES.map(
      name =>
        [
          packageNameOf(name),
          versionOf(join(directory, "packages", name)),
        ] as const,
    ),
    [
      "@intraverse/se-client-wrapper",
      versionOf(join(directory, "apps", "wrapper")),
    ] as const,
  ]);
  console.log(`[${label}] building without the task cache`);
  run("pnpm", ["build"], options);
  const packed = packLibraries(directory, join(out, `${label}-packages`), env);
  return {
    directory,
    versions,
    packed,
    wrapper: buildWrapperArtifact(directory),
  };
};

const problems: string[] = [];
const first = prepareCopy("first", {
  TZ: "UTC",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
});
const env = scratchEnvironment(process.env, root, {
  npm_config_userconfig: userConfig,
});
console.log("[first] checking the build output and the package files");
for (const check of [
  "tools/check-build-output.ts",
  "tools/check-package-files.ts",
]) {
  try {
    run("pnpm", ["exec", "tsx", check], { cwd: first.directory, env });
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
}
console.log("[first] checking the tarballs");
const loaded = loadVectors(first.directory);
problems.push(
  ...loaded.problems,
  ...checkTarballs(first.packed, loaded.vectors),
);
console.log("[first] holding the release to its size budgets");
const releaseSize = checkReleaseSize(first.directory);
problems.push(...releaseSize.problems);
console.log("[first] importing the packed packages as a consumer");
problems.push(
  ...checkResolution(first.directory, first.packed, join(out, "consumer"), env),
);

console.log("[first] publishing each tarball with --dry-run (no registry)");
problems.push(
  ...publishDryRun(first.packed, NO_REGISTRY, { cwd: first.directory, env }),
);

const second = prepareCopy("second-copy", {
  TZ: "Pacific/Kiritimati",
  LANG: "tr_TR.UTF-8",
  LC_ALL: "tr_TR.UTF-8",
});
if (first.wrapper.digest !== second.wrapper.digest) {
  problems.push(
    `the Wrapper build is not reproducible: ${first.wrapper.digest} and ${second.wrapper.digest}`,
  );
}
for (const library of first.packed) {
  const other = second.packed.find(entry => entry.name === library.name);
  if (other?.sha256 !== library.sha256) {
    problems.push(
      `the ${library.name} tarball is not reproducible: ${library.sha256} and ${String(other?.sha256)}`,
    );
  }
}

const wrapperDirectory = join(out, "wrapper");
mkdirSync(wrapperDirectory, { recursive: true });
const artifactPath = join(wrapperDirectory, first.wrapper.fileName);
writeFileSync(artifactPath, first.wrapper.archive);
writeFileSync(
  `${artifactPath}.sha256`,
  `${first.wrapper.digest.slice("sha256:".length)}  ${first.wrapper.fileName}\n`,
);
const packagesDirectory = join(out, "packages");
mkdirSync(packagesDirectory, { recursive: true });
for (const library of first.packed) {
  copyFileSync(
    library.tarball,
    join(packagesDirectory, basename(library.tarball)),
  );
}

const report = {
  source,
  versions: first.versions,
  packages: first.packed.map(library => ({
    name: packageNameOf(library.name),
    version: library.version,
    tarball: basename(library.tarball),
    sha256: library.sha256,
  })),
  wrapper: {
    artifact: first.wrapper.fileName,
    digest: first.wrapper.digest,
    rebuildDigest: second.wrapper.digest,
  },
  sizeBudget: releaseSize.rows,
  problems,
};
writeFileSync(
  join(out, "release-dry-run.json"),
  `${JSON.stringify(report, undefined, 2)}\n`,
);

if (!values.keep) {
  for (const label of [
    "first",
    "second-copy",
    "second-copy-packages",
    "first-packages",
  ]) {
    rmSync(join(out, label), { recursive: true, force: true });
  }
}

const summary = [
  "## Release dry run",
  "",
  `Source: ${source.commit}${source.dirty ? " (with uncommitted changes)" : ""}`,
  "",
  "| Package | Version | Tarball SHA-256 |",
  "| --- | --- | --- |",
  ...report.packages.map(
    library => `| ${library.name} | ${library.version} | ${library.sha256} |`,
  ),
  "",
  `Wrapper ${first.versions["@intraverse/se-client-wrapper"] ?? ""}: ${first.wrapper.fileName}`,
  "",
  `- digest: ${first.wrapper.digest}`,
  `- rebuild: ${second.wrapper.digest}`,
  "",
  ...releaseSize.table,
  "",
  problems.length === 0
    ? "No problems."
    : ["Problems:", ...problems.map(problem => `- ${problem}`)].join("\n"),
  "",
].join("\n");
console.log(`\n${summary}\nOutput: ${out}`);
const stepSummary = process.env["GITHUB_STEP_SUMMARY"];
if (stepSummary !== undefined && existsSync(stepSummary)) {
  appendFileSync(stepSummary, summary);
}
const stepOutput = process.env["GITHUB_OUTPUT"];
if (stepOutput !== undefined && existsSync(stepOutput)) {
  const { digest, fileName } = first.wrapper;
  appendFileSync(stepOutput, `wrapper-digest=${digest}\n`);
  appendFileSync(stepOutput, `wrapper-file-name=${fileName}\n`);
}
if (problems.length > 0) process.exitCode = 1;
