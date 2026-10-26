// The best-effort build-identity report (RFC-002, Q6): the hashed asset names of
// the served page are compared with those of the local `apps/wrapper/dist`. A
// mismatch is a line to report and never fails anything; a page that cannot be
// read reports nothing.

import { expect, test } from "../harness/worker-browser.ts";
import {
  assetNamesOf,
  buildIdentityReport,
  sameAssets,
  type PageFetch,
} from "../preview-support/build-identity.ts";
import { parsePreviewEnvironment } from "../preview-support/preview-environment.ts";

const page = (js: string, css: string): string =>
  `<script type="module" src="/assets/${js}"></script><link rel="stylesheet" href="/assets/${css}">`;

const environment = parsePreviewEnvironment({
  SE_E2E_PREVIEW_ORIGIN: "https://preview.example.test",
  SE_E2E_PREVIEW_LAUNCH_COMMAND: "/opt/runner/launch-hook",
  SE_E2E_PREVIEW_GAME_ORIGIN: "https://game.example-games.test",
});

const localPage = (): Promise<string> =>
  Promise.resolve(page("index-LOCAL.js", "index-LOCAL.css"));

const missing = (): Promise<string> => Promise.reject(new Error("no dist"));

const failing: PageFetch = () => Promise.reject(new Error("offline"));

const served =
  (html: string): PageFetch =>
  () =>
    Promise.resolve({ text: () => Promise.resolve(html) });

test.describe("the build identity", () => {
  test("names the hashed assets of a page, sorted and once", () => {
    expect(assetNamesOf(page("index-AbC123.js", "index-Zz9.css"))).toEqual([
      "/assets/index-AbC123.js",
      "/assets/index-Zz9.css",
    ]);
  });

  test("matches pages that name the same assets", () => {
    expect(
      sameAssets(
        page("index-A.js", "index-B.css"),
        page("index-A.js", "index-B.css"),
      ),
    ).toBe(true);
  });

  test("does not match other hashes, and does not match two pages without assets", () => {
    expect(
      sameAssets(
        page("index-A.js", "index-B.css"),
        page("index-C.js", "index-B.css"),
      ),
    ).toBe(false);
    expect(sameAssets("<p>none</p>", "<p>none</p>")).toBe(false);
  });

  test("reports nothing when the page cannot be read", async () => {
    expect(
      await buildIdentityReport(environment, failing, localPage),
    ).toBeUndefined();
  });

  test("reports nothing when the local build cannot be read", async () => {
    expect(
      await buildIdentityReport(
        environment,
        served(page("index-LOCAL.js", "index-LOCAL.css")),
        missing,
      ),
    ).toBeUndefined();
  });

  test("reports nothing when the pages name the same assets", async () => {
    expect(
      await buildIdentityReport(
        environment,
        served(page("index-LOCAL.js", "index-LOCAL.css")),
        localPage,
      ),
    ).toBeUndefined();
  });

  test("reports a mismatch as one line without any value", async () => {
    const report = await buildIdentityReport(
      environment,
      served(page("index-OTHER.js", "index-OTHER.css")),
      localPage,
    );
    expect(report).toContain("names other assets");
    expect(report).not.toContain("OTHER");
    expect(report).not.toContain("LOCAL");
    expect(report).not.toContain("preview.example.test");
  });
});
