// The verify page's own size budget (specs/verify-page.md, V-16 and D-3): its
// files, under `verify/`, are measured apart from the Wrapper's and held to
// their own limits.

import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  measureVerifyOutput,
  measureWrapperOutput,
  releaseSizeReport,
  VERIFY_BUDGET,
  VERIFY_OUTPUT,
  VERIFY_PAGE_GZIP,
} from "./size-budget.ts";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("the verify page's measurements", () => {
  const loaded: [string, Uint8Array][] = [
    ["verify/index.html", bytes("<!doctype html><title>v</title>")],
    ["verify/assets/index-a.js", bytes("console.log(1);".repeat(50))],
    ["verify/assets/index-b.CSS", bytes("p{color:red}".repeat(20))],
  ];
  const other: [string, Uint8Array][] = [
    ["verify/other.data", bytes("0123456789")],
  ];
  const wrapper: [string, Uint8Array][] = [
    ["index.html", bytes("<!doctype html>".repeat(40))],
    ["assets/wrapper.js", bytes("console.log(2);".repeat(50))],
  ];
  const files = new Map([...wrapper, ...loaded, ...other]);

  it("counts the files under verify/ only, the page and its scripts and stylesheets gzipped", () => {
    const raw = [...loaded, ...other].reduce(
      (sum, [, file]) => sum + file.byteLength,
      0,
    );
    const page = loaded
      .map(([, file]) => gzipSync(file).byteLength)
      .reduce((sum, size) => sum + size, 0);
    expect(measureVerifyOutput(files)).toEqual([
      { name: VERIFY_OUTPUT, bytes: raw },
      { name: VERIFY_PAGE_GZIP, bytes: page },
    ]);
  });

  it("is left out of the Wrapper's measurements", () => {
    expect(measureWrapperOutput(files)).toEqual(
      measureWrapperOutput(new Map(wrapper)),
    );
  });

  it("gives one measurement for each budget of the verify page", () => {
    expect(
      measureVerifyOutput(new Map()).map(measurement => measurement.name),
    ).toEqual(VERIFY_BUDGET.map(budget => budget.name));
  });
});

describe("the verify page's budget", () => {
  const html = bytes("<!doctype html>");

  it("holds the verify page to its own limits, apart from the Wrapper's", () => {
    const report = releaseSizeReport(
      new Map([
        ["index.html", html],
        ["verify/index.html", html],
        ["verify/assets/a.js", new Uint8Array(150_000)],
      ]),
    );
    expect(report.problems).toEqual([
      `verify output: ${String(150_000 + html.byteLength)} bytes, over its size budget of 150000 bytes by ${String(html.byteLength)}`,
    ]);
  });
});
