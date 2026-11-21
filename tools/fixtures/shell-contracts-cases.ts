// The cases of the shell's one name from contracts' runtime entry, for
// tools/import-direction.test.ts: the shell takes `keyDelegationNotices` and
// nothing else from it (#220, slice S5; enforced by name, decided by the
// human, 2026-11-21). Written from the spec (specs/client-kit/packages.md,
// "Dependency direction"), not derived from .oxlintrc.json, so a weakened rule
// fails.

// The shape of `import-direction-cases.ts`' `Case`, written out here because
// that file spreads these cases into its own list (an import back would be a
// cycle); its `readonly Case[]` checks the two agree.
type Case = {
  readonly name: string;
  readonly file: string;
  readonly source: string;
  readonly rule: string;
  readonly fails: boolean;
};

const RESTRICTED = "eslint(no-restricted-imports)";
const CONTRACTS = JSON.stringify("@intraverse/se-client-contracts");
const SHELL_FILE = "packages/shell/src/index.ts";
const SHELL_TEST = "packages/shell/src/index.test.ts";

const using = (file: string, source: string, fails: boolean): Case => {
  return {
    name: `${file}: ${source}`,
    file,
    source: `${source}\nexport {};\n`,
    rule: RESTRICTED,
    fails,
  };
};

export const shellContractsCases: readonly Case[] = [
  using(
    SHELL_FILE,
    `import { keyDelegationNotices } from ${CONTRACTS};`,
    false,
  ),
  using(
    SHELL_FILE,
    `export { keyDelegationNotices } from ${CONTRACTS};`,
    false,
  ),
  // Any other runtime name, a type among them, a namespace, or every name.
  using(
    SHELL_FILE,
    `import { SnapshotKeyDelegation } from ${CONTRACTS};`,
    true,
  ),
  using(
    SHELL_FILE,
    `import type { SnapshotKeyDelegation } from ${CONTRACTS};`,
    true,
  ),
  using(
    SHELL_FILE,
    `import { keyDelegationNotices, SnapshotKeyDelegation } from ${CONTRACTS};`,
    true,
  ),
  using(SHELL_FILE, `import * as contracts from ${CONTRACTS};`, true),
  using(SHELL_FILE, `export * from ${CONTRACTS};`, true),
  // The shell's tests are not held to the one name.
  using(
    SHELL_TEST,
    `import { SnapshotKeyDelegation } from ${CONTRACTS};`,
    false,
  ),
];
