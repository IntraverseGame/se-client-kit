// The signing page inside the Wrapper's release (specs/signing-page.md, SP-14):
// the signing page app's own build (`apps/signing-page/dist/`, a plain Vite
// build under `/signer/`) is read from disk and put into the release output
// under `signer/`, as the verify page is under `verify/` (release-verify.ts),
// so one digest and one attestation cover all three pages. Its page gets its
// own `<meta>` policy (SP-13, without `frame-ancestors`) and SRI on every
// script and stylesheet, which must lie under `/signer/`
// (release-page-copy.ts). The files go into the integrity manifest with the
// Wrapper's, and the output check (release-output-check.ts) holds `signer/` to
// the same allow-list, with `signer/index.html` as the third HTML file.

import { SIGNER_DIR } from "./release-files.ts";
import { SIGNER_META_CONTENT_SECURITY_POLICY } from "./release-headers.ts";
import { type CarriedPage, carriedPageFiles } from "./release-page-copy.ts";

const SIGNER: CarriedPage = Object.freeze({
  dir: SIGNER_DIR,
  name: "signing page",
  build: "The signing page build",
  sri: "signer",
  app: "apps/signing-page",
  metaPolicy: SIGNER_META_CONTENT_SECURITY_POLICY,
});

/**
 * The signing page's files for the release output, by path with the `signer/`
 * prefix: `dist` is the signing page app's build output and `base` the
 * Wrapper's public base path. The page is the only file changed.
 */
export const signerOutputFiles = (
  dist: string,
  base: string,
): Promise<Map<string, Uint8Array>> => carriedPageFiles(SIGNER, dist, base);
