import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FORBIDDEN_TERMS, findReadmeProblems } from "./readme-rules.ts";

// Fixtures for each README rule. Link targets are looked up in the real
// worktree; nothing touches the network.

const root = join(import.meta.dirname, "..");
const NAME = "@intraverse/se-client-example";
const BASE = "https://github.com/IntraverseGame/se-client-kit/blob/main";

const GOOD = [
  `# \`${NAME}\``,
  "",
  "Not published to npm yet.",
  "",
  "```sh",
  `pnpm add ${NAME}`,
  "```",
  "",
  `[Packages](${BASE}/specs/client-kit.md#packages)`,
  "",
].join("\n");

const check = (
  text: string,
  options: { kind?: "package" | "app"; isPrivate?: boolean } = {},
): string[] =>
  findReadmeProblems({
    text,
    name: NAME,
    kind: options.kind ?? "package",
    isPrivate: options.isPrivate ?? true,
    root,
  });

describe("README rules", () => {
  it("accepts a README that follows them", () => {
    expect(check(GOOD)).toEqual([]);
  });

  it("requires the package name, an install line, and the not-published sentence", () => {
    expect(check(GOOD.replaceAll(`\`${NAME}\``, "the package"))).toHaveLength(
      1,
    );
    expect(
      check(GOOD.replace(`pnpm add ${NAME}`, "pnpm add other")),
    ).toHaveLength(1);
    expect(
      check(GOOD.replace("Not published to npm yet.", "Soon.")),
    ).toHaveLength(1);
  });

  it("does not require an install line for an app", () => {
    const app = GOOD.replace(`pnpm add ${NAME}`, "").replace(
      "Not published to npm yet.",
      "",
    );
    expect(check(app, { kind: "app" })).toEqual([]);
  });

  it("accepts absolute links to this repository, with a heading that exists", () => {
    expect(
      check(`${GOOD}[x](${BASE}/CONTRIBUTING.md)\n[d](${BASE}/specs)\n`),
    ).toEqual([]);
  });

  it.each([
    ["a relative link with ../", "[x](../../specs/client-kit.md)"],
    ["a bare relative link", "[x](CHANGELOG.md)"],
    ["a root-relative link", "[x](/specs/client-kit.md)"],
    ["an http link", "[x](http://example.com/a)"],
    ["a link to an external public host", "[x](https://example.com/x)"],
    ["a link to the npm package page", "[x](https://www.npmjs.com/package/x)"],
    [
      "a link to another GitHub repository",
      "[x](https://github.com/other/repo/blob/main/a.md)",
    ],
    [
      "a link to this repository's issues",
      "[x](https://github.com/IntraverseGame/se-client-kit/issues/1)",
    ],
    [
      "a link to a branch other than main",
      "[x](https://github.com/IntraverseGame/se-client-kit/blob/dev/specs/client-kit.md)",
    ],
    ["a mailto link", "[x](mailto:a@example.com)"],
    ["a link to localhost", "[x](https://localhost:3000/a)"],
    ["a link to a loopback address", "[x](https://127.0.0.1/a)"],
    ["a link to a private address", "[x](https://10.1.2.3/a)"],
    ["a link to an internal host", "[x](https://dashboard.internal/a)"],
    ["a link to a host without a dot", "[x](https://intranet/a)"],
    [
      "a repository link to a path that does not exist",
      `[x](${BASE}/specs/missing.md)`,
    ],
    [
      "a repository link to a heading that does not exist",
      `[x](${BASE}/specs/client-kit.md#no-such-heading)`,
    ],
    ["an anchor that does not exist in the README", "[x](#nowhere)"],
  ])("fails %s", (_name, link) => {
    const problems = check(`${GOOD}${link}\n`);
    expect(
      problems.filter(problem => problem.startsWith("link ")),
    ).toHaveLength(1);
  });

  it("fails a bare URL in prose or code to any other host", () => {
    expect(
      check(`${GOOD}\nSee https://example.com/docs for more.\n`).filter(
        problem => problem.startsWith("link "),
      ),
    ).toHaveLength(1);
    expect(
      check(`${GOOD}\n\`\`\`sh\ncurl https://example.com/x\n\`\`\`\n`).filter(
        problem => problem.startsWith("link "),
      ),
    ).toHaveLength(1);
  });

  it("says why an external host fails", () => {
    expect(check(`${GOOD}[x](https://example.com/x)\n`)).toContain(
      "link https://example.com/x: only absolute links into this repository are allowed (https://github.com/IntraverseGame/se-client-kit/blob/main/... or /tree/main/...)",
    );
  });

  it.each(["pre-release: no public API yet.", "pre-release: an empty entry."])(
    "requires a Specified-not-implemented line when the status says %s",
    status => {
      const without = `${GOOD}\n**Status:** ${status}\n`;
      expect(check(without)).toEqual([
        'says there is no public API (or an empty entry) yet but has no "Specified, not implemented yet" line next to its guarantees',
      ]);
      const withLine = `${without}\nSpecified, not implemented yet: no code ships today.\n`;
      expect(check(withLine)).toEqual([]);
    },
  );

  it.each([
    ["a fenced code block", "```\nSpecified, not implemented yet\n```"],
    ["inline code", "`Specified, not implemented yet`"],
    ["an HTML comment", "<!-- Specified, not implemented yet -->"],
  ])("does not count the sentence inside %s", (_name, block) => {
    const text = `${GOOD}\n**Status:** pre-release: no public API yet.\n\n${block}\n`;
    expect(check(text)).toHaveLength(1);
  });

  it.each(["#123", "#12abc", "issue 1#12"])(
    "does not mistake %s for the issue number",
    text => {
      expect(check(`${GOOD}\nSee ${text}.\n`)).toEqual([]);
    },
  );

  it("accepts a README whose status says it is released, without the line", () => {
    expect(check(`${GOOD}\n**Status:** stable.\n`)).toEqual([]);
  });

  it("accepts an anchor that exists in the README", () => {
    expect(check(`${GOOD}\n## More\n\n[x](#more)\n`)).toEqual([]);
  });

  it("requires at least one link", () => {
    expect(
      check(GOOD.replace(/\[Packages\]\([^)]*\)/u, "Packages")),
    ).toHaveLength(1);
  });

  it.each(["TODO", "FIXME", "XXX"])("fails on the word %s", word => {
    expect(check(`${GOOD}\n${word}: write this.\n`)).toHaveLength(1);
  });

  it.each(FORBIDDEN_TERMS)("fails on the contributor term %s", term => {
    expect(check(`${GOOD}\nSee ${term} for details.\n`).length).toBeGreaterThan(
      0,
    );
  });
});
