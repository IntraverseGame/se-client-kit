// The dependency-direction cases of the verify page's app (apps/verify), for
// tools/import-direction.test.ts. Written from the spec
// (specs/verify-page.md, V-15; specs/client-kit/packages.md), not derived from
// .oxlintrc.json, so a weakened rule fails.

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
const VERIFY = "apps/verify";

export const verifyCases: readonly Case[] = [
  // verify takes signing, snapshot, play-client, and contracts' runtime entry.
  ...["signing", "snapshot", "play-client", "contracts"].map(p =>
    importing(src(VERIFY), `@intraverse/se-client-${p}`, false),
  ),
  // It never takes shell (the code that holds the key), the contracts
  // test-only entry, or another app, in its sources or its tests.
  ...["shell", "shell/controller", "contracts/testing", "wrapper"].map(p =>
    importing(src(VERIFY), `@intraverse/se-client-${p}`, true),
  ),
  importing(src(VERIFY), "@intraverse/se-client-reference-game", true),
  ...["shell", "shell/controller", "wrapper", "reference-game"].map(p =>
    importing(testFile(VERIFY), `@intraverse/se-client-${p}`, true),
  ),
  // Public entry points only, and no relative reach into another workspace.
  importing(src(VERIFY), "@intraverse/se-client-signing/src/keccak.ts", true),
  importing(src(VERIFY), "@intraverse/se-client-signing/dist/index.js", true),
  importing(src(VERIFY), "../../wrapper/src/index.ts", true),
  importing(src(VERIFY), "../../../packages/shell/src/index.ts", true),
  importing("apps/verify/src/deep/x.ts", "../a.ts", false),
  importing(src(VERIFY), "@superengine/signing", true),

  // Its tests and test helpers may take vectors from the test-only entry.
  importing(testFile(VERIFY), "@intraverse/se-client-contracts/testing", false),
  importing(
    "apps/verify/src/fixtures/kernel-vectors.ts",
    "@intraverse/se-client-contracts/testing",
    false,
  ),
  importing(
    "apps/verify/src/kernel-vectors.ts",
    "@intraverse/se-client-contracts/testing",
    true,
  ),

  // No package, other app, or the e2e suite imports the verify page.
  ...[
    "packages/contracts",
    "packages/signing",
    "packages/snapshot",
    "packages/play-client",
    "packages/shell",
    "apps/wrapper",
    "apps/reference-game",
  ].flatMap(dir => [
    importing(src(dir), "@intraverse/se-client-verify", true),
    importing(testFile(dir), "@intraverse/se-client-verify", true),
  ]),
  importing("e2e/tests/fake-play-api.ts", "@intraverse/se-client-verify", true),
  importing(src("apps/wrapper"), "../../verify/src/index.ts", true),
  importing(src("packages/shell"), "../../../apps/verify/src/x.ts", true),
];
