// @vitest-environment node
// T-47's source check (SP-6, SP-8, SP-12, SP-13; as the verify page's VT-10):
// the page's sources and its HTML (not its tests or fixtures) read nothing of
// the URL but its origin, no referrer, no window name, and no storage of any
// kind; they make no `console` call, open no other channel than the one
// configuration fetch, never read a global wallet provider or an announced
// icon, use no markup sink, and never post to `"*"`. A text scan, so it is
// checked against a sample first (it is not vacuous).

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const APP = join(import.meta.dirname, "..");

/** What the sources must not hold, each with its finding's name. */
const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ["a location field but origin", /\blocation\.(?!origin\b)[a-z]/u],
  ["URLSearchParams", /\bURLSearchParams\b/u],
  ["the referrer", /\.referrer\b/u],
  ["the window name", /\b(?:window|page|self|globalThis)\.name\b/u],
  ["storage", /\b(?:localStorage|sessionStorage|indexedDB|caches)\b/u],
  ["a cookie", /\bcookie(?:Store)?\b/u],
  ["a service worker", /\bserviceWorker\b/u],
  ["console", /\bconsole\b/u],
  [
    "another channel",
    /\b(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon|RTCPeerConnection|BroadcastChannel)\b/u,
  ],
  ["a global provider", /\.ethereum\b/u],
  ["the announced icon", /\.icon\b/u],
  [
    "a markup sink",
    /\b(?:innerHTML|outerHTML|insertAdjacentHTML|srcdoc)\b|document\.write/u,
  ],
  ["a wildcard target origin", /["'`]\*["'`]/u],
];

const scan = (text: string): string[] =>
  FORBIDDEN.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);

/** The page's own files: `index.html` and `src/`, without tests or fixtures. */
const pageSources = (): ReadonlyMap<string, string> => {
  const files = new Map<string, string>([
    ["index.html", readFileSync(join(APP, "index.html"), "utf8")],
  ]);
  for (const entry of readdirSync(join(APP, "src"), {
    recursive: true,
    withFileTypes: true,
  })) {
    const path = relative(APP, join(entry.parentPath, entry.name));
    if (
      entry.isFile() &&
      /\.(?:ts|css)$/u.test(entry.name) &&
      !entry.name.endsWith(".test.ts") &&
      !path.includes("fixtures")
    ) {
      files.set(path, readFileSync(join(APP, path), "utf8"));
    }
  }
  return files;
};

describe("the page's sources (SP-6, SP-12)", () => {
  it.each([
    ["location.search", "a location field but origin"],
    ["location.hash", "a location field but origin"],
    ["new URLSearchParams(x)", "URLSearchParams"],
    ["document.referrer", "the referrer"],
    ["window.name", "the window name"],
    ["sessionStorage.getItem", "storage"],
    ["document.cookie", "a cookie"],
    ["navigator.serviceWorker", "a service worker"],
    ["console.log(x)", "console"],
    ["navigator.sendBeacon(x)", "another channel"],
    ["window.ethereum", "a global provider"],
    ["info.icon", "the announced icon"],
    ["el.innerHTML = x", "a markup sink"],
    ['postMessage(m, "*")', "a wildcard target origin"],
  ])("the scan finds %s", (text, name) => {
    expect(scan(text)).toContain(name);
  });

  it("reads the page's files, and none holds a forbidden reference", () => {
    const files = pageSources();
    expect([...files.keys()]).toEqual(
      expect.arrayContaining([
        "index.html",
        "src/signing-page.ts",
        "src/wallet-port.ts",
        "src/styles.css",
      ]),
    );
    const findings = [...files].flatMap(([path, text]) =>
      scan(text).map(name => `${path}: ${name}`),
    );
    expect(findings).toEqual([]);
  });

  it("calls fetch only for the configuration (load-config.ts, start-page.ts)", () => {
    const fetching = [...pageSources()]
      .filter(([, text]) => /\bfetch\b/u.test(text))
      .map(([path]) => path)
      .toSorted();
    expect(fetching).toEqual([
      "src/load-config.ts",
      "src/signing-page.ts",
      "src/start-page.ts",
    ]);
    const calls = [...pageSources().values()]
      .join("\n")
      .matchAll(/\bfetch\(/gu);
    expect([...calls]).toHaveLength(1);
  });
});
