// Writes the Pages sites' environment configuration documents
// (pages-config.ts) from the environment's values, for the Pages workflow's
// `config-stage` job, and with `--production` (production's own rule too:
// `environment` must be `production`, pages-config-rules.ts) for the
// production deploy's `config-prod` job and the release's check
// (pages-prod-check.yml, `config-check`):
//
//   pnpm exec tsx apps/wrapper/pages-config-cli.ts [--production] --out <empty directory>
//
// It writes `wrapper-environment-config.json` and
// `verifier-environment-config.json` into `--out`, and, only with
// `PAGES_SIGNER_ORIGIN`, `signer-environment-config.json`, which the job then
// checks with the signing page's own validator
// (apps/signing-page/config-check-cli.ts). It prints no value: on a problem it
// prints each problem's input or field and code, and exits 1.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { buildPagesConfigs } from "./pages-config.ts";

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    production: { type: "boolean", default: false },
  },
});
const out = values.out;
if (out === undefined || (existsSync(out) && readdirSync(out).length > 0)) {
  console.error(
    "Usage: pages-config-cli.ts [--production] --out <empty directory>",
  );
  process.exit(2);
}

const result = buildPagesConfigs(
  {
    PAGES_WRAPPER_ORIGIN: process.env["PAGES_WRAPPER_ORIGIN"],
    PAGES_VERIFIER_ORIGIN: process.env["PAGES_VERIFIER_ORIGIN"],
    PAGES_CHAIN_PINS: process.env["PAGES_CHAIN_PINS"],
    PAGES_RPC_ENDPOINTS: process.env["PAGES_RPC_ENDPOINTS"],
    PAGES_RPC_ORIGINS: process.env["PAGES_RPC_ORIGINS"],
    PAGES_GAME_ORIGINS: process.env["PAGES_GAME_ORIGINS"],
    PAGES_OPERATOR_ORIGINS: process.env["PAGES_OPERATOR_ORIGINS"],
    PAGES_SIGNER_ORIGIN: process.env["PAGES_SIGNER_ORIGIN"],
    PAGES_ACCEPT_PENDING_NOTICES: process.env["PAGES_ACCEPT_PENDING_NOTICES"],
  },
  { production: values.production },
);
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
if (result.configs.signer === undefined) {
  console.log("Wrote and validated both environment configuration documents.");
} else {
  writeFileSync(
    join(out, "signer-environment-config.json"),
    result.configs.signer,
  );
  console.log(
    "Wrote and validated the Wrapper's and the verifier's environment configuration documents, and wrote the signing page's.",
  );
}
