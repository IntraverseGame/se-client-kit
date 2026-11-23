// The size budget of the Wrapper's release output and of the verify page and
// the signing page in it (specs/client-kit/testing-and-ci.md, the `build` job;
// runbook/client-kit-release.md, Verify before and after). The measuring and
// the judging are pure functions, unit-tested in tools/size-budget.test.ts;
// `pnpm check:size-budget` (tools/check-size-budget.ts, part of `pnpm check`
// and the `build` CI job), the release dry run, and the publish step apply them
// to the built `apps/wrapper/dist/`.

import { gzipSync } from "node:zlib";

/** One measured size of the release output, in bytes. */
export type Measurement = {
  readonly name: string;
  readonly bytes: number;
};

/** The most bytes a measurement may have; equal to the limit still passes. */
export type Budget = {
  readonly name: string;
  readonly limit: number;
};

/**
 * Every file of the release output but the verify page's, uncompressed. The
 * verify page's files, under `verify/`, are measured on their own (D-3 of
 * specs/verify-page.md) and do not count here.
 */
export const WRAPPER_OUTPUT = "wrapper output";
/**
 * The page and the scripts and stylesheets it loads, each compressed on its own
 * with gzip at zlib's default level: about what a player's browser downloads.
 */
export const WRAPPER_PAGE_GZIP = "wrapper page, gzip";

/**
 * The Wrapper's budget, in bytes (decided by the human, 2026-10-18: about 25%
 * over the 161873 and 52650 bytes measured that day; raised by the human on
 * 2026-11-13 for RFC-005, about 25% over the 231808 and 73299 bytes measured
 * that day). A change is a reviewed change to this list and the spec's
 * together.
 */
export const WRAPPER_BUDGET: readonly Budget[] = [
  { name: WRAPPER_OUTPUT, limit: 286_720 },
  { name: WRAPPER_PAGE_GZIP, limit: 92_160 },
];

/** Every file under `verify/`, uncompressed. */
export const VERIFY_OUTPUT = "verify output";
/**
 * `verify/index.html` and every `.js` and `.css` file under `verify/`, each
 * gzipped at zlib's default level and summed.
 */
export const VERIFY_PAGE_GZIP = "verify page, gzip";

/**
 * The verify page's budget, in bytes (decided by the human, 2026-10-20: about
 * 25% over the 119788 and 39199 bytes its first build measured; raised by the
 * human on 2026-11-20 for the Solana read, RFC-007 slice 4, about 25% over the
 * 150909 and 48928 bytes measured that day; V-16, D-3). A change is a reviewed
 * change to this list and the spec's together.
 */
export const VERIFY_BUDGET: readonly Budget[] = [
  { name: VERIFY_OUTPUT, limit: 188_416 },
  { name: VERIFY_PAGE_GZIP, limit: 61_440 },
];

/** Every file under `signer/`, uncompressed (specs/signing-page.md, SP-14). */
export const SIGNER_OUTPUT = "signer output";
/**
 * `signer/index.html` and every `.js` and `.css` file under `signer/`, each
 * gzipped at zlib's default level and summed.
 */
export const SIGNER_PAGE_GZIP = "signer page, gzip";

/**
 * The signing page's budget, in bytes (SP-14): set by the human from the first
 * build's measurement on 2026-11-21 (62565 and 23469 bytes), about 25% over it,
 * as for the verify page; approved by the human, 2026-11-21. A change is a
 * reviewed change to this list and the spec's together.
 */
export const SIGNER_BUDGET: readonly Budget[] = [
  { name: SIGNER_OUTPUT, limit: 78_848 },
  { name: SIGNER_PAGE_GZIP, limit: 29_696 },
];

/** Every budget: a release is held to every one of them. */
export const RELEASE_BUDGET: readonly Budget[] = [
  ...WRAPPER_BUDGET,
  ...VERIFY_BUDGET,
  ...SIGNER_BUDGET,
];

const PAGE = "index.html";
const VERIFY_DIR = "verify";
const SIGNER_DIR = "signer";
/** The pages measured on their own, each under its own directory. */
const OWN_BUDGET_DIRS: readonly string[] = [VERIFY_DIR, SIGNER_DIR];
const LOADED_BY_THE_PAGE = /\.(?:js|css)$/iu;

const gzipped = (bytes: Uint8Array): number => gzipSync(bytes).byteLength;

/**
 * The measurements of the Wrapper's own release output: `files` is every file
 * of `apps/wrapper/dist/`, by path relative to it with `/` separators. The
 * files under `verify/` and `signer/` are not counted.
 */
export const measureWrapperOutput = (
  files: ReadonlyMap<string, Uint8Array>,
): Measurement[] => {
  let output = 0;
  let page = 0;
  for (const [path, bytes] of files) {
    if (OWN_BUDGET_DIRS.some(dir => path.startsWith(`${dir}/`))) continue;
    output += bytes.byteLength;
    if (path === PAGE || LOADED_BY_THE_PAGE.test(path)) page += gzipped(bytes);
  }
  return [
    { name: WRAPPER_OUTPUT, bytes: output },
    { name: WRAPPER_PAGE_GZIP, bytes: page },
  ];
};

/**
 * The measurements of the page under `dir`: its files only, uncompressed, and
 * its `index.html` and every script and stylesheet under it gzipped.
 */
