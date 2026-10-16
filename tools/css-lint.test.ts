import { join } from "node:path";

import stylelint from "stylelint";
import { describe, expect, it } from "vitest";

// Proof that the CSS lint configuration (stylelint.config.mjs) rejects what the
// project forbids: unknown names, invalid values, duplicates, !important,
// remote resources (the Wrapper runs under a strict CSP and is served from the
// SuperEngine origin), and vendor prefixes. Each case lints a snippet with the
// repository's real configuration.

const configFile = join(import.meta.dirname, "..", "stylelint.config.mjs");

interface Case {
  readonly name: string;
  readonly code: string;
  /** The rule that must report, or undefined when the snippet must be clean. */
  readonly rule: string | undefined;
}

const cases: readonly Case[] = [
  { name: "clean CSS", code: "a {\n  color: red;\n}\n", rule: undefined },
  {
    name: "a data: URL and a relative URL",
    code: 'a {\n  background: url("data:image/png;base64,AAAA");\n}\nb {\n  background: url("./i.png");\n}\n',
    rule: undefined,
  },
  {
    name: "custom properties and var()",
    code: ":root {\n  --a: 1px;\n}\na {\n  margin: var(--a);\n}\n",
    rule: undefined,
  },
  {
    name: "an unknown property",
    code: "a {\n  colr: red;\n}\n",
    rule: "property-no-unknown",
  },
  {
    name: "an unknown at-rule",
    code: "@nope x {\n}\n",
    rule: "at-rule-no-unknown",
  },
  {
    name: "an unknown unit",
    code: "a {\n  width: 1pxx;\n}\n",
    rule: "unit-no-unknown",
  },
  {
    name: "an invalid value",
    code: "a {\n  display: blokc;\n}\n",
    rule: "declaration-property-value-no-unknown",
  },
  {
    name: "an invalid hex color",
    code: "a {\n  color: #12;\n}\n",
    rule: "color-no-invalid-hex",
  },
  {
    name: "a duplicate selector",
    code: "a {\n  color: red;\n}\na {\n  margin: 0;\n}\n",
    rule: "no-duplicate-selectors",
  },
  {
    name: "a duplicate property",
    code: "a {\n  color: red;\n  color: blue;\n}\n",
    rule: "declaration-block-no-duplicate-properties",
  },
  { name: "an empty block", code: "a {\n}\n", rule: "block-no-empty" },
  {
    name: "!important",
    code: "a {\n  color: red !important;\n}\n",
    rule: "declaration-no-important",
  },
  {
    name: "a remote @import url()",
    code: '@import url("https://example.test/a.css");\n',
    rule: "at-rule-disallowed-list",
  },
  {
    name: "a remote @import string",
    code: '@import "https://example.test/a.css";\n',
    rule: "at-rule-disallowed-list",
  },
  {
    name: "a local @import",
    code: '@import "./a.css";\n',
    rule: "at-rule-disallowed-list",
  },
  {
    name: "a remote image",
    code: 'a {\n  background: url("https://example.test/i.png");\n}\n',
    rule: "function-url-scheme-allowed-list",
  },
  {
    name: "a remote font",
    code: "@font-face {\n  font-family: x;\n  src: url(https://example.test/f.woff2);\n}\n",
    rule: "function-url-scheme-allowed-list",
  },
  {
    name: "a scheme-relative URL",
    code: 'a {\n  background: url("//example.test/i.png");\n}\n',
    rule: "function-url-no-scheme-relative",
  },
  {
    name: "a vendor-prefixed property",
    code: "a {\n  -webkit-appearance: none;\n}\n",
    rule: "property-no-vendor-prefix",
  },
  {
    name: "a vendor-prefixed value",
    code: "a {\n  display: -webkit-flex;\n}\n",
    rule: "value-no-vendor-prefix",
  },
];

async function rulesReported(code: string): Promise<string[]> {
  const result = await stylelint.lint({
    code,
    codeFilename: "fixture.css",
    configFile,
  });
  return result.results.flatMap(entry =>
    entry.warnings.map(warning => warning.rule),
  );
}

const clean = cases.filter(testCase => testCase.rule === undefined);
const failing = cases.flatMap(testCase =>
  testCase.rule === undefined ? [] : [{ ...testCase, rule: testCase.rule }],
);

describe("CSS lint configuration", () => {
  it.each(clean)("passes: $name", async ({ code }) => {
    expect(await rulesReported(code)).toEqual([]);
  });

  it.each(failing)("fails with $rule: $name", async ({ code, rule }) => {
    expect(await rulesReported(code)).toContain(rule);
  });
});
