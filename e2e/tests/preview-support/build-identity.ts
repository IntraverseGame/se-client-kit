// A best-effort check that the stack serves the Wrapper this checkout builds
// (RFC-002, Q6). The primary check is that the backend's runner hands the stack
// and this project the same pin. This extra compares the hashed asset names of
// the served page with those of the local `apps/wrapper/dist`. A mismatch is
// reported in the run output and never fails the run; a page that cannot be
// read or compared is skipped.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { WRAPPER_DIST } from "../harness/origins.ts";
import { DOCUMENT_TIMEOUT_MS } from "./environment-document.ts";
import type { PreviewEnvironment } from "./preview-environment.ts";

/** The hashed asset paths a page names (`/assets/index-<hash>.js`). */
export const assetNamesOf = (html: string): readonly string[] =>
  [
    ...new Set(
      [...html.matchAll(/\/assets\/[\w.-]+\.(?:css|js)/gu)].map(m => m[0]),
    ),
  ].toSorted();

/** Whether two pages name the same assets (and name some). */
export const sameAssets = (served: string, local: string): boolean => {
  const left = assetNamesOf(served);
  const right = assetNamesOf(local);
  return (
    left.length > 0 &&
    left.length === right.length &&
    left.every((name, index) => name === right[index])
  );
};

export type PageFetch = (
  url: string,
  init: {
    readonly credentials: "omit";
    readonly redirect: "error";
    readonly signal: AbortSignal;
  },
) => Promise<{ readonly text: () => Promise<string> }>;

/** The local build's page: `apps/wrapper/dist/index.html`. */
const readLocalPage = (): Promise<string> =>
  readFile(join(WRAPPER_DIST, "index.html"), "utf8");

/** The one line to report on a mismatch, or `undefined` when nothing differs. */
export const buildIdentityReport = async (
  environment: PreviewEnvironment,
  fetchImpl: PageFetch = fetch,
  readLocal: () => Promise<string> = readLocalPage,
): Promise<string | undefined> => {
  try {
    const local = await readLocal();
    const response = await fetchImpl(`${environment.origin}/`, {
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(DOCUMENT_TIMEOUT_MS),
    });
    return sameAssets(await response.text(), local)
      ? undefined
      : "preview: the Wrapper page the stack serves names other assets than apps/wrapper/dist; the stack may not run this checkout's build (the pin may differ)";
  } catch {
    return undefined;
  }
};
