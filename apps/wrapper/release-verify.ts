// The verify page inside the Wrapper's release (specs/verify-page.md, V-16):
// the verify app's own build (`apps/verify/dist/`, a plain Vite build under
// `/verify/`) is read from disk and put into the release output under
// `verify/`. Here its page gets the same treatment as the Wrapper's: the
// environment-independent part of its own policy (with `worker-src 'none'`) in
// a `<meta>` element, and SRI on every script and stylesheet. The files go into
// the integrity manifest with the Wrapper's, and the output check
// (release-output-check.ts) then holds `verify/` to the same allow-list.

import { lstat } from "node:fs/promises";

import { VERIFY_DIR } from "./release-files.ts";
import { VERIFY_META_CONTENT_SECURITY_POLICY } from "./release-headers.ts";
import { readTree } from "./release-output-check.ts";
import { withIntegrity } from "./release-sri.ts";

const HEAD = /<head(?:\s[^>]*)?>/iu;
const CSP_META = /http-equiv\s*=\s*["']?content-security-policy/iu;

const refuse = (what: string): never => {
  throw new Error(`The verify page ${what}; the build is refused.`);
};

/** The page with its `<meta>` policy first in the head, or a refusal. */
const withPolicy = (html: string): string => {
  if (CSP_META.test(html)) {
    refuse(
      "already has a Content-Security-Policy <meta>; the release step adds the page's policy",
    );
  }
  const head = HEAD.exec(html);
  if (head === null) return refuse("has no <head> to hold its policy");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${VERIFY_META_CONTENT_SECURITY_POLICY}">`;
  const end = head.index + head[0].length;
  return `${html.slice(0, end)}${meta}${html.slice(end)}`;
};

/**
 * The verify page's files for the release output, by path with the `verify/`
 * prefix: `dist` is the verify app's build output and `base` the Wrapper's
 * public base path. The page is the only file changed.
 */
export const verifyOutputFiles = async (
  dist: string,
  base: string,
): Promise<Map<string, Uint8Array>> => {
  const entry = await lstat(dist).catch(() => null);
  if (entry?.isDirectory() !== true) {
    refuse(`has no build output at ${dist} (build apps/verify first)`);
  }
  const files = await readTree(dist, "The verify build");
  const page = files.get("index.html");
  if (page === undefined) return refuse("build has no index.html");
  const html = await withIntegrity(
    "verify",
    withPolicy(new TextDecoder().decode(page)),
    `${base}${VERIFY_DIR}/`,
    file => files.get(file),
  );
  files.set("index.html", new TextEncoder().encode(html));
  return new Map(
    [...files].map(([file, bytes]) => [`${VERIFY_DIR}/${file}`, bytes]),
  );
};
