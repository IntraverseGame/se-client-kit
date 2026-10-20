// CLI: hold the Wrapper's built release output (the verify page in it included) to its size budgets
// (tools/size-budget.ts; specs/client-kit/testing-and-ci.md). Run after the
// Wrapper's build by `pnpm run check:size-budget`, part of `pnpm check`, and by
// the `build` CI job. The release dry run and the publish step apply the same
// check themselves (`checkReleaseSize`), so they report a problem once.

import { join } from "node:path";

import { checkReleaseSize } from "./release-steps.ts";

const root = join(import.meta.dirname, "..");

const { problems, rows } = checkReleaseSize(root);
if (problems.length > 0) {
  console.error("Problems with the release's size budget:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exitCode = 1;
} else {
  for (const { name, bytes, limit } of rows) {
    console.log(
      `size budget: ${name} ${String(bytes)} of ${String(limit)} bytes`,
    );
  }
}
