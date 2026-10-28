// The release workflow (.github/workflows/release.yml), read with the
// block-style reader of tools/workflow-text.ts, and the helpers its tests share
// (tools/release-workflow.test.ts, tools/release-workflow-split.test.ts).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  jobNames,
  jobRange,
  keyLine,
  keyLines,
  type Line,
  mappingAt,
  readLines,
  scalarAt,
  stepNamed,
  stepRanges,
} from "./workflow-text.ts";

export const workflow = (name: string): Line[] =>
  readLines(
    readFileSync(
      join(import.meta.dirname, "..", ".github", "workflows", name),
      "utf8",
    ),
  );

export const release = workflow("release.yml");

export const only = <T>(values: readonly T[], what: string): T => {
  const [value] = values;
  if (values.length !== 1 || value === undefined) {
    throw new Error(`expected one ${what}, found ${String(values.length)}`);
  }
  return value;
};

/** The `with:` entries of job `job`'s one checkout step. */
export const checkoutWith = (job: string): string[] => {
  const [from, to] = only(
    stepRanges(release, jobRange(release, job)).filter(([start, end]) =>
      keyLines(release, start, end, 8, "uses").some(index =>
        scalarAt(release, index).startsWith("actions/checkout@"),
      ),
    ),
    `checkout step in ${job}`,
  );
  return mappingAt(release, keyLine(release, from, to, 8, "with"));
};

/** Every value of key `key` in `lines`, at any indentation, in file order. */
export const valuesOf = (lines: readonly Line[], key: string): string[] =>
  lines.flatMap((line, index) =>
    line.text === `${key}:` || line.text.startsWith(`${key}: `)
      ? [scalarAt(lines, index)]
      : [],
  );

/** The `run:` scripts of job `job`, in order, line continuations joined. */
export const runsOf = (job: string): string[] =>
  stepRanges(release, jobRange(release, job)).flatMap(([from, to]) =>
    keyLines(release, from, to, 8, "run").map(index =>
      scalarAt(release, index).replaceAll(/\\\n\s*/gu, ""),
    ),
  );

/** The `uses:` values of job `job`, in order. */
export const usesOf = (job: string): string[] =>
  stepRanges(release, jobRange(release, job)).flatMap(([from, to]) =>
    keyLines(release, from, to, 8, "uses").map(index =>
      scalarAt(release, index),
    ),
  );

/** Every line of every `run:` script that runs `git ... push`. */
export const pushLines = (): string[] =>
  jobNames(release)
    .flatMap(job => runsOf(job))
    .flatMap(script => script.split("\n"))
    .map(line => line.trim())
    .filter(line => /\bgit\b.*\bpush\b/u.test(line));

export const jobKey = (job: string, key: string): number => {
  const [start, end] = jobRange(release, job);
  return keyLine(release, start, end, 4, key);
};

/** The `env:` entries of step `name` of job `job`. */
export const stepEnv = (job: string, name: string): string[] => {
  const [from, to] = stepNamed(release, jobRange(release, job), name);
  return mappingAt(release, keyLine(release, from, to, 8, "env"));
};

/** The git options that keep planted hooks and fsmonitors from running. */
export const SAFE_GIT =
  "git -c core.hooksPath=/dev/null -c core.fsmonitor=false";

export const PUSH = `${SAFE_GIT} -c credential.helper= -c credential.helper='!f() { echo username=x-access-token; echo "password=\${GITHUB_TOKEN}"; }; f' push --no-verify --force "\${GITHUB_SERVER_URL}/\${GITHUB_REPOSITORY}.git" HEAD:refs/heads/changeset-release/main`;

/** The publish path's gate, on each of its four jobs. */
export const PUBLISH_GATE =
  "inputs.publish && !inputs.version && github.ref == 'refs/heads/main' && vars.RELEASE_PUBLISH_ENABLED == 'true'";

export const VERSION_GATE =
  "inputs.version && !inputs.publish && github.ref == 'refs/heads/main'";

/** The `run:` script of job `job`'s step `name`, line continuations joined. */
export const stepScript = (job: string, name: string): string => {
  const [from, to] = stepNamed(release, jobRange(release, job), name);
  return scalarAt(release, keyLine(release, from, to, 8, "run")).replaceAll(
    /\\\n\s*/gu,
    "",
  );
};

/** Each git invocation in `script`: from `git` to the end of its line. */
export const gitCalls = (script: string): string[] =>
  [...script.matchAll(/(?:^|[\s;(])(git\s[^\n]*)/gmu)].map(
    match => match[1] ?? "",
  );

/** The pinned Actions (full commit SHA; ADR-005 and the supply-chain spec). */
export const CHECKOUT =
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
export const SETUP_NODE =
  "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1";
export const UPLOAD =
  "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9";
export const DOWNLOAD =
  "actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333";
export const ATTEST =
  "actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8";

/** The only lines of the token-holding jobs' scripts that name npm. */
export const NPM_LINES = [
  'version="$(npm --version)"',
  'echo "::error::Unexpected npm version: ${version}"',
  'echo "::error::npm ${version} cannot publish with trusted publishing: it needs 11.5.1 or later, which the pinned Node brings."',
  'echo "npm ${version}"',
  'echo "npm publish ${tarball}"',
  'npm publish "./${tarball}" --provenance --access public --ignore-scripts --registry https://registry.npmjs.org/',
];

/**
 * Anything that runs repository code: the setup action (an install), pnpm, tsx,
 * or a tools/ script.
 */
export const REPOSITORY_TOOLING =
  /\b(?:pnpm|pnpx|npx|tsx|node|corepack|yarn)\b|tools\//u;
