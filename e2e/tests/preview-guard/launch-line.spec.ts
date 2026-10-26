// The launch hook's one line, validated exactly (RFC-002): the origin, no
// credentials, no query, the path `/` only, a fragment of 1 to 128 characters
// (1 and 128 accepted; 0 and 129 refused), and exactly one line (one trailing
// line feed allowed, no carriage return, no other line break). A refusal is a
// `LaunchHookError` of reason `line` that holds no part of the line.

import { expect, test } from "../harness/worker-browser.ts";
import { LaunchHookError } from "../preview-support/launch-hook-error.ts";
import { parseLaunchLine } from "../preview-support/launch-line.ts";

const ORIGIN = "https://preview.example.test";
const CODE = "lc_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";

const refusal = (output: string, origin = ORIGIN): LaunchHookError => {
  try {
    parseLaunchLine(output, origin);
  } catch (error: unknown) {
    if (error instanceof LaunchHookError) return error;
    throw error;
  }
  throw new Error("expected the line to be refused");
};

test.describe("the launch line", () => {
  test("accepts the origin, a path of / and the code as the fragment", () => {
    expect(parseLaunchLine(`${ORIGIN}/#${CODE}`, ORIGIN)).toEqual({
      url: `${ORIGIN}/#${CODE}`,
      code: CODE,
    });
  });

  test("allows one trailing line feed", () => {
    expect(parseLaunchLine(`${ORIGIN}/#${CODE}\n`, ORIGIN).code).toBe(CODE);
  });

  test("accepts a fragment of 1 and of 128 characters", () => {
    expect(parseLaunchLine(`${ORIGIN}/#a`, ORIGIN).code).toBe("a");
    const longest = "a".repeat(128);
    expect(parseLaunchLine(`${ORIGIN}/#${longest}`, ORIGIN).code).toBe(longest);
  });

  test("accepts a loopback http origin when the preview origin is one", () => {
    const loopback = "http://127.0.0.1:3000";
    expect(parseLaunchLine(`${loopback}/#${CODE}`, loopback).code).toBe(CODE);
  });

  test.describe("refuses", () => {
    const CASES: readonly [string, string][] = [
      ["no fragment", `${ORIGIN}/`],
      ["an empty fragment", `${ORIGIN}/#`],
      ["a fragment of 129 characters", `${ORIGIN}/#${"a".repeat(129)}`],
      ["a query", `${ORIGIN}/?x=1#${CODE}`],
      ["a query without a value", `${ORIGIN}/?#${CODE}`],
      ["a path beyond /", `${ORIGIN}/play#${CODE}`],
      ["the path /index.html", `${ORIGIN}/index.html#${CODE}`],
      ["no path", `${ORIGIN}#${CODE}`],
      ["another origin", `https://other.example.test/#${CODE}`],
      ["another scheme", `http://preview.example.test/#${CODE}`],
      ["another port", `https://preview.example.test:8443/#${CODE}`],
      ["a user name", `https://user@preview.example.test/#${CODE}`],
      ["a password", `https://user:pw@preview.example.test/#${CODE}`],
      ["a carriage return", `${ORIGIN}/#${CODE}\r\n`],
      ["a carriage return inside", `${ORIGIN}/#${CODE}\rx`],
      ["two lines", `${ORIGIN}/#${CODE}\n${ORIGIN}/#${CODE}\n`],
      ["two trailing line feeds", `${ORIGIN}/#${CODE}\n\n`],
      ["an empty output", ""],
      ["only a line feed", "\n"],
      ["a leading space", ` ${ORIGIN}/#${CODE}`],
      ["a space inside", `${ORIGIN}/#${CODE} x`],
      ["a tab", `${ORIGIN}/#${CODE}\t`],
      ["not a URL", "launch ok"],
    ];
    for (const [name, output] of CASES) {
      test(name, () => {
        const error = refusal(output);
        expect(error.reason).toBe("line");
        expect(error.exitCode).toBeUndefined();
        expect(error.message).not.toContain(CODE);
        expect(error.message).not.toContain("preview.example.test");
      });
    }
  });
});
