import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  measureWrapperOutput,
  RELEASE_BUDGET,
  sizeBudgetProblems,
  sizeBudgetRows,
  sizeBudgetTable,
  VERIFY_OUTPUT,
  VERIFY_PAGE_GZIP,
  WRAPPER_BUDGET,
  WRAPPER_OUTPUT,
  WRAPPER_PAGE_GZIP,
  releaseSizeReport,
} from "./size-budget.ts";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

const budgets = [
  { name: "a", limit: 100 },
  { name: "b", limit: 10 },
];

describe("measureWrapperOutput", () => {
  it("counts every file uncompressed, and the page with its scripts and stylesheets gzip-compressed", () => {
    const loaded: [string, Uint8Array][] = [
      ["index.html", bytes("<!doctype html><title>x</title>")],
      ["assets/index-a.js", bytes("console.log(1);".repeat(50))],
      ["assets/index-b.CSS", bytes("p{color:red}".repeat(20))],
    ];
    const data: [string, Uint8Array][] = [
      ["integrity-manifest.json", bytes('{"files":{}}')],
      ["headers.json", bytes("{}")],
    ];
    const files = new Map([...loaded, ...data]);
    const raw = [...files.values()].reduce(
      (sum, file) => sum + file.byteLength,
      0,
    );
    const page = loaded
      .map(([, file]) => gzipSync(file).byteLength)
      .reduce((sum, size) => sum + size, 0);
    expect(measureWrapperOutput(files)).toEqual([
      { name: WRAPPER_OUTPUT, bytes: raw },
      { name: WRAPPER_PAGE_GZIP, bytes: page },
    ]);
  });

  it("measures an empty output as zero bytes", () => {
    expect(measureWrapperOutput(new Map())).toEqual([
      { name: WRAPPER_OUTPUT, bytes: 0 },
      { name: WRAPPER_PAGE_GZIP, bytes: 0 },
    ]);
  });

  it("gives one measurement for each budget of the Wrapper", () => {
    expect(
      measureWrapperOutput(new Map()).map(measurement => measurement.name),
    ).toEqual(WRAPPER_BUDGET.map(budget => budget.name));
  });
});

