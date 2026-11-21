// The verify page inside the Wrapper's release (specs/verify-page.md, V-16):
// the verify app's own build (`apps/verify/dist/`, a plain Vite build under
// `/verify/`) is read from disk and put into the release output under
// `verify/`. Here its page gets the same treatment as the Wrapper's: the
// environment-independent part of its own policy (with `worker-src 'none'`) in
// a `<meta>` element, and SRI on every script and stylesheet
// (release-page-copy.ts). The files go into the integrity manifest with the
// Wrapper's, and the output check (release-output-check.ts) then holds
// `verify/` to the same allow-list.

import { VERIFY_DIR } from "./release-files.ts";
import { VERIFY_META_CONTENT_SECURITY_POLICY } from "./release-headers.ts";
import { type CarriedPage, carriedPageFiles } from "./release-page-copy.ts";

const VERIFY: CarriedPage = Object.freeze({
  dir: VERIFY_DIR,
  name: "verify page",
  build: "The verify build",
  sri: "verify",
  app: "apps/verify",
  metaPolicy: VERIFY_META_CONTENT_SECURITY_POLICY,
});

/**
 * The verify page's files for the release output, by path with the `verify/`
 * prefix: `dist` is the verify app's build output and `base` the Wrapper's
 * public base path. The page is the only file changed.
 */
export const verifyOutputFiles = (
  dist: string,
  base: string,
): Promise<Map<string, Uint8Array>> => carriedPageFiles(VERIFY, dist, base);
