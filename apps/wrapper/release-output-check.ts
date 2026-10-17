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
} from "./release-files.ts";

const fail = (what: string): never => {
  throw new Error(
    `The Wrapper's release output ${what}; the build is refused.`,
  );
};

/**
 * The output allow-list, compared in lower case: what the Wrapper's build emits
 * and nothing else. A script or stylesheet must also be loaded by an SRI tag of
 * the page; `.json` is the manifest and the headers file only; the page is the
 * one HTML file, written exactly `index.html`. Any other type (another HTML
 * spelling, `.svg`, which can hold a script, `.cjs`, an image, a font) is
 * refused; a type the Wrapper needs is added here explicitly.
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
  if (file === PAGE) {
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
    `has ${file}, whose type is not on the output allow-list (.js and .css loaded by the page, ${MANIFEST_FILE}, ${HEADERS_FILE}, and ${PAGE})`,
  );
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
): Promise<void> => {
  const manifestBytes = files.get(MANIFEST_FILE);
  if (manifestBytes === undefined) fail(`has no ${MANIFEST_FILE}`);
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
    readonly files?: Readonly<Record<string, string>>;
  };
  const listed = manifest.files ?? {};
  const page = files.get(PAGE);
  if (page === undefined) fail(`has no ${PAGE}`);
  const named = new Set<string>();
  for (const match of new TextDecoder().decode(page).matchAll(TAG)) {
    const attributes = attributesOf(match[2] ?? "");
    const reference = attributes.get("src") ?? attributes.get("href");
    if (
      reference !== undefined &&
      reference.startsWith(base) &&
      attributes.has("integrity")
    ) {
      named.add(reference.slice(base.length));
    }
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
 * build, since its content would not be what was checked.
 */
export const readTree = async (
  directory: string,
): Promise<Map<string, Uint8Array>> => {
  if (!(await lstat(directory)).isDirectory()) {
    fail("directory is not a directory (a symbolic link or another entry)");
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
      fail(`has ${path}, a symbolic link (isSymbolicLink())`);
    }
    if (!entry.isFile() && !entry.isDirectory()) {
      fail(`has ${path}, which is neither a regular file nor a directory`);
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
