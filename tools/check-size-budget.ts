// CLI: hold the Wrapper's built release output to its size budget
// (tools/size-budget.ts; specs/client-kit/testing-and-ci.md). Run after the
// Wrapper's build by `pnpm run check:size-budget`, part of `pnpm check`, and by
// the `build` CI job. The release dry run and the publish step apply the same
// check themselves (`checkWrapperSize`), so they report a problem once.

import { join } from "node:path";

import { checkWrapperSize } from "./release-steps.ts";

const root = join(import.meta.dirname, "..");

const { problems, rows } = checkWrapperSize(root);
if (problems.length > 0) {
  console.error("Problems with the Wrapper's size budget:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exitCode = 1;
} else {
  for (const { name, bytes, limit } of rows) {
    console.log(
      `size budget: ${name} ${String(bytes)} of ${String(limit)} bytes`,
    );
  }
}