describe("sizeBudgetProblems", () => {
  it("passes sizes under and exactly at their limits", () => {
    expect(
      sizeBudgetProblems(
        [
          { name: "a", bytes: 99 },
          { name: "b", bytes: 10 },
        ],
        budgets,
      ),
    ).toEqual([]);
  });

  it("reports a size one byte over its limit", () => {
    expect(
      sizeBudgetProblems(
        [
          { name: "a", bytes: 101 },
          { name: "b", bytes: 10 },
        ],
        budgets,
      ),
    ).toEqual(["a: 101 bytes, over its size budget of 100 bytes by 1"]);
  });

  it("reports a budget nothing measured, never a pass", () => {
    expect(sizeBudgetProblems([{ name: "a", bytes: 1 }], budgets)).toEqual([
      "b: not measured, so its size budget cannot pass",
    ]);
  });

  it("reports a measurement no budget covers", () => {
    expect(
      sizeBudgetProblems(
        [
          { name: "a", bytes: 1 },
          { name: "b", bytes: 1 },
          { name: "c", bytes: 1 },
        ],
        budgets,
      ),
    ).toEqual(["c: measured, but no size budget covers it"]);
  });

  it("reports a repeated budget or measurement", () => {
    expect(
      sizeBudgetProblems(
        [
          { name: "a", bytes: 1 },
          { name: "a", bytes: 1_000 },
        ],
        [
          { name: "a", limit: 100 },
          { name: "a", limit: 1_000 },
        ],
      ),
    ).toEqual(["a: the size budget is given twice", "a: measured twice"]);
  });

  it.each([[0], [-1], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    "reports a limit that is not a positive whole number of bytes (%s)",
    limit => {
      expect(
        sizeBudgetProblems([{ name: "a", bytes: 0 }], [{ name: "a", limit }]),
      ).toEqual([
        `a: the size budget ${String(limit)} is not a positive whole number of bytes`,
      ]);
    },
  );

  it.each([[-1], [1.5], [Number.NaN]])(
    "reports a size that is not a whole number of bytes (%s)",
    size => {
      expect(
        sizeBudgetProblems(
          [{ name: "b", bytes: size }],
          [{ name: "b", limit: 10 }],
        ),
      ).toEqual([`b: the size ${String(size)} is not a whole number of bytes`]);
    },
  );

  it("holds the release's budget to positive limits with distinct names", () => {
    expect(
      sizeBudgetProblems(
        RELEASE_BUDGET.map(({ name }) => ({ name, bytes: 0 })),
        RELEASE_BUDGET,
      ),
    ).toEqual([]);
  });
});

describe("sizeBudgetRows", () => {
  it("gives each budget its measurement, or null when nothing measured it", () => {
    expect(sizeBudgetRows([{ name: "b", bytes: 7 }], budgets)).toEqual([
      { name: "a", limit: 100, bytes: null },
      { name: "b", limit: 10, bytes: 7 },
    ]);
  });
});

describe("sizeBudgetTable", () => {
  it("shows each budget with its size and what is left", () => {
    expect(
      sizeBudgetTable(sizeBudgetRows([{ name: "a", bytes: 120 }], budgets)),
    ).toEqual([
      "| Size | Bytes | Budget | Left |",
      "| --- | --- | --- | --- |",
      "| a | 120 | 100 | -20 |",
      "| b | - | 10 | - |",
    ]);
  });
});

const HTML = bytes("<!doctype html>");
const WRAPPER_PAGE: [string, Uint8Array] = ["index.html", HTML];
const VERIFY_PAGE: [string, Uint8Array] = ["verify/index.html", HTML];
const PAGES = [WRAPPER_PAGE, VERIFY_PAGE];

describe("releaseSizeReport", () => {
  it("passes a small output and reports its rows and table", () => {
    const report = releaseSizeReport(new Map(PAGES));
    expect(report.problems).toEqual([]);
    expect(report.rows.map(row => row.name)).toEqual([
      WRAPPER_OUTPUT,
      WRAPPER_PAGE_GZIP,
      VERIFY_OUTPUT,
      VERIFY_PAGE_GZIP,
    ]);
    expect(report.table).toEqual(sizeBudgetTable(report.rows));
  });

  it("reports an output one byte over the uncompressed limit", () => {
    const report = releaseSizeReport(
      new Map([
        ["index.html", new Uint8Array(1)],
        ["headers.json", new Uint8Array(204_800)],
        VERIFY_PAGE,
      ]),
    );
    expect(report.problems).toEqual([
      "wrapper output: 204801 bytes, over its size budget of 204800 bytes by 1",
    ]);
  });

  it.each<[string, Map<string, Uint8Array>, string[]]>([
    ["an empty output", new Map(), ["index.html", "verify/index.html"]],
    [
      "an output without its pages",
      new Map([["assets/a.js", bytes("1")]]),
      ["index.html", "verify/index.html"],
    ],
    [
      "an output without the verify page",
      new Map([WRAPPER_PAGE]),
      ["verify/index.html"],
    ],
  ])("reports %s, however small", (_, files, missing) => {
    expect(releaseSizeReport(files).problems).toEqual(
      missing.map(
        page =>
          `the Wrapper output has no ${page}, so it is not a release build`,
      ),
    );
  });

  it("reports an output that is not built, never a pass", () => {
    expect(releaseSizeReport().problems).toEqual([
      "wrapper output: not measured, so its size budget cannot pass",
      "wrapper page, gzip: not measured, so its size budget cannot pass",
      "verify output: not measured, so its size budget cannot pass",
      "verify page, gzip: not measured, so its size budget cannot pass",
    ]);
  });
});

describe("the budgets in the spec", () => {
  it("are the budgets specs/client-kit/testing-and-ci.md states", () => {
    const spec = readFileSync(
      join(
        import.meta.dirname,
        "..",
        "specs",
        "client-kit",
        "testing-and-ci.md",
      ),
      "utf8",
    ).replaceAll(/\s+/gu, " ");
    for (const { name, limit } of RELEASE_BUDGET) {
      expect(spec).toContain(`${name}: ${String(limit)} bytes`);
    }
  });
});

describe("the size budget's script", () => {
  const manifest = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
  ) as {
    wireit: Record<
      string,
      { command?: string; dependencies?: string[] } | undefined
    >;
  };

  it("is part of pnpm check", () => {
    expect(manifest.wireit["check"]?.dependencies).toContain(
      "check:size-budget",
    );
  });

  it("runs the size budget CLI after the Wrapper's build", () => {
    expect(manifest.wireit["check:size-budget"]).toMatchObject({
      command: "tsx tools/check-size-budget.ts",
      dependencies: ["./apps/wrapper:build"],
    });
  });
});
