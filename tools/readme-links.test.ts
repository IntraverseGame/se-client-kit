import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { checkLink, isTrackedOrNotIgnored, linksOf } from "./readme-links.ts";
import { findReadmeProblems } from "./readme-rules.ts";

// Every form a link can take in a README, and which of them are allowed. The
// forms are fed through the whole README rules, so extraction and the check are
// tested together; the tracked-or-not-ignored rule runs on scratch trees, with
// and without a .git directory.

const root = join(import.meta.dirname, "..");
const NAME = "@intraverse/se-client-example";
const BASE = "https://github.com/IntraverseGame/se-client-kit/blob/main";
const GOOD = [
  `# \`${NAME}\``,
  "",
  "Not published to npm yet.",
  "",
  `pnpm add ${NAME}`,
  "",
  `[Packages](${BASE}/specs/client-kit.md#packages)`,
  "",
].join("\n");

const linkProblems = (extra: string): string[] =>
  findReadmeProblems({
    text: `${GOOD}\n${extra}\n`,
    name: NAME,
    kind: "package",
    isPrivate: true,
    root,
  }).filter(problem => problem.startsWith("link "));

describe("links in every form", () => {
  it.each([
    [
      "an HTML anchor with a relative path",
      '<a href="./CONTRIBUTING.md">x</a>',
    ],
    ["an HTML anchor with mailto", '<a href="mailto:a@example.com">x</a>'],
    ["an HTML anchor with javascript", '<a href="javascript:alert(1)">x</a>'],
    ["an HTML image, uppercase attribute", "<img SRC='./x.png'>"],
    ["an HTML unquoted href", "<a href=./x.md>x</a>"],
    [
      "an HTML srcset entry",
      '<img srcset="./a.png 1x, https://evil.example/b.png 2x">',
    ],
    ["an HTML video poster", '<video poster="./p.png"></video>'],
    ["an HTML form action", '<form action="https://evil.example/post"></form>'],
    ["an HTML formaction", '<button formaction="./x"></button>'],
    ["an HTML object data", '<object data="./x.svg"></object>'],
    ["a reference definition, relative", "[x]: ./file.md"],
    ["a reference definition, uppercase scheme", "[x]: HTTPS://evil.example/"],
    ["an autolink, uppercase scheme", "<HTTPS://evil.example/>"],
    ["a bare uppercase URL in prose", "See HTTPS://evil.example/ for more."],
    ["a bare www host", "See www.example.com for more."],
    ["a www autolink", "<www.example.com>"],
    ["a protocol-relative link", "[x](//evil.example/x)"],
    ["an ftp link", "[x](ftp://example.com/x)"],
    ["a file link", "[x](file:///etc/passwd)"],
    ["a data link", "[x](data:text/html,x)"],
    ["an angle-bracket destination", "[x](<./file.md>)"],
    ["a style attribute url()", '<div style="background:url(./x.png)"></div>'],
    ["a style block url()", "<style>a{background:url('./x.png')}</style>"],
    ["a meta refresh target", '<meta http-equiv=refresh content="0;url=./x">'],
    ["a dotted relative file name", "[x](CHANGELOG.md)"],
    ["a bare file name", "[x](README)"],
    ["a bare license file", "[license](LICENSE)"],
    ["a bare directory", "[x](docs)"],
    ["a name with a fragment", "[x](page#sec)"],
    ["a percent-encoded dot and slash", "[x](%2e%2fa)"],
    ["a destination split over lines", "[x]( \n README )"],
    ["a destination with a title", '[x](README "the readme")'],
    ["an image with a bare name", "![x](logo)"],
    ["a destination written as code", "[x](`./file.md`)"],
    ["a link after a code span", "`a` and [x](docs) and `b`"],
    ["a link after an unclosed fence", "```\n[x](docs)\n"],
    [
      "a link after a fence with a backtick in its info string",
      "``` a `b`\n[x](docs)\n",
    ],
    ["a link whose text holds a code span", "[`x`](docs)"],
    ["an image with an external URL", "![x](https://example.com/x.png)"],
    [
      "a repository link into build output",
      `[x](${BASE}/packages/signing/dist/index.js)`,
    ],
    [
      "a repository link into node_modules",
      `[x](${BASE}/node_modules/vite/package.json)`,
    ],
    [
      "a repository link in uppercase scheme to a missing path",
      `[x](HTTPS://GITHUB.COM/IntraverseGame/se-client-kit/blob/main/nope.md)`,
    ],
  ])("fails %s", (_name, extra) => {
    expect(linkProblems(extra).length).toBeGreaterThan(0);
  });

  it.each([
    ["an inline repository link", `[x](${BASE}/CONTRIBUTING.md)`],
    [
      "a reference definition into the repository",
      `[x]: ${BASE}/CONTRIBUTING.md`,
    ],
    ["an autolink into the repository", `<${BASE}/CONTRIBUTING.md>`],
    [
      "an HTML anchor into the repository",
      `<a href="${BASE}/CONTRIBUTING.md">x</a>`,
    ],
    [
      "the scheme and host in another case",
      "[x](HTTPS://GitHub.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md)",
    ],
    [
      "a tree link to a directory",
      `[x](${BASE.replace("blob", "tree")}/specs)`,
    ],
  ])("accepts %s", (_name, extra) => {
    expect(linkProblems(extra)).toEqual([]);
  });

  it("extracts each form", () => {
    const links = linksOf(
      [
        "[a](./a.md) ![b](./b.png) [c]: ./c.md <HTTPS://d.example/> www.e.example",
        '<a href="./f.md">f</a> <img srcset="./g.png 1x, ./h.png 2x">',
      ].join("\n"),
    );
    expect(links).toEqual(
      expect.arrayContaining([
        "./a.md",
        "./b.png",
        "HTTPS://d.example/",
        "www.e.example",
        "./f.md",
        "./g.png",
        "./h.png",
      ]),
    );
  });

  it("gives a clear reason for each kind of failure", () => {
    expect(checkLink("javascript:alert(1)", GOOD, root)[0]).toContain(
      "a javascript: link is not allowed",
    );
    expect(checkLink("./x.md", GOOD, root)[0]).toContain(
      "relative, bare, or protocol-relative",
    );
    expect(checkLink("https://example.com/x", GOOD, root)[0]).toContain(
      "only absolute links into this repository",
    );
  });
});

