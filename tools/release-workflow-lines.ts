// The release workflow (.github/workflows/release.yml) and the production
// deploy it calls (.github/workflows/pages-prod.yml), read with the
// block-style reader of tools/workflow-text.ts, and the helpers their tests
// share (tools/release-workflow.test.ts, tools/release-workflow-split.test.ts,
// tools/release-mode.test.ts, tools/release-assets-guard.test.ts,
// tools/pages-prod-workflow.test.ts).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
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
export const prod = workflow("pages-prod.yml");

export const only = <T>(values: readonly T[], what: string): T => {
  const [value] = values;
  if (values.length !== 1 || value === undefined) {
    throw new Error(`expected one ${what}, found ${String(values.length)}`);
  }
  return value;
};

/** The `with:` entries of job `job`'s one checkout step. */
export const checkoutWith = (
  job: string,
  lines: readonly Line[] = release,
): string[] => {
  const [from, to] = only(
    stepRanges(lines, jobRange(lines, job)).filter(([start, end]) =>
      keyLines(lines, start, end, 8, "uses").some(index =>
        scalarAt(lines, index).startsWith("actions/checkout@"),
      ),
    ),
    `checkout step in ${job}`,
  );
  return mappingAt(lines, keyLine(lines, from, to, 8, "with"));
};

/** Every value of key `key` in `lines`, at any indentation, in file order. */
export const valuesOf = (lines: readonly Line[], key: string): string[] =>
  lines.flatMap((line, index) =>
    line.text === `${key}:` || line.text.startsWith(`${key}: `)
      ? [scalarAt(lines, index)]
      : [],
  );

/** The `run:` scripts of job `job`, in order, line continuations joined. */
export const runsOf = (
  job: string,
  lines: readonly Line[] = release,
): string[] =>
  stepRanges(lines, jobRange(lines, job)).flatMap(([from, to]) =>
    keyLines(lines, from, to, 8, "run").map(index =>
      scalarAt(lines, index).replaceAll(/\\\n\s*/gu, ""),
    ),
  );

/** The `uses:` values of job `job`'s steps, in order. */
export const usesOf = (
  job: string,
  lines: readonly Line[] = release,
): string[] =>
  stepRanges(lines, jobRange(lines, job)).flatMap(([from, to]) =>
    keyLines(lines, from, to, 8, "uses").map(index => scalarAt(lines, index)),
  );

export const jobKey = (
  job: string,
  key: string,
  lines: readonly Line[] = release,
): number => {
  const [start, end] = jobRange(lines, job);
  return keyLine(lines, start, end, 4, key);
};

/** The job-level keys `key` of job `job` (none or one). */
export const jobKeys = (
  job: string,
  key: string,
  lines: readonly Line[] = release,
): number[] => {
  const [start, end] = jobRange(lines, job);
  return keyLines(lines, start, end, 4, key);
};

/** The `env:` entries of step `name` of job `job`. */
export const stepEnv = (
  job: string,
  name: string,
  lines: readonly Line[] = release,
): string[] => {
  const [from, to] = stepNamed(lines, jobRange(lines, job), name);
  return mappingAt(lines, keyLine(lines, from, to, 8, "env"));
};

/** The `with:` entries of step `name` of job `job`. */
export const stepWith = (
  job: string,
  name: string,
  lines: readonly Line[] = release,
): string[] => {
  const [from, to] = stepNamed(lines, jobRange(lines, job), name);
  return mappingAt(lines, keyLine(lines, from, to, 8, "with"));
};

/** The `run:` script of job `job`'s step `name`, as written. */
export const stepRun = (
  job: string,
  name: string,
  lines: readonly Line[] = release,
): string => {
  const [from, to] = stepNamed(lines, jobRange(lines, job), name);
  return scalarAt(lines, keyLine(lines, from, to, 8, "run"));
};

/** The `run:` script of job `job`'s step `name`, line continuations joined. */
export const stepScript = (
  job: string,
  name: string,
  lines: readonly Line[] = release,
): string => stepRun(job, name, lines).replaceAll(/\\\n\s*/gu, "");

/** The git options that keep planted hooks and fsmonitors from running. */
export const SAFE_GIT =
  "git -c core.hooksPath=/dev/null -c core.fsmonitor=false";

/**
 * The pinned Actions (full commit SHA; ADR-005, ADR-009, the supply-chain
 * spec).
 */
export const CHECKOUT =
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
export const UPLOAD =
  "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9";
export const DOWNLOAD =
  "actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333";
export const ATTEST =
  "actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8";
export const CHANGESETS =
  "changesets/action@ae32849d5ba541f9ae29e40e22a623bc13562f51";
export const SETUP = "./.github/actions/setup";

/**
 * Anything that runs repository code: the setup action (an install), pnpm, tsx,
 * or a tools/ script.
 */
export const REPOSITORY_TOOLING =
  /\b(?:pnpm|pnpx|npx|tsx|node|corepack|yarn)\b|tools\//u;