const measurePageDir = (
  files: ReadonlyMap<string, Uint8Array>,
  dir: string,
  names: readonly [output: string, pageGzip: string],
): Measurement[] => {
  let output = 0;
  let page = 0;
  for (const [path, bytes] of files) {
    if (!path.startsWith(`${dir}/`)) continue;
    output += bytes.byteLength;
    if (path === `${dir}/${PAGE}` || LOADED_BY_THE_PAGE.test(path)) {
      page += gzipped(bytes);
    }
  }
  return [
    { name: names[0], bytes: output },
    { name: names[1], bytes: page },
  ];
};

/** The measurements of the verify page: the files under `verify/` only. */
export const measureVerifyOutput = (
  files: ReadonlyMap<string, Uint8Array>,
): Measurement[] =>
  measurePageDir(files, VERIFY_DIR, [VERIFY_OUTPUT, VERIFY_PAGE_GZIP]);

/** The measurements of the signing page: the files under `signer/` only. */
export const measureSignerOutput = (
  files: ReadonlyMap<string, Uint8Array>,
): Measurement[] =>
  measurePageDir(files, SIGNER_DIR, [SIGNER_OUTPUT, SIGNER_PAGE_GZIP]);

const isByteCount = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;

/**
 * The problems of `measurements` against `budgets`: a measurement over its
 * limit, a budget nothing measured, a measurement no budget covers, a repeated
 * name, and a limit or a size that is not a whole number of bytes. Each is a
 * problem, never a pass.
 */
export const sizeBudgetProblems = (
  measurements: readonly Measurement[],
  budgets: readonly Budget[],
): string[] => {
  const problems: string[] = [];
  const limits = new Map<string, number>();
  for (const budget of budgets) {
    if (limits.has(budget.name)) {
      problems.push(`${budget.name}: the size budget is given twice`);
    } else if (!isByteCount(budget.limit) || budget.limit === 0) {
      problems.push(
        `${budget.name}: the size budget ${String(budget.limit)} is not a positive whole number of bytes`,
      );
    } else {
      limits.set(budget.name, budget.limit);
    }
  }
  const measured = new Set<string>();
  for (const { name, bytes } of measurements) {
    if (measured.has(name)) {
      problems.push(`${name}: measured twice`);
      continue;
    }
    measured.add(name);
    const limit = limits.get(name);
    if (!isByteCount(bytes)) {
      problems.push(
        `${name}: the size ${String(bytes)} is not a whole number of bytes`,
      );
    } else if (!budgets.some(budget => budget.name === name)) {
      problems.push(`${name}: measured, but no size budget covers it`);
    } else if (limit !== undefined && bytes > limit) {
      problems.push(
        `${name}: ${String(bytes)} bytes, over its size budget of ${String(limit)} bytes by ${String(bytes - limit)}`,
      );
    }
  }
  for (const name of limits.keys()) {
    if (!measured.has(name)) {
      problems.push(`${name}: not measured, so its size budget cannot pass`);
    }
  }
  return problems;
};

/** One budget with its measurement, `null` when nothing measured it. */
export type BudgetRow = {
  readonly name: string;
  readonly limit: number;
  readonly bytes: number | null;
};

/** Each budget with its measurement, for the release dry run's report. */
export const sizeBudgetRows = (
  measurements: readonly Measurement[],
  budgets: readonly Budget[],
): BudgetRow[] =>
  budgets.map(({ name, limit }) => ({
    name,
    limit,
    bytes: measurements.find(entry => entry.name === name)?.bytes ?? null,
  }));

/**
 * A Markdown table of each budget, its measurement, and what is left, for the
 * release dry run's summary. A budget nothing measured shows `-`.
 */
export const sizeBudgetTable = (rows: readonly BudgetRow[]): string[] => [
  "| Size | Bytes | Budget | Left |",
  "| --- | --- | --- | --- |",
  ...rows.map(({ name, limit, bytes }) =>
    bytes === null
      ? `| ${name} | - | ${String(limit)} | - |`
      : `| ${name} | ${String(bytes)} | ${String(limit)} | ${String(limit - bytes)} |`,
  ),
];

/** The release's size budget applied: the problems, the rows, the table. */
export type ReleaseSizeReport = {
  readonly problems: string[];
  readonly rows: BudgetRow[];
  readonly table: string[];
};

/**
 * The release output `files` held to `RELEASE_BUDGET`: the problems, and each
 * budget with its measurement, as rows (for a report) and as a Markdown table
 * (for a summary). An output without `index.html`, `verify/index.html`, or
 * `signer/index.html` is a problem. No `files` (no built `apps/wrapper/dist/`)
 * measures nothing, which is a problem, never a pass.
 */
export const releaseSizeReport = (
  files?: ReadonlyMap<string, Uint8Array>,
): ReleaseSizeReport => {
  const sizes =
    files === undefined
      ? []
      : [
          ...measureWrapperOutput(files),
          ...measureVerifyOutput(files),
          ...measureSignerOutput(files),
        ];
  const rows = sizeBudgetRows(sizes, RELEASE_BUDGET);
  // An output without its pages (an empty dist/ included) is not a release
  // build, however small it is.
  const pages =
    files === undefined
      ? []
      : [PAGE, `${VERIFY_DIR}/${PAGE}`, `${SIGNER_DIR}/${PAGE}`]
          .filter(page => !files.has(page))
          .map(
            page =>
              `the Wrapper output has no ${page}, so it is not a release build`,
          );
  return {
    problems: [...pages, ...sizeBudgetProblems(sizes, RELEASE_BUDGET)],
    rows,
    table: sizeBudgetTable(rows),
  };
};
