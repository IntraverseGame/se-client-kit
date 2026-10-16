import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type Case,
  cases as directionCases,
} from "./fixtures/import-direction-cases.ts";
import { ruleCases } from "./fixtures/lint-rule-cases.ts";
import { styleCases } from "./fixtures/style-rule-cases.ts";

const cases: readonly Case[] = [...directionCases, ...ruleCases, ...styleCases];

// Proof that the dependency-direction lint rule (specs/client-kit/packages.md,
// "Dependency direction") fails on a violation. Each case writes a small file
// into a scratch tree, runs the repository's real oxlint binary with the
// repository's real .oxlintrc.json over that tree, and reads the diagnostics
// back. The expectations below are written from the spec, not derived from the
// configuration, so a weakened rule fails here.

const repoRoot = join(import.meta.dirname, "..");
const oxlintBin = join(repoRoot, "node_modules", ".bin", "oxlint");

type Diagnostic = {
  readonly code: string;
  readonly filename: string;
  readonly message: string;
};

// oxlint reports an unused disable directive without a rule code.
const codeOf = (diagnostic: Diagnostic): string =>
  diagnostic.message.startsWith("Unused eslint-disable directive")
    ? "unused-disable-directive"
    : diagnostic.code;

let scratch = "";
// Rules reported per scratch file, keyed by the file's path in the scratch tree.
const reported = new Map<string, Set<string>>();

// Each case gets its own file so one oxlint run answers all of them.
const fileOf = (index: number, testCase: Case): string => {
  const dot = testCase.file.lastIndexOf("/");
  const dir = testCase.file.slice(0, dot);
  const base = testCase.file.slice(dot + 1);
  return `${dir}/case-${String(index)}-${base}`;
};

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "se-import-direction-"));
  copyFileSync(
    join(repoRoot, ".oxlintrc.json"),
    join(scratch, ".oxlintrc.json"),
  );
  cases.forEach((testCase, index) => {
    const path = join(scratch, fileOf(index, testCase));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, testCase.source);
  });

  let stdout: string;
  try {
    stdout = execFileSync(
      oxlintBin,
      ["-c", ".oxlintrc.json", "--format", "json", "."],
      {
        cwd: scratch,
        encoding: "utf8",
      },
    );
  } catch (error) {
    // oxlint exits non-zero when there are errors; the report is on stdout.
    stdout = (error as { stdout: string }).stdout;
  }
  const report = JSON.parse(stdout) as { diagnostics: Diagnostic[] };
  for (const diagnostic of report.diagnostics) {
    const set = reported.get(diagnostic.filename) ?? new Set<string>();
    set.add(codeOf(diagnostic));
    reported.set(diagnostic.filename, set);
  }
});

afterAll(() => {
  if (scratch !== "") rmSync(scratch, { recursive: true, force: true });
});

const reportedFor = (index: number, testCase: Case): ReadonlySet<string> =>
  reported.get(fileOf(index, testCase)) ?? new Set<string>();

describe("import-direction lint rule", () => {
  it("reports on the scratch tree at all (the harness is not vacuous)", () => {
    expect(reported.size).toBeGreaterThan(0);
  });

  describe.each(cases.map((testCase, index) => ({ testCase, index })))(
    "$testCase.name",
    ({ testCase, index }) => {
      it(`reports ${testCase.rule}: ${String(testCase.fails)}`, () => {
        expect(reportedFor(index, testCase).has(testCase.rule)).toBe(
          testCase.fails,
        );
      });
    },
  );
});
