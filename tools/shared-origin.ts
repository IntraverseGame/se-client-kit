// The verify page's shared-origin rule (specs/verify-page.md, Security and
// VT-10). Served under `/verify/` on the Wrapper's origin, the page shares that
// origin's Web Locks, BroadcastChannel, storage, and workers with the code that
// holds the player's key, so its sources must not reference any of them. This is
// a text scan, comments and strings included (fail closed): a word that names
// one of them is a finding, wherever it appears.

import { isTestPath } from "./test-only-entry.ts";

/** What the page must not use, each as a whole word, with its finding's name. */
const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ["navigator.locks", /\blocks\b/u],
  ["BroadcastChannel", /\bBroadcastChannel\b/u],
  ["localStorage", /\blocalStorage\b/u],
  ["sessionStorage", /\bsessionStorage\b/u],
  ["indexedDB", /\bindexedDB\b/u],
  ["caches", /\bcaches\b/u],
  ["document.cookie", /\bcookie(?:Store)?\b/u],
  ["Worker", /\bWorker\b/u],
  ["SharedWorker", /\bSharedWorker\b/u],
  ["serviceWorker", /\bserviceWorker\b/u],
];

/** The page's files the scan reads: its sources and its HTML, not its tests. */
export const isPageSource = (path: string): boolean =>
  /\.(?:[cm]?[jt]sx?|html)$/u.test(path) && !isTestPath(path);

/** `path: name` for every forbidden reference in `files`, sorted. */
export const findSharedOriginUses = (
  files: ReadonlyMap<string, string>,
): string[] =>
  [...files]
    .flatMap(([path, text]) =>
      FORBIDDEN.filter(([, pattern]) => pattern.test(text)).map(
        ([name]) => `${path}: ${name}`,
      ),
    )
    .toSorted();
