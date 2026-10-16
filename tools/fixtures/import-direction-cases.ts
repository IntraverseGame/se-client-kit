// The fixture cases for tools/import-direction.test.ts. The expectations are
// written from the spec (specs/client-kit.md, "Dependency direction") and
// AGENTS.md, not derived from .oxlintrc.json, so a weakened rule fails.

export interface Case {
  readonly name: string;
  /** Path of the importing file, relative to the scratch tree. */
  readonly file: string;
  /** Source of the file. */
  readonly source: string;
  readonly rule: string;
  readonly fails: boolean;
}

const RESTRICTED = "eslint(no-restricted-imports)";

function importing(file: string, specifier: string, fails: boolean): Case {
  return {
    name: `${file} imports ${specifier}`,
    file,
    source: `export * from ${JSON.stringify(specifier)};\n`,
    rule: RESTRICTED,
    fails,
  };
}

const src = (dir: string): string => `${dir}/src/index.ts`;
const testFile = (dir: string): string => `${dir}/src/index.test.ts`;

export const cases: readonly Case[] = [
  // contracts is a leaf.
  ...["signing", "snapshot", "play-client", "shell"].map(p =>
    importing(src("packages/contracts"), `@superengine/${p}`, true),
  ),
  importing(src("packages/contracts"), "wrapper", true),

  // signing has no kit dependency at run time.
  ...["contracts", "contracts/testing", "snapshot", "play-client", "shell"].map(
    p => importing(src("packages/signing"), `@superengine/${p}`, true),
  ),

  // snapshot: contracts only, and never sideways.
  importing(src("packages/snapshot"), "@superengine/contracts", false),
  importing(src("packages/snapshot"), "@superengine/contracts/testing", true),
  ...["signing", "play-client", "shell"].map(p =>
    importing(src("packages/snapshot"), `@superengine/${p}`, true),
  ),

  // play-client: contracts only, and never sideways.
  importing(src("packages/play-client"), "@superengine/contracts", false),
  importing(
    src("packages/play-client"),
    "@superengine/contracts/testing",
    true,
  ),
  ...["signing", "snapshot", "shell"].map(p =>
    importing(src("packages/play-client"), `@superengine/${p}`, true),
  ),

  // shell: signing, snapshot, play-client; contracts only through them.
  ...["signing", "snapshot", "play-client"].map(p =>
    importing(src("packages/shell"), `@superengine/${p}`, false),
  ),
  ...["contracts", "contracts/testing"].map(p =>
    importing(src("packages/shell"), `@superengine/${p}`, true),
  ),
  importing(src("packages/shell"), "wrapper", true),
  importing(src("packages/shell"), "reference-game", true),

  // wrapper (app): the shell only.
  importing(src("apps/wrapper"), "@superengine/shell", false),
  ...["signing", "snapshot", "play-client", "contracts"].map(p =>
    importing(src("apps/wrapper"), `@superengine/${p}`, true),
  ),
  importing(src("apps/wrapper"), "reference-game", true),

  // reference-game imports no kit package at run time.
  ...["contracts", "signing", "snapshot", "play-client", "shell"].map(p =>
    importing(src("apps/reference-game"), `@superengine/${p}`, true),
  ),
  importing(src("apps/reference-game"), "wrapper", true),

  // Public entry points only, and no relative reach into another package.
  importing(src("packages/shell"), "@superengine/snapshot/src/validate", true),
  importing(src("packages/shell"), "@superengine/snapshot/dist/index.js", true),
  importing(src("packages/shell"), "../../snapshot/src/index.ts", true),
  importing(
    "packages/shell/src/deep/dir/file.ts",
    "../../../../signing/src/index.ts",
    true,
  ),
  importing("packages/shell/src/deep/file.ts", "./sibling.ts", false),
  importing("packages/shell/src/deep/file.ts", "../index.ts", false),

  // Tests may take vectors from the contracts test-only entry, and only the
  // tests of signing, snapshot, shell, and the Wrapper do.
  ...["signing", "snapshot", "shell"].map(p =>
    importing(
      testFile(`packages/${p}`),
      "@superengine/contracts/testing",
      false,
    ),
  ),
  importing(testFile("apps/wrapper"), "@superengine/contracts/testing", false),
  importing(
    "e2e/tests/fake-play-api.ts",
    "@superengine/contracts/testing",
    false,
  ),
  importing(
    testFile("packages/play-client"),
    "@superengine/contracts/testing",
    true,
  ),
  importing(
    testFile("packages/contracts"),
    "@superengine/contracts/testing",
    true,
  ),
  // A test does not gain any other dependency.
  importing(testFile("packages/snapshot"), "@superengine/signing", true),
  importing(testFile("packages/signing"), "@superengine/shell", true),
  importing("e2e/tests/fake-play-api.ts", "@superengine/shell", true),
  // Test helpers count as tests; a plain source file does not.
  importing(
    "packages/signing/src/test/helpers.ts",
    "@superengine/contracts/testing",
    false,
  ),
  importing(
    "packages/signing/src/helpers.ts",
    "@superengine/contracts/testing",
    true,
  ),
  importing("tools/some-script.ts", "@superengine/contracts/testing", true),

  // Other repository rules enforced by the same configuration.
  {
    name: "explicit any fails",
    file: src("packages/shell"),
    source: "export const f = (value: any): unknown => value;\n",
    rule: "typescript(no-explicit-any)",
    fails: true,
  },
  {
    name: "@ts-ignore fails",
    file: src("packages/shell"),
    source: "// @ts-ignore\nexport const a: number = 'x';\n",
    rule: "typescript(ban-ts-comment)",
    fails: true,
  },
  {
    name: "@ts-expect-error without a reason fails",
    file: src("packages/shell"),
    source: "// @ts-expect-error\nexport const a: number = 'x';\n",
    rule: "typescript(ban-ts-comment)",
    fails: true,
  },
  {
    name: "@ts-expect-error with a reason passes",
    file: src("packages/shell"),
    source:
      "// @ts-expect-error: the fixture needs a deliberate type error\nexport const a: number = 'x';\n",
    rule: "typescript(ban-ts-comment)",
    fails: false,
  },
  {
    name: "a default export in a library fails",
    file: src("packages/shell"),
    source: "export default 1;\n",
    rule: "import(no-default-export)",
    fails: true,
  },
  {
    name: "a default export in an app config passes",
    file: "apps/wrapper/vite.config.ts",
    source: "export default 1;\n",
    rule: "import(no-default-export)",
    fails: false,
  },
  {
    name: "console in a library fails",
    file: src("packages/shell"),
    source: "console.log('x');\n",
    rule: "eslint(no-console)",
    fails: true,
  },
  {
    name: "console in a tool passes",
    file: "tools/script.ts",
    source: "console.log('x');\n",
    rule: "eslint(no-console)",
    fails: false,
  },
  {
    name: "@ts-nocheck fails",
    file: src("packages/shell"),
    source: "// @ts-nocheck\nexport const a = 1;\n",
    rule: "typescript(ban-ts-comment)",
    fails: true,
  },
  {
    name: "a default export through an alias fails",
    file: src("packages/shell"),
    source: "const a = 1;\nexport { a as default };\n",
    rule: "import(no-default-export)",
    fails: true,
  },
  {
    name: "a side-effect import fails (no import-time side effects)",
    file: src("packages/shell"),
    source: 'import "./register.ts";\n',
    rule: "import(no-unassigned-import)",
    fails: true,
  },
  {
    name: "a relative import without an extension fails",
    file: src("packages/shell"),
    source: 'export * from "./other";\n',
    rule: "import(extensions)",
    fails: true,
  },
  {
    name: "a relative import with the .ts extension passes",
    file: src("packages/shell"),
    source: 'export * from "./other.ts";\n',
    rule: "import(extensions)",
    fails: false,
  },
  {
    name: "a non-null assertion fails",
    file: src("packages/shell"),
    source: "export const f = (a?: string): string => a!;\n",
    rule: "typescript(no-non-null-assertion)",
    fails: true,
  },
  {
    name: "loose equality fails",
    file: src("packages/shell"),
    source: "export const f = (a: number): boolean => a == 1;\n",
    rule: "eslint(eqeqeq)",
    fails: true,
  },
  {
    name: "a focused test fails",
    file: testFile("packages/shell"),
    source: 'import { it } from "vitest";\nit.only("x", () => {});\n',
    rule: "vitest(no-focused-tests)",
    fails: true,
  },
  {
    name: "a skipped test fails",
    file: testFile("packages/shell"),
    source: 'import { it } from "vitest";\nit.skip("x", () => {});\n',
    rule: "vitest(no-disabled-tests)",
    fails: true,
  },
  {
    name: "an unused lint-disable directive fails",
    file: src("packages/shell"),
    source: "// eslint-disable-next-line no-eval\nexport const a = 1;\n",
    rule: "unused-disable-directive",
    fails: true,
  },
  {
    name: "eval fails",
    file: src("packages/snapshot"),
    source: "export const f = (code: string): unknown => eval(code);\n",
    rule: "eslint(no-eval)",
    fails: true,
  },
];
