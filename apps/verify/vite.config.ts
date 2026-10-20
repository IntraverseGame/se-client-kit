import { defineConfig } from "vitest/config";

import { testOnlyEntryGuard } from "../../tools/test-only-entry-guard.ts";

// The verify page's Vite build (specs/verify-page.md, V-15 to V-17). Its output
// is not published on its own: the Wrapper's build reads `dist/` and puts it
// into the release artifact under `verify/`, where the release integrity step
// signs and checks it (apps/wrapper/release-verify.ts).
//
// Like the Wrapper's (apps/wrapper/vite.config.ts, which explains each rule),
// a build is only ever one production build with the test-only-entry guard on
// (tools/test-only-entry-guard.ts, in `plugins` and `worker.plugins`), and is
// refused outright: in any mode but `production`; with `VITEST` set (it
// switches the guard off); with `NODE_ENV` set to anything but `production`
// (unset and empty count as unset); and with `VITE_USER_NODE_ENV` set to any
// non-empty value (Vite would make a development build from it after this file
// is loaded). No env files are read (`envDir: false`) and there is no public
// directory (`publicDir: false`): every file goes through the build.
//
// The base is coupled to the Wrapper's: the page is served at the Wrapper's
// base ("/") plus `VERIFY_DIR` (apps/wrapper/release-files.ts). The Wrapper's
// release step refuses a reference outside `/verify/` (release-sri.ts), so a
// mismatch fails its build; src/build-refusals.test.ts pins the value.
const BASE = "/verify/";

const ALLOWED_NODE_ENV: ReadonlySet<string | undefined> = new Set([
  undefined,
  "",
  "production",
]);

export default defineConfig(({ command, mode }) => {
  if (command === "build" && mode !== "production") {
    throw new Error(
      `The verify page is never built in mode ${JSON.stringify(mode)}: only "production".`,
    );
  }
  const underVitest = process.env["VITEST"] !== undefined;
  if (command === "build" && underVitest) {
    throw new Error("The verify page is never built with VITEST set.");
  }
  const nodeEnv = process.env["NODE_ENV"];
  if (command === "build" && !ALLOWED_NODE_ENV.has(nodeEnv)) {
    throw new Error(
      `The verify page is never built with NODE_ENV=${JSON.stringify(nodeEnv)}: only unset or "production".`,
    );
  }
  const userNodeEnv = process.env["VITE_USER_NODE_ENV"];
  if (command === "build" && userNodeEnv !== undefined && userNodeEnv !== "") {
    throw new Error(
      `The verify page is never built with VITE_USER_NODE_ENV=${JSON.stringify(userNodeEnv)}: it must be unset.`,
    );
  }
  return {
    base: BASE,
    plugins: underVitest ? [] : [testOnlyEntryGuard("verify page")],
    // Vite bundles a worker with its own plugin pipeline, which does not
    // inherit `plugins`. The page uses no worker (specs/verify-page.md,
    // Security), but the guard is there too.
    worker: {
      plugins: () => (underVitest ? [] : [testOnlyEntryGuard("verify page")]),
    },
    publicDir: false,
    envDir: false,
    build: { target: "es2023", sourcemap: false },
  };
});
