// The signing page's own size budget (specs/signing-page.md, SP-14): its
// files, under `signer/`, are measured apart from the Wrapper's and the verify
// page's and held to their own limits.

import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  measureSignerOutput,
  measureVerifyOutput,
  measureWrapperOutput,
  releaseSizeReport,
  SIGNER_BUDGET,
  SIGNER_OUTPUT,
  SIGNER_PAGE_GZIP,
} from "./size-budget.ts";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("the signing page's measurements", () => {
  const loaded: [string, Uint8Array][] = [
    ["signer/index.html", bytes("<!doctype html><title>s</title>")],
    ["signer/assets/index-a.js", bytes("console.log(3);".repeat(50))],
    ["signer/assets/index-b.CSS", bytes("p{color:blue}".repeat(20))],
  ];
  const other: [string, Uint8Array][] = [
    ["signer/other.data", bytes("0123456789")],
  ];
  const wrapper: [string, Uint8Array][] = [
    ["index.html", bytes("<!doctype html>".repeat(40))],
    ["assets/wrapper.js", bytes("console.log(2);".repeat(50))],
  ];
  const verify: [string, Uint8Array][] = [
    ["verify/index.html", bytes("<!doctype html><title>v</title>")],
  ];
  const files = new Map([...wrapper, ...verify, ...loaded, ...other]);

  it("counts the files under signer/ only, the page and its scripts and stylesheets gzipped", () => {
    const raw = [...loaded, ...other].reduce(
      (sum, [, file]) => sum + file.byteLength,
      0,
    );
    const page = loaded
      .map(([, file]) => gzipSync(file).byteLength)
      .reduce((sum, size) => sum + size, 0);
    expect(measureSignerOutput(files)).toEqual([
      { name: SIGNER_OUTPUT, bytes: raw },
      { name: SIGNER_PAGE_GZIP, bytes: page },
    ]);
  });

  it("is left out of the Wrapper's and the verify page's measurements", () => {
    expect(measureWrapperOutput(files)).toEqual(
      measureWrapperOutput(new Map(wrapper)),
    );
    expect(measureVerifyOutput(files)).toEqual(
      measureVerifyOutput(new Map(verify)),
    );
  });

  it("does not count a Wrapper path that only starts with signer", () => {
    const near = new Map([["signer.js", bytes("x")]]);
    expect(measureSignerOutput(near)).toEqual([
      { name: SIGNER_OUTPUT, bytes: 0 },
      { name: SIGNER_PAGE_GZIP, bytes: 0 },
    ]);
    expect(measureWrapperOutput(near)[0]?.bytes).toBe(1);
  });

  it("gives one measurement for each budget of the signing page", () => {
    expect(
      measureSignerOutput(new Map()).map(measurement => measurement.name),
    ).toEqual(SIGNER_BUDGET.map(budget => budget.name));
  });
});

describe("the signing page's budget", () => {
  const html = bytes("<!doctype html>");
  const [output] = SIGNER_BUDGET;
  const limit = output?.limit ?? 0;

  it("holds the signing page to its own limits, apart from the others'", () => {
    const report = releaseSizeReport(
      new Map([
        ["index.html", html],
        ["verify/index.html", html],
        ["signer/index.html", html],
        ["signer/assets/a.js", new Uint8Array(limit)],
      ]),
    );
    expect(report.problems).toEqual([
      `signer output: ${String(limit + html.byteLength)} bytes, over its size budget of ${String(limit)} bytes by ${String(html.byteLength)}`,
    ]);
  });

  it("reports both of its measurements in the release's rows", () => {
    const report = releaseSizeReport(
      new Map([
        ["index.html", html],
        ["verify/index.html", html],
        ["signer/index.html", html],
      ]),
    );
    expect(report.problems).toEqual([]);
    expect(report.rows.map(row => row.name)).toContain(SIGNER_OUTPUT);
    expect(report.rows.map(row => row.name)).toContain(SIGNER_PAGE_GZIP);
  });
});
