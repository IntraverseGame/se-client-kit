// A page built on its own and carried inside the Wrapper's release (the verify
// page under `verify/`, specs/verify-page.md V-16; the signing page under
// `signer/`, specs/signing-page.md SP-14): its build output is read from disk
// (regular files only, release-output-check.ts `readTree`), its page gets its
// own `<meta>` policy first in the head and SRI on every script and stylesheet,
// which must lie under its directory, and its files are returned under that
// directory for the integrity manifest. The page is the only file changed.

import { lstat } from "node:fs/promises";

import { readTree } from "./release-output-check.ts";
import { withIntegrity } from "./release-sri.ts";

const HEAD = /<head(?:\s[^>]*)?>/iu;
const CSP_META = /http-equiv\s*=\s*["']?content-security-policy/iu;

/** How one carried page is named and treated. */
export type CarriedPage = {
  /** Its directory in the release output, e.g. `verify`. */
  readonly dir: string;
  /** Its name in a refusal, e.g. `verify page`. */
  readonly name: string;
  /** Its build in a refusal from `readTree`, e.g. `The verify build`. */
  readonly build: string;
  /** Its name in an SRI refusal, e.g. `verify`. */
  readonly sri: string;
  /** Where its own build lives, for the hint in a refusal. */
  readonly app: string;
  /** Its `<meta>` Content Security Policy. */
  readonly metaPolicy: string;
};

const refuser =
  (page: CarriedPage) =>
  (what: string): never => {
    throw new Error(`The ${page.name} ${what}; the build is refused.`);
  };

/** The page with its `<meta>` policy first in the head, or a refusal. */
const withPolicy = (page: CarriedPage, html: string): string => {
  const refuse = refuser(page);
  if (CSP_META.test(html)) {
    refuse(
      "already has a Content-Security-Policy <meta>; the release step adds the page's policy",
    );
  }
  const head = HEAD.exec(html);
  if (head === null) return refuse("has no <head> to hold its policy");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${page.metaPolicy}">`;
  const end = head.index + head[0].length;
  return `${html.slice(0, end)}${meta}${html.slice(end)}`;
};

/**
 * The carried page's files for the release output, by path with its directory
 * as prefix: `dist` is its app's build output and `base` the Wrapper's public
 * base path.
 */
export const carriedPageFiles = async (
  page: CarriedPage,
  dist: string,
  base: string,
): Promise<Map<string, Uint8Array>> => {
  const refuse = refuser(page);
  const entry = await lstat(dist).catch(() => null);
  if (entry?.isDirectory() !== true) {
    refuse(`has no build output at ${dist} (build ${page.app} first)`);
  }
  const files = await readTree(dist, page.build);
  const html = files.get("index.html");
  if (html === undefined) return refuse("build has no index.html");
  const signed = await withIntegrity(
    page.sri,
    withPolicy(page, new TextDecoder().decode(html)),
    `${base}${page.dir}/`,
    file => files.get(file),
  );
  files.set("index.html", new TextEncoder().encode(signed));
  return new Map(
    [...files].map(([file, bytes]) => [`${page.dir}/${file}`, bytes]),
  );
};