const put = (base: string, path: string, text = "x"): void => {
  mkdirSync(dirname(join(base, path)), { recursive: true });
  writeFileSync(join(base, path), text);
};

describe("a repository link must be tracked, or at least not ignored", () => {
  let scratch = "";
  let withGit = "";

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), "se-readme-links-"));
    withGit = mkdtempSync(join(tmpdir(), "se-readme-links-git-"));
    for (const base of [scratch, withGit]) {
      put(base, ".gitignore", "secret.md\nbuild/\n*.log\n");
      put(base, "docs/guide.md");
      put(base, "secret.md");
      put(base, "build/out.js");
      put(base, "notes.log");
    }
    execFileSync("git", ["init", "--quiet"], { cwd: withGit });
    execFileSync("git", ["add", ".gitignore", "docs/guide.md"], {
      cwd: withGit,
    });
    put(withGit, "docs/new.md");
  });

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(withGit, { recursive: true, force: true });
  });

  it.each([
    ["docs/guide.md", true],
    ["secret.md", false],
    ["build/out.js", false],
    ["notes.log", false],
    ["dist/x.js", false],
    ["packages/a/node_modules/x", false],
    [".wireit/x", false],
    ["packages/a/tsconfig.tsbuildinfo", false],
  ])("without .git, %s is allowed: %s", (path, expected) => {
    expect(isTrackedOrNotIgnored(scratch, path)).toBe(expected);
  });

  it.each([
    ["docs/guide.md", true],
    ["docs/new.md", true],
    ["secret.md", false],
    ["build/out.js", false],
    ["notes.log", false],
    ["missing.md", false],
    ["dist/x.js", false],
  ])(
    "with .git, %s is allowed: %s (tracked, or untracked and not ignored)",
    (path, expected) => {
      expect(isTrackedOrNotIgnored(withGit, path)).toBe(expected);
    },
  );

  it("does not treat a path through a symlinked directory as tracked, without .git", () => {
    const base = mkdtempSync(join(tmpdir(), "se-readme-links-sym-"));
    try {
      put(base, "real/a.md");
      symlinkSync(join(base, "real"), join(base, "link"));
      expect(isTrackedOrNotIgnored(base, "real/a.md")).toBe(true);
      expect(isTrackedOrNotIgnored(base, "link/a.md")).toBe(false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("fails closed without .git below a nested .gitignore", () => {
    const base = mkdtempSync(join(tmpdir(), "se-readme-links-nest-"));
    try {
      put(base, "sub/.gitignore", "a.md\n");
      put(base, "sub/a.md");
      put(base, "other/b.md");
      expect(isTrackedOrNotIgnored(base, "sub/a.md")).toBe(false);
      expect(isTrackedOrNotIgnored(base, "other/b.md")).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("fails closed without .git when a .gitignore line cannot be interpreted", () => {
    const odd = mkdtempSync(join(tmpdir(), "se-readme-links-odd-"));
    try {
      put(odd, ".gitignore", "\\#odd\n");
      put(odd, "docs/guide.md");
      expect(isTrackedOrNotIgnored(odd, "docs/guide.md")).toBe(false);
    } finally {
      rmSync(odd, { recursive: true, force: true });
    }
  });
});

describe("README words, after folding", () => {
  it.each([
    ["fullwidth TODO", "ＴＯＤＯ: finish"],
    ["Cyrillic lookalike TODO", "ТОDО: finish"],
    ["a zero-width space inside a banned term", "uses wire\u200Bit for tasks"],
    ["a bidi control inside a banned term", "uses ox\u202Elint here"],
    ["a soft hyphen inside a banned term", "run check:dep\u00ADs"],
    ["lowercase fixme", "fixme later"],
    ["lowercase todo in prose", "a todo item"],
    ["a doubled space in a banned term", "run pnpm  check first"],
    ["a newline in a banned term", "run pnpm\ncheck first"],
    ["a newline inside reviewer agent", "the reviewer\nagent decides"],
    ["a no-break space in a banned term", "run pnpm\u00A0check first"],
    ["the issue number #12", "see (#12) for details"],
  ])("fails %s", (_name, text) => {
    const problems = findReadmeProblems({
      text: `${GOOD}\n${text}\n`,
      name: NAME,
      kind: "package",
      isPrivate: true,
      root,
    });
    expect(problems.length).toBeGreaterThan(0);
  });
});
