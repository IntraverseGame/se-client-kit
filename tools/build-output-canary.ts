// The output canary: a check of the final bytes in every dist/ that does not care
// how a vector got there. The input-side checks (the lint rule, the Wrapper's
// Vite guard, the `contracts` runtime-graph check) each cover the routes they
// know; every other route (a new bundler feature, a copied `public/` file, an
// import syntax nobody thought of) still ends with the vector's content in an
// emitted file, and this finds it.
//
// Each file under packages/contracts/src/vectors/** is fingerprinted, and the
// compiled test-only entry (packages/contracts/dist/testing.js) when it exists.
// An emitted file fails when:
//   - its bytes equal a vector file's (SHA-256, so a renamed or hashed name does
//     not matter; no minimum size for a vector file, a minimum for the compiled
//     entry);
//   - its text contains a vector's exact content, its minified JSON form (when
//     the vector parses as JSON), the JSON-escaped form of either (as in a source
//     map's `sourcesContent` or a JS string), or its base64 form (a data: URI).
//     The text forms are also taken with the trailing newline (and any other
//     surrounding whitespace) trimmed and with LF and CRLF line breaks. These
//     substring forms apply only to vectors of at least MIN_SUBSTRING_BYTES, so a
//     tiny file such as `[]` cannot cause false positives.
//
// Limits: data that was transformed so that none of those forms remains is not
// detected: a re-encoded or compressed copy, a JSON object printed as a JS
// literal with unquoted keys, a re-indented JSON copy (it is covered only through
// the minified form, and only when the vector parses as JSON), a line-wrapped
// base64 copy, a hex or UTF-16 copy, and a vector below the minimum size when it
// is inlined. The lint rule, the Wrapper guard, the runtime-graph check, and
// review cover those.
// The scan is linear in the size of the dists times the number of forms; there
// is no size cap.

import { createHash } from "node:crypto";

import { reachableFrom } from "./build-output.ts";

export const MIN_SUBSTRING_BYTES = 64;

export type Vector = {
  readonly path: string;
  readonly bytes: Buffer;
  /** The smallest size at which this vector is compared at all (hash included). */
  readonly minimumBytes: number;
};

export type CanaryDist = {
  /** `contracts`, `shell`, `wrapper`, and so on. */
  readonly name: string;
  /** The emitted files to scan, by path relative to `dist/`. */
  readonly files: ReadonlyMap<string, Buffer>;
};

const sha256 = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

const escapeForJsString = (text: string): string =>
  JSON.stringify(text).slice(1, -1);

/** The text of a file with its line breaks as LF, and as CRLF. */
const lineBreakVariants = (text: string): string[] => {
  const lf = text.replaceAll("\r\n", "\n");
  return [text, lf, lf.replaceAll("\n", "\r\n")];
};

/**
 * The text forms of a vector worth looking for inside a larger file. A bundler
 * or a formatter commonly trims a file's trailing newline, so every form is
 * also taken for the trimmed text, and for the LF and CRLF spellings of both;
 * the exact text, the JSON-escaped text, its base64, and (for JSON that parses)
 * the minified text and its escaped form.
 */
export const substringForms = (bytes: Buffer): Buffer[] => {
  if (bytes.length < MIN_SUBSTRING_BYTES) return [];
  const text = bytes.toString("utf8");
  const spellings = [text, text.trim()].flatMap(spelling =>
    lineBreakVariants(spelling),
  );
  const forms: string[] = [];
  for (const spelling of spellings) {
    forms.push(
      spelling,
      escapeForJsString(spelling),
      Buffer.from(spelling).toString("base64"),
    );
  }
  try {
    const minified = JSON.stringify(JSON.parse(text));
    forms.push(minified, escapeForJsString(minified));
  } catch {
    // Not JSON: no minified form applies.
  }
  const seen = new Set<string>();
  return forms
    .filter(form => Buffer.byteLength(form) >= MIN_SUBSTRING_BYTES)
    .filter(form => {
      if (seen.has(form)) return false;
      seen.add(form);
      return true;
    })
    .map(form => Buffer.from(form));
};

/** The problems found; empty means no emitted file holds a vector's content. */
export const findCanaryProblems = (
  vectors: readonly Vector[],
  dists: readonly CanaryDist[],
): string[] => {
  const problems: string[] = [];
  const prints = vectors
    .filter(vector => vector.bytes.length >= Math.max(1, vector.minimumBytes))
    .map(vector => ({
      vector,
      hash: sha256(vector.bytes),
      forms: substringForms(vector.bytes),
    }));
  for (const dist of dists) {
    for (const [path, bytes] of dist.files) {
      const hash = sha256(bytes);
      for (const print of prints) {
        const where = `${dist.name}/dist/${path}`;
        if (hash === print.hash) {
          problems.push(
            `${where}: is a copy of the vector file ${print.vector.path}`,
          );
        } else if (print.forms.some(form => bytes.includes(form))) {
          problems.push(
            `${where}: contains the content of the vector file ${print.vector.path}`,
          );
        }
      }
    }
  }
  return problems;
};

/**
 * The files of the `contracts` dist the canary scans. The compiled test-only
 * entry, its declaration, and the chunks only it loads legitimately hold the
 * vectors, so they are left out; everything the runtime entry reaches, and any
 * other file, is scanned.
 */
export const contractsScanScope = (
  buffers: ReadonlyMap<string, Buffer>,
): Map<string, Buffer> => {
  const texts = new Map(
    [...buffers].map(
      ([path, bytes]) => [path, bytes.toString("utf8")] as const,
    ),
  );
  const runtime = new Set([
    ...reachableFrom("index.js", texts),
    ...reachableFrom("index.d.ts", texts, true),
  ]);
  const testOnly = new Set([
    ...reachableFrom("testing.js", texts),
    ...reachableFrom("testing.d.ts", texts, true),
  ]);
  const excluded = new Set([...testOnly].filter(path => !runtime.has(path)));
  const isExcluded = (path: string): boolean =>
    excluded.has(path) ||
    (path.endsWith(".map") && excluded.has(path.slice(0, -".map".length)));
  return new Map([...buffers].filter(([path]) => !isExcluded(path)));
};
