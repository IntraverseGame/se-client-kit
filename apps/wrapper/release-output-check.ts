// The check of the Wrapper's release output as written on disk
// (specs/client-kit.md, How the Wrapper reaches the SuperEngine origin). It
// runs after the build has written everything, so it also sees a file that
// did not pass through the bundle (a copied `public/` file, a later plugin's
// output) and a file changed after it was hashed.

import { lstat, readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import {
  attributesOf,
  digest,
  HEADERS_FILE,
  hex,
  MANIFEST_FILE,
  PAGE,
  TAG,
  VERIFY_DIR,
  VERIFY_PAGE,
} from "./release-files.ts";

const WRAPPER_OUTPUT = "The Wrapper's release output";

const fail = (what: string, subject = WRAPPER_OUTPUT): never => {
  throw new Error(`${subject} ${what}; the build is refused.`);
};

/**
 * The output allow-list, compared in lower case: what the Wrapper's build emits
 * and nothing else. A script or stylesheet must also be loaded by an SRI tag of
 * the page; `.json` is the manifest and the headers file only; the HTML files
 * are the Wrapper's page, written exactly `index.html`, and the verify page,
 * written exactly `verify/index.html`. Any other type (another HTML spelling,
 * `.svg`, which can hold a script, `.cjs`, an image, a font) is refused; a type
 * the Wrapper needs is added here explicitly.
 */
const LOADED_BY_THE_PAGE: ReadonlySet<string> = new Set([".js", ".css"]);
const DATA_FILES: ReadonlySet<string> = new Set([MANIFEST_FILE, HEADERS_FILE]);

const extensionOf = (file: string): string => {
  const name = file.slice(file.lastIndexOf("/") + 1).toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot);
};

/** Refuses a file whose type the release output does not allow. */
const checkType = (file: string, named: ReadonlySet<string>): void => {
  if (file === PAGE || file === VERIFY_PAGE) {
    return;
  }
  const extension = extensionOf(file);
  if (LOADED_BY_THE_PAGE.has(extension)) {
    if (!named.has(file)) {
      fail(
        `has ${file}, which the page does not load by a tag (it would load without SRI)`,
      );
    }
    return;
  }
  if (extension === ".json" && DATA_FILES.has(file)) {
    return;
  }
  fail(
    `has ${file}, whose type is not on the output allow-list (.js and .css loaded by a page, ${MANIFEST_FILE}, ${HEADERS_FILE}, ${PAGE}, and ${VERIFY_PAGE})`,
  );
};

export type VerifyOutputOptions = {
  /** The output must hold the verify page (`verify/index.html`). */
  readonly requireVerify?: boolean;
};

/**
 * Adds to `named` the files a page loads by a tag that carries `integrity` (by
 * path relative to `base`). A reference not under `scope`, or under `excluded`
 * when given, fails the build.
 */
const addLoaded = (
  named: Set<string>,
  page: Uint8Array,
  base: string,
  scope: string,
  excluded?: string,
): void => {
  for (const match of new TextDecoder().decode(page).matchAll(TAG)) {
    const attributes = attributesOf(match[2] ?? "");
    const reference = attributes.get("src") ?? attributes.get("href");
    if (reference !== undefined && attributes.has("integrity")) {
      if (!reference.startsWith(scope)) {
        fail(`has a page that loads ${reference}, outside ${scope}`);
      }
      if (excluded !== undefined && reference.startsWith(excluded)) {
        fail(`has a page that loads ${reference}, inside ${excluded}`);
      }
      named.add(reference.slice(base.length));
    }
  }
};

/**
 * Checks the release output as written: `files` is every file of the output
 * directory, by path relative to it with `/` separators, and `base` the public
 * base path. The scripts and stylesheets the page loads are read from the
 * written `index.html`'s tags. Throws on the first problem.
 */
export const verifyOutput = async (
  files: ReadonlyMap<string, Uint8Array>,
  base: string,
  options: VerifyOutputOptions = {},
): Promise<void> => {
  const manifestBytes =
    files.get(MANIFEST_FILE) ?? fail(`has no ${MANIFEST_FILE}`);
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
    readonly files?: Readonly<Record<string, string>>;
  };
  const listed = manifest.files ?? {};
  const page = files.get(PAGE) ?? fail(`has no ${PAGE}`);
  const named = new Set<string>();
  // The Wrapper's page loads nothing of the verify page's: each page's files
  // are its own.
  addLoaded(named, page, base, base, `${base}${VERIFY_DIR}/`);
  const verifyPage = files.get(VERIFY_PAGE);
  const hasVerifyFiles = [...files.keys()].some(file =>
    file.startsWith(`${VERIFY_DIR}/`),
  );
  if (verifyPage === undefined && (hasVerifyFiles || options.requireVerify)) {
    fail(`has no ${VERIFY_PAGE}`);
  }
  if (verifyPage !== undefined) {
    // The verify page loads only what is under its own directory.
    addLoaded(named, verifyPage, base, `${base}${VERIFY_DIR}/`);
  }
  for (const file of files.keys()) {
    checkType(file, named);
    if (file !== MANIFEST_FILE && !Object.hasOwn(listed, file)) {
      fail(`has ${file}, which the manifest does not list`);
    }
  }
  const entries = Object.entries(listed);
  for (const [file] of entries) {
    if (!files.has(file)) fail(`lacks ${file}, which the manifest lists`);
  }
  const hashes = await Promise.all(
    entries.map(async ([file]) =>
      hex(await digest(files.get(file) ?? new Uint8Array())),
    ),
  );
  entries.forEach(([file, expected], index) => {
    if (hashes[index] !== expected) {
      fail(`has ${file}, which differs from its manifest hash`);
    }
  });
};

/**
 * Every file under `directory`, by relative path with `/` separators. Only
 * regular files and directories are allowed: a symbolic link (to a file or a
 * directory; `isSymbolicLink()`), a socket, a FIFO, or a device refuses the
 * build, since its content would not be what was checked. `subject` names the
 * tree in a refusal (the verify build is read through here too).
 */
export const readTree = async (
  directory: string,
  subject = WRAPPER_OUTPUT,
): Promise<Map<string, Uint8Array>> => {
  if (!(await lstat(directory)).isDirectory()) {
    fail(
      "directory is not a directory (a symbolic link or another entry)",
      subject,
    );
  }
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  const relativePath = (full: string): string =>
    relative(directory, full).split(sep).join("/");
  for (const entry of entries) {
    const path = relativePath(join(entry.parentPath, entry.name));
    if (entry.isSymbolicLink()) {
      fail(`has ${path}, a symbolic link (isSymbolicLink())`, subject);
    }
    if (!entry.isFile() && !entry.isDirectory()) {
      fail(
        `has ${path}, which is neither a regular file nor a directory`,
        subject,
      );
    }
  }
  const files = new Map<string, Uint8Array>();
  await Promise.all(
    entries
      .filter(entry => entry.isFile())
      .map(async entry => {
        const full = join(entry.parentPath, entry.name);
        files.set(relativePath(full), new Uint8Array(await readFile(full)));
      }),
  );
  return files;
};
