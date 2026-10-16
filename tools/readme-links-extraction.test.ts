import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { linksOf } from "./readme-links.ts";
import { findReadmeProblems } from "./readme-rules.ts";

// Inline links in README text: code is not a link, everything else is, whatever
// the destination looks like. The forms that must fail are in
// readme-links.test.ts.

const root = join(import.meta.dirname, "..");
const NAME = "@intraverse/se-client-example";

const linkProblems = (extra: string): string[] =>
  findReadmeProblems({
    text: `# \`${NAME}\`\n\nNot published to npm yet.\n\npnpm add ${NAME}\n\n${extra}\n`,
    name: NAME,
    kind: "package",
    isPrivate: true,
    root,
  }).filter(problem => problem.startsWith("link "));

describe("inline links and code", () => {
  it("does not read code such as fns[i](event) as a link", () => {
    expect(
      linkProblems(
        [
          "Call `fns[i](event)` and ``items[0](arg, other)`` and `a` then `b[0](c)`.",
          "",
          "```ts",
          "fns[i](event);",
          "[x](docs)",
          "```",
          "",
          "~~~",
          "list[0](README)",
          "~~~",
          "",
          "A `code",
          "span` over two lines: `x[0](y)`.",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("reads code written as prose as a link, since a renderer does", () => {
    expect(linkProblems("Call fns[i](event) now.").length).toBeGreaterThan(0);
  });

  it("keeps the text after a closed fence and a code span visible", () => {
    expect(linksOf("```\nx\n```\n[a](docs) `c` [b](more)")).toEqual([
      "docs",
      "more",
    ]);
  });

  it("extracts titles, angle brackets, nested parentheses, and spaces", () => {
    expect(
      linksOf(
        [
          '[a](./a.md "t")',
          "[b](<./b c.md>)",
          "[c](./c_(d).md)",
          "[e](  ./e.md  )",
        ].join("\n"),
      ),
    ).toEqual(["./a.md", "./b c.md", "./c_(d).md", "./e.md"]);
  });
});
