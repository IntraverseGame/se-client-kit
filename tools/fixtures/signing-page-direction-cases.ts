// The dependency-direction cases of the wallet signing page's app
// (apps/signing-page), for tools/import-direction.test.ts. Written from the
// spec (specs/signing-page.md, SP-1, SP-12; specs/client-kit/packages.md), not
// derived from .oxlintrc.json, so a weakened rule fails.

import type { Case } from "./import-direction-cases.ts";

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
const PAGE = "apps/signing-page";
const NAME = "@intraverse/se-client-signing-page";

export const signingPageCases: readonly Case[] = [
  // The page takes signing and contracts' runtime entry, and nothing else.
  ...["signing", "contracts"].map(p =>
    importing(src(PAGE), `@intraverse/se-client-${p}`, false),
  ),
  // Never shell (the code that holds the key), the other packages, the
  // contracts test-only entry, or another app, in its sources or its tests.
  ...[
    "shell",
    "shell/controller",
    "snapshot",
    "play-client",
    "contracts/testing",
    "wrapper",
    "verify",
    "reference-game",
    "pages-proxy",
  ].map(p => importing(src(PAGE), `@intraverse/se-client-${p}`, true)),
  ...["shell", "shell/controller", "wrapper", "verify", "reference-game"].map(
    p => importing(testFile(PAGE), `@intraverse/se-client-${p}`, true),
  ),
  // Public entry points only, and no relative reach into another workspace.
  importing(src(PAGE), "@intraverse/se-client-signing/src/keccak.ts", true),
  importing(src(PAGE), "@intraverse/se-client-signing/dist/index.js", true),
  importing(src(PAGE), "../../wrapper/src/index.ts", true),
  importing(src(PAGE), "../../verify/src/index.ts", true),
  importing(src(PAGE), "../../../packages/shell/src/index.ts", true),
  importing("apps/signing-page/src/deep/x.ts", "../a.ts", false),
  importing(src(PAGE), "@superengine/signing", true),

  // Its tests and test helpers may take vectors from the test-only entry.
  importing(testFile(PAGE), "@intraverse/se-client-contracts/testing", false),
  importing(
    "apps/signing-page/src/fixtures/replay-wallet.ts",
    "@intraverse/se-client-contracts/testing",
    false,
  ),
  importing(
    "apps/signing-page/src/key-delegation-vectors.ts",
    "@intraverse/se-client-contracts/testing",
    true,
  ),

  // No package, other app, or the e2e suite imports the signing page, by
  // name or by a relative path.
  ...[
    "packages/contracts",
    "packages/signing",
    "packages/snapshot",
    "packages/play-client",
    "packages/shell",
    "apps/wrapper",
    "apps/verify",
    "apps/reference-game",
    "apps/pages-proxy",
  ].flatMap(dir => [
    importing(src(dir), NAME, true),
    importing(testFile(dir), NAME, true),
  ]),
  importing("e2e/tests/fake-play-api.ts", NAME, true),
  importing(src("apps/wrapper"), "../../signing-page/src/index.ts", true),
  importing("apps/wrapper/pages-config.ts", "../signing-page/src/x.ts", true),
  importing(src("apps/verify"), "../../signing-page/src/index.ts", true),
  importing(src("packages/shell"), "../../../apps/signing-page/src/x.ts", true),
  importing(
    "e2e/tests/harness/x.ts",
    "../../../apps/signing-page/src/x.ts",
    true,
  ),

  // SP-12: no `console` call at all in the page's sources.
  {
    name: "apps/signing-page/src a console call",
    file: "apps/signing-page/src/log.ts",
    source: 'export const log = (): void => {\n  console.info("x");\n};\n',
    rule: "eslint(no-console)",
    fails: true,
  },
];
