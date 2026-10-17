// Serves a directory of files at an origin through a context route, so the
// release bundle is loaded exactly as built, with no web server or port.

import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

import type { BrowserContext } from "@playwright/test";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const contentType = (path: string): string =>
  CONTENT_TYPES[extname(path)] ?? "application/octet-stream";

const decoded = (pathname: string): string | undefined => {
  try {
    return decodeURIComponent(pathname);
  } catch {
    // A malformed `%` escape names no file.
    return undefined;
  }
};

const fileIn = (root: string, decodedPath: string): string | undefined => {
  const relative = decodedPath.replace(/^\/+/u, "");
  const path = normalize(join(root, relative === "" ? "index.html" : relative));
  const inside = path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
  return inside ? path : undefined;
};

/** The file under `root` that `pathname` names, or `undefined` outside it. */
const fileOf = (root: string, pathname: string): string | undefined => {
  const path = decoded(pathname);
  return path === undefined ? undefined : fileIn(root, path);
};

/**
 * Serves `root` at `origin`: `/` is `index.html`, a missing file is a 404. The
 * query string and the fragment are ignored.
 */
export const serveDirectory = async (
  context: BrowserContext,
  origin: string,
  root: string,
): Promise<void> => {
  await context.route(`${origin}/**`, async route => {
    const path = fileOf(root, new URL(route.request().url()).pathname);
    const body =
      path === undefined ? null : await readFile(path).catch(() => null);
    await (body === null
      ? route.fulfill({
          status: 404,
          contentType: "text/plain",
          body: "not found",
        })
      : route.fulfill({
          status: 200,
          contentType: contentType(path ?? ""),
          body,
        }));
  });
};
