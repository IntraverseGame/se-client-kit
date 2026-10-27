// Writes the two Pages sites' environment configuration documents
// (pages-config.ts) from the environment's values, for the Pages workflow's
// `config-stage` job:
//
//   pnpm exec tsx apps/wrapper/pages-config-cli.ts --out <empty directory>
//
// It writes `wrapper-environment-config.json` and
// `verifier-environment-config.json` into `--out`, and prints no value: on a
// problem it prints each problem's input or field and code, and exits 1.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { buildPagesConfigs } from "./pages-config.ts";

const { values } = parseArgs({ options: { out: { type: "string" } } });
const out = values.out;
if (out === undefined || (existsSync(out) && readdirSync(out).length > 0)) {
  console.error("Usage: pages-config-cli.ts --out <empty directory>");
  process.exit(2);
}

const result = buildPagesConfigs({
  PAGES_WRAPPER_ORIGIN: process.env["PAGES_WRAPPER_ORIGIN"],
  PAGES_VERIFIER_ORIGIN: process.env["PAGES_VERIFIER_ORIGIN"],
  PAGES_CHAIN_PINS: process.env["PAGES_CHAIN_PINS"],
  PAGES_RPC_ENDPOINTS: process.env["PAGES_RPC_ENDPOINTS"],
  PAGES_RPC_ORIGINS: process.env["PAGES_RPC_ORIGINS"],
  PAGES_GAME_ORIGINS: process.env["PAGES_GAME_ORIGINS"],
  PAGES_OPERATOR_ORIGINS: process.env["PAGES_OPERATOR_ORIGINS"],
});
if (!result.ok) {
  for (const issue of result.issues) console.error(`::error::${issue}`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, "wrapper-environment-config.json"),
  result.configs.wrapper,
);
writeFileSync(
  join(out, "verifier-environment-config.json"),
  result.configs.verifier,
);
console.log("Wrote and validated both environment configuration documents.");
