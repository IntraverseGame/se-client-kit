// CLI: check that the build output a workspace's script reads exists, before
// the script's tool runs. Usage, from the workspace's directory (wireit runs a
// script there): `tsx ../../tools/check-kit-dist.ts <script> [path...] && ...`.
// `<script>` is the wireit script it guards (for the message); each `path`
// (relative to the workspace) is a file the script reads by path. A kit package
// is found as tsc, Vite, and Node find it: through the workspace's
// `node_modules` link. See `runKitDistCheck` in tools/kit-dist-fs.ts.

import { join } from "node:path";

import { runKitDistCheck } from "./kit-dist-fs.ts";

const result = runKitDistCheck(
  join(import.meta.dirname, ".."),
  process.cwd(),
  process.argv.slice(2),
);
if (result.exitCode === 0) console.log(result.output);
else console.error(result.output);
process.exitCode = result.exitCode;
