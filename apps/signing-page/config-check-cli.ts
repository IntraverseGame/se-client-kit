// Checks the signing page's configuration document with the page's own
// validator (specs/signing-page.md, SP-3 and SP-15), for the Pages
// configuration jobs (`config-stage`, `config-prod`, and the release's
// `config-check`), right after apps/wrapper/pages-config-cli.ts wrote it:
//
//   PAGES_SIGNER_ORIGIN=<the site's origin> pnpm exec tsx apps/signing-page/config-check-cli.ts --file <signer-environment-config.json>
//
// The Wrapper's tool builds the document but cannot validate it: no package or
// app imports the signing page (specs/client-kit/packages.md). The page's own
// origin is `PAGES_SIGNER_ORIGIN`, as on its site. It prints no value: on a
// problem it prints each issue's field and code, and exits 1.

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { validateSignerConfig } from "./src/environment-config.ts";

const fail = (message: string): never => {
  console.error(`::error::${message}`);
  process.exit(1);
};

const { values } = parseArgs({ options: { file: { type: "string" } } });
const file = values.file;
if (file === undefined || file === "") {
  console.error(
    "Usage: config-check-cli.ts --file <signer-environment-config.json>",
  );
  process.exit(2);
}

const ownOrigin = process.env["PAGES_SIGNER_ORIGIN"];
if (ownOrigin === undefined || ownOrigin === "") {
  fail("PAGES_SIGNER_ORIGIN: missing");
}

let document: unknown;
try {
  document = JSON.parse(readFileSync(file, "utf8")) as unknown;
} catch {
  fail("signer document: unreadable or not JSON");
}

const result = validateSignerConfig(document, ownOrigin ?? "");
if (!result.ok) {
  for (const issue of result.issues) {
    console.error(`::error::signer document: ${issue.code} at ${issue.field}`);
  }
  process.exit(1);
}
console.log("Validated the signing page's configuration document.");
