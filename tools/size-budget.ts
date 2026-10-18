// The size budget of the Wrapper's release output
// (specs/client-kit/testing-and-ci.md, the `build` job;
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

/** Every file of the release output, uncompressed: what the artifact holds. */
export const WRAPPER_OUTPUT = "wrapper output";
/**
 * The page and the scripts and stylesheets it loads, each compressed on its own
 * with gzip at zlib's default level: about what a player's browser downloads.
 */
export const WRAPPER_PAGE_GZIP = "wrapper page, gzip";

/**
 * The Wrapper's budget, in bytes (decided by the human, 2026-10-18: about 25%
 * over the 161873 and 52650 bytes measured that day). A change is a reviewed
 * change to this list and the spec's together.
 */
export const WRAPPER_BUDGET: readonly Budget[] = [
  { name: WRAPPER_OUTPUT, limit: 204_800 },
  { name: WRAPPER_PAGE_GZIP, limit: 65_536 },
];

const PAGE = "index.html";
const LOADED_BY_THE_PAGE = /\.(?:js|css)$/iu;

/**
 * The measurements of the Wrapper's release output: `files` is every file of
 * `apps/wrapper/dist/`, by path relative to it with `/` separators.
 */
export const measureWrapperOutput = (
  files: ReadonlyMap<string, Uint8Array>,
): Measurement[] => {
  let output = 0;
  let page = 0;
  for (const [path, bytes] of files) {
    output += bytes.byteLength;
    if (path === PAGE || LOADED_BY_THE_PAGE.test(path)) {
      page += gzipSync(bytes).byteLength;
    }
  }
  return [
    { name: WRAPPER_OUTPUT, bytes: output },
    { name: WRAPPER_PAGE_GZIP, bytes: page },
  ];
};

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
  "| Wrapper size | Bytes | Budget | Left |",
  "| --- | --- | --- | --- |",
  ...rows.map(({ name, limit, bytes }) =>
    bytes === null
      ? `| ${name} | - | ${String(limit)} | - |`
      : `| ${name} | ${String(bytes)} | ${String(limit)} | ${String(limit - bytes)} |`,
  ),
];

/** The Wrapper's size budget applied: the problems, the rows, the table. */
export type WrapperSizeReport = {
  readonly problems: string[];
  readonly rows: BudgetRow[];
  readonly table: string[];
};

/**
 * The Wrapper's release output `files` held to `WRAPPER_BUDGET`: the problems,
 * and each budget with its measurement, as rows (for a report) and as a
 * Markdown table (for a summary). An output without `index.html` is a problem.
 * No `files` (no built `apps/wrapper/dist/`) measures nothing, which is a
 * problem, never a pass.
 */
export const wrapperSizeReport = (
  files?: ReadonlyMap<string, Uint8Array>,
): WrapperSizeReport => {
  const sizes = files === undefined ? [] : measureWrapperOutput(files);
  const rows = sizeBudgetRows(sizes, WRAPPER_BUDGET);
  // An output without its page (an empty dist/ included) is not a release
  // build, however small it is.
  const page =
    files === undefined || files.has(PAGE)
      ? []
      : [`the Wrapper output has no ${PAGE}, so it is not a release build`];
  return {
    problems: [...page, ...sizeBudgetProblems(sizes, WRAPPER_BUDGET)],
    rows,
    table: sizeBudgetTable(rows),
  };
};
