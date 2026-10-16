// Fixture cases for the lint rules of AGENTS.md other than the dependency
// direction (see import-direction-cases.ts). Written from AGENTS.md and
// ADR-001, not derived from .oxlintrc.json.

import type { Case } from "./import-direction-cases.ts";

const src = (dir: string): string => `${dir}/src/index.ts`;
const testFile = (dir: string): string => `${dir}/src/index.test.ts`;

export const ruleCases: readonly Case[] = [
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
