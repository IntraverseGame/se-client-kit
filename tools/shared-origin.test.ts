// VT-10 (specs/verify-page.md): the verify page's sources never reference Web
// Locks, BroadcastChannel, storage, cookies, or workers. The cases are written
// from the spec's list, so a weakened pattern fails here.

import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { findSharedOriginUses, isPageSource } from "./shared-origin.ts";
import { findFiles, readText } from "./workspace.ts";

const root = join(import.meta.dirname, "..");
const VERIFY = "apps/verify";

const scan = (text: string): string[] =>
  findSharedOriginUses(new Map([["apps/verify/src/a.ts", text]]));

describe("the shared-origin scan", () => {
  it.each([
    ["navigator.locks", "await navigator.locks.request('x', run);"],
    ["navigator.locks", 'const l = navigator["locks"];'],
    ["BroadcastChannel", "new BroadcastChannel('round');"],
    ["localStorage", "localStorage.setItem('a', 'b');"],
    ["sessionStorage", "globalThis.sessionStorage.clear();"],
    ["indexedDB", "indexedDB.open('db');"],
    ["caches", "await caches.open('v1');"],
    ["document.cookie", "document.cookie = 'a=b';"],
    ["document.cookie", "await cookieStore.get('a');"],
    ["Worker", "new Worker('/w.js');"],
    ["SharedWorker", "new SharedWorker('/w.js');"],
    ["serviceWorker", "navigator.serviceWorker.register('/sw.js');"],
  ])("finds %s in `%s`", (name, text) => {
    expect(scan(text)).toContain(`apps/verify/src/a.ts: ${name}`);
  });

  it("finds a reference in a comment too", () => {
    expect(scan("// keeps the round in localStorage\n")).toEqual([
      "apps/verify/src/a.ts: localStorage",
    ]);
  });

  it("passes text that names none of them", () => {
    expect(
      scan("const block = await crypto.subtle.digest('SHA-256', bytes);"),
    ).toEqual([]);
  });

  it("reads the page's sources and HTML, not its tests", () => {
    expect(isPageSource("apps/verify/src/kernels.ts")).toBe(true);
    expect(isPageSource("apps/verify/index.html")).toBe(true);
    expect(isPageSource("apps/verify/src/kernels.test.ts")).toBe(false);
    expect(isPageSource("apps/verify/src/fixtures/kernel-vectors.ts")).toBe(
      false,
    );
    expect(isPageSource("apps/verify/README.md")).toBe(false);
  });
});

describe("apps/verify", () => {
  it("references no Web Lock, channel, storage, cookie, or worker", () => {
    const paths = findFiles(join(root, VERIFY), isPageSource).map(
      path => `${VERIFY}/${path}`,
    );
    expect(paths).toContain(`${VERIFY}/src/steps-derive.ts`);
    expect(
      findSharedOriginUses(
        new Map(paths.map(path => [path, readText(root, path)])),
      ),
    ).toEqual([]);
  });

  it("has an HTML page that mounts at #verify-root with no inline script or style", () => {
    const html = readText(root, `${VERIFY}/index.html`);
    expect(html).toContain('id="verify-root"');
    expect(html).not.toMatch(/<style[\s>]/iu);
    expect(html).not.toMatch(/\sstyle\s*=/iu);
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/iu);
    // The release step adds the policy; the source has none of its own.
    expect(html).not.toMatch(/content-security-policy/iu);
  });
});
