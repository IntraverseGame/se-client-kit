// The fixture cases for tools/import-direction.test.ts. The expectations are
// written from the spec (specs/client-kit.md, "Dependency direction") and
// AGENTS.md, not derived from .oxlintrc.json, so a weakened rule fails.

export type Case = {
  readonly name: string;
  /** Path of the importing file, relative to the scratch tree. */
  readonly file: string;
  /** Source of the file. */
  readonly source: string;
  readonly rule: string;
  readonly fails: boolean;
};

const RESTRICTED = "eslint(no-restricted-imports)";

const importing = (file: string, specifier: string, fails: boolean): Case => {
  return {
    name: `${file} imports ${specifier}`,
    file,
    source: `export * from ${JSON.stringify(specifier)};\n`,
    rule: RESTRICTED,
    fails,
  };
};

const src = (dir: string): string => `${dir}/src/index.ts`;
const testFile = (dir: string): string => `${dir}/src/index.test.ts`;

export const cases: readonly Case[] = [
  // contracts is a leaf.
  ...["signing", "snapshot", "play-client", "shell"].map(p =>
    importing(src("packages/contracts"), `@intraverse/se-client-${p}`, true),
  ),
  importing(src("packages/contracts"), "@intraverse/se-client-wrapper", true),

  // signing has no kit dependency at run time.
  ...["contracts", "contracts/testing", "snapshot", "play-client", "shell"].map(
    p => importing(src("packages/signing"), `@intraverse/se-client-${p}`, true),
  ),

  // snapshot: contracts only, and never sideways.
  importing(src("packages/snapshot"), "@intraverse/se-client-contracts", false),
  importing(
    src("packages/snapshot"),
    "@intraverse/se-client-contracts/testing",
    true,
  ),
  ...["signing", "play-client", "shell"].map(p =>
    importing(src("packages/snapshot"), `@intraverse/se-client-${p}`, true),
  ),

  // play-client: contracts only, and never sideways.
  importing(
    src("packages/play-client"),
    "@intraverse/se-client-contracts",
    false,
  ),
  importing(
    src("packages/play-client"),
    "@intraverse/se-client-contracts/testing",
    true,
  ),
  ...["signing", "snapshot", "shell"].map(p =>
    importing(src("packages/play-client"), `@intraverse/se-client-${p}`, true),
  ),

  // shell: signing, snapshot, play-client; contracts only through them.
  ...["signing", "snapshot", "play-client"].map(p =>
    importing(src("packages/shell"), `@intraverse/se-client-${p}`, false),
  ),
  ...["contracts", "contracts/testing"].map(p =>
    importing(src("packages/shell"), `@intraverse/se-client-${p}`, true),
  ),
  importing(src("packages/shell"), "@intraverse/se-client-wrapper", true),
  importing(
    src("packages/shell"),
    "@intraverse/se-client-reference-game",
    true,
  ),

  // wrapper (app): the shell only.
  importing(src("apps/wrapper"), "@intraverse/se-client-shell", false),
  ...["signing", "snapshot", "play-client", "contracts"].map(p =>
    importing(src("apps/wrapper"), `@intraverse/se-client-${p}`, true),
  ),
  importing(src("apps/wrapper"), "@intraverse/se-client-reference-game", true),

  // reference-game imports no kit package at run time.
  ...["contracts", "signing", "snapshot", "play-client", "shell"].map(p =>
    importing(src("apps/reference-game"), `@intraverse/se-client-${p}`, true),
  ),
  importing(src("apps/reference-game"), "@intraverse/se-client-wrapper", true),

  // Public entry points only, and no relative reach into another package.
  importing(
    src("packages/shell"),
    "@intraverse/se-client-snapshot/src/validate",
    true,
  ),
  importing(
    src("packages/shell"),
    "@intraverse/se-client-snapshot/dist/index.js",
    true,
  ),
  importing(src("packages/shell"), "../../snapshot/src/index.ts", true),
  importing(
    "packages/shell/src/deep/dir/file.ts",
    "../../../../signing/src/index.ts",
    true,
  ),
  importing("packages/shell/src/deep/file.ts", "./sibling.ts", false),
  importing("packages/shell/src/deep/file.ts", "../index.ts", false),

  // The old working scope is not a kit package any more: it never passes
  // silently, even for an import the direction would allow.
  importing(src("packages/shell"), "@superengine/signing", true),
  importing(src("apps/wrapper"), "@superengine/shell", true),
  importing(src("packages/snapshot"), "@superengine/contracts", true),
  importing(
    testFile("packages/signing"),
    "@superengine/contracts/testing",
    true,
  ),
  importing(src("tools"), "@superengine/signing", true),

  // Tests may take vectors from the contracts test-only entry, and only the
  // tests of signing, snapshot, shell, and the Wrapper do.
  ...["signing", "snapshot", "shell"].map(p =>
    importing(
      testFile(`packages/${p}`),
      "@intraverse/se-client-contracts/testing",
      false,
    ),
  ),
  importing(
    testFile("apps/wrapper"),
    "@intraverse/se-client-contracts/testing",
    false,
  ),
  importing(
    "e2e/tests/fake-play-api.ts",
    "@intraverse/se-client-contracts/testing",
    false,
  ),
  importing(
    testFile("packages/play-client"),
    "@intraverse/se-client-contracts/testing",
    true,
  ),
  importing(
    testFile("packages/contracts"),
    "@intraverse/se-client-contracts/testing",
    true,
  ),
  // A test does not gain any other dependency.
  importing(
    testFile("packages/snapshot"),
    "@intraverse/se-client-signing",
    true,
  ),
  importing(testFile("packages/signing"), "@intraverse/se-client-shell", true),
  importing("e2e/tests/fake-play-api.ts", "@intraverse/se-client-shell", true),
  // Test helpers count as tests; a plain source file does not.
  importing(
    "packages/signing/src/test/helpers.ts",
    "@intraverse/se-client-contracts/testing",
    false,
  ),
  importing(
    "packages/signing/src/helpers.ts",
    "@intraverse/se-client-contracts/testing",
    true,
  ),
  importing(
    "tools/some-script.ts",
    "@intraverse/se-client-contracts/testing",
    true,
  ),
];
