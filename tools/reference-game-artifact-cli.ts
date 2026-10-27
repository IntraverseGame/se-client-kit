// Writes the reference game's Pages artifact (tools/reference-game-artifact.ts)
// for the Pages workflow's `build` job, from the two scratch copies the release
// dry run built and kept (`--keep`):
//
//   pnpm exec tsx tools/reference-game-artifact-cli.ts \
//     --first <copy> --second <copy> --out <empty directory>
//
// It requires the two builds to give one digest, writes
// `se-client-reference-game.tar` and its `.sha256` into `--out`, prints the
// digest, and appends `game-digest=<digest>` to `$GITHUB_OUTPUT` when that is
// set. On a mismatch it prints both digests and exits 1.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { reproducedReferenceGame } from "./reference-game-artifact.ts";

const { values } = parseArgs({
  options: {
    first: { type: "string" },
    second: { type: "string" },
    out: { type: "string" },
  },
});
const { first, second, out } = values;
if (
  first === undefined ||
  second === undefined ||
  out === undefined ||
  (existsSync(out) && readdirSync(out).length > 0)
) {
  console.error(
    "Usage: reference-game-artifact-cli.ts --first <copy> --second <copy> --out <empty directory>",
  );
  process.exit(2);
}

const result = reproducedReferenceGame(first, second);
if (!result.ok) {
  console.error(`::error::${result.problem}`);
  process.exit(1);
}
const { artifact } = result;
mkdirSync(out, { recursive: true });
const path = join(out, artifact.fileName);
writeFileSync(path, artifact.archive);
writeFileSync(
  `${path}.sha256`,
  `${artifact.digest.slice("sha256:".length)}  ${artifact.fileName}\n`,
);
console.log(
  `Reference game artifact: ${artifact.fileName}, ${artifact.digest}`,
);
const stepOutput = process.env["GITHUB_OUTPUT"];
if (stepOutput !== undefined && existsSync(stepOutput)) {
  appendFileSync(stepOutput, `game-digest=${artifact.digest}\n`);
}
