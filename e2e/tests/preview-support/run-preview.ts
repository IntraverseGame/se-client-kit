// The one way to run the `preview` project (RFC-002): `pnpm test:e2e:preview`
// runs this launcher, which sets the entry marker and starts
// `playwright test --project=preview`. The config defines the project only when
// the marker is set, and the generic routes refuse it. The marker is not a
// user-facing variable: the backend's runner never sets it. The launcher reads
// the environment only to hand it on; the config validates the variables and
// fails before any browser starts.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

import {
  PREVIEW_ENTRY_VALUE,
  PREVIEW_ENTRY_VARIABLE,
} from "./preview-environment.ts";

const require = createRequire(import.meta.url);

const child = spawn(
  process.execPath,
  [
    require.resolve("@playwright/test/cli"),
    "test",
    "--project=preview",
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
    env: { ...process.env, [PREVIEW_ENTRY_VARIABLE]: PREVIEW_ENTRY_VALUE },
  },
);

child.once("exit", (code, signal) => {
  process.exitCode = signal === null ? (code ?? 1) : 1;
});
