// @vitest-environment node
// The release integrity step (specs/client-kit.md, How the Wrapper reaches the
// SuperEngine origin): it signs the page's scripts and styles, writes the
// headers file and the manifest, refuses a page the policy would have to
// loosen for, and checks the written output against the manifest.

import { describe, expect, it } from "vitest";

/** The written page with one more SRI-tagged script, for `assets/extra.js`. */
const withExtraScript = (files: ReadonlyMap<string, Uint8Array>): Uint8Array =>
  encoder.encode(
    new TextDecoder()
      .decode(files.get("index.html"))
      .replace(
        "</head>",
        '<script type="module" src="/assets/extra.js" integrity="sha256-x"></script></head>',
      ),
  );

import { HEADERS_FILE, MANIFEST_FILE } from "../release-files.ts";
import { releaseHeaders } from "../release-headers.ts";
import {
  bundleOf,
  CSS,
  encoder,
  JS,
  PAGE,
  run,
  sha256,
  sourceOf,
  verified,
} from "./fixtures/release-bundle.ts";

describe("the release integrity step", () => {
  it("adds the SHA-256 integrity of each script and stylesheet", async () => {
    const page = sourceOf(await run(bundleOf()), "index.html");
    expect(page).toContain(
      `src="/assets/index-a.js" integrity="sha256-${await sha256(JS, "base64")}"`,
    );
    expect(page).toContain(
      `href="/assets/index-b.css" integrity="sha256-${await sha256(CSS, "base64")}"`,
    );
  });

  it("writes the headers file and a manifest of every other file", async () => {
    const bundle = await run(bundleOf());
    expect(JSON.parse(sourceOf(bundle, HEADERS_FILE))).toEqual(
      releaseHeaders(),
    );
    const manifest = JSON.parse(sourceOf(bundle, MANIFEST_FILE)) as {
      algorithm: string;
      files: Record<string, string>;
    };
    expect(manifest.algorithm).toBe("sha256");
    expect(Object.keys(manifest.files)).toEqual([
      "assets/index-a.js",
      "assets/index-b.css",
      HEADERS_FILE,
      "index.html",
    ]);
    expect(manifest.files["assets/index-a.js"]).toBe(await sha256(JS, "hex"));
    expect(manifest.files["index.html"]).toBe(
      await sha256(sourceOf(bundle, "index.html"), "hex"),
    );
  });

  it.each([
    ["an inline script", "<script>alert(1)</script>"],
    ["an inline style", "<style>body{}</style>"],
    ["a style attribute", '<div style="color:red"></div>'],
    ["an event handler", '<body onload="x()"></body>'],
    ["a remote script", '<script src="https://cdn.example/x.js"></script>'],
    [
      "a protocol-relative script",
      '<script src="//cdn.example/x.js"></script>',
    ],
    ["a file the bundle lacks", '<script src="/assets/missing.js"></script>'],
  ])("refuses a page with %s", async (_, html) => {
    await expect(
      run(bundleOf(PAGE.replace("</head>", `${html}</head>`))),
    ).rejects.toThrow(/refused/u);
  });

  it("refuses a bundle without its page", async () => {
    const bundle = bundleOf();
    delete bundle["index.html"];
    await expect(run(bundle)).rejects.toThrow(/no index\.html/u);
  });

  it("accepts the output exactly as the manifest lists it", async () => {
    await expect(verified()).resolves.toBeUndefined();
  });

  it("refuses a file the bundle never contained (a public/ copy)", async () => {
    await expect(
      verified(files => {
        files.set("evil.html", encoder.encode("<script>alert(1)</script>"));
      }),
    ).rejects.toThrow(
      /evil\.html, whose type is not on the output allow-list/u,
    );
    // An allowed type the page even names, but the manifest never listed.
    await expect(
      verified(files => {
        files.set("assets/extra.js", encoder.encode("1;"));
        files.set("index.html", withExtraScript(files));
      }),
    ).rejects.toThrow(/assets\/extra\.js, which the manifest does not list/u);
  });

  it("refuses a file that differs on disk from its manifest hash", async () => {
    await expect(
      verified(files => {
        files.set("assets/index-a.js", encoder.encode("x"));
      }),
    ).rejects.toThrow(/index-a\.js, which differs from its manifest hash/u);
  });

  it("refuses a file the manifest lists that is not on disk", async () => {
    await expect(
      verified(files => {
        files.delete("assets/index-b.css");
      }),
    ).rejects.toThrow(/lacks assets\/index-b\.css/u);
  });

  it.each([
    "other.html",
    "Index.HTML",
    "Evil.HTML",
    "y.htm",
    "x.xhtml",
    "x.svg",
    "b.cjs",
    "notes.txt",
    "assets/extra.json",
  ])("refuses %s, even when the manifest lists it", async name => {
    const bundle = bundleOf();
    bundle[name] = { type: "asset", fileName: name, source: "<svg/>" };
    await expect(verified(() => {}, bundle)).rejects.toThrow(
      /whose type is not on the output allow-list/u,
    );
  });

  it.each(["A.JS", "assets/A.JS"])(
    "refuses %s, a script by its lower-cased type, not loaded by the page",
    async name => {
      const bundle = bundleOf();
      bundle[name] = { type: "chunk", fileName: name, code: "1;" };
      await expect(verified(() => {}, bundle)).rejects.toThrow(
        /A\.JS, which the page does not load by a tag/u,
      );
    },
  );

  it("refuses a chunk the page does not load by a tag (no SRI)", async () => {
    const bundle = bundleOf();
    bundle["assets/lazy-c.js"] = {
      type: "chunk",
      fileName: "assets/lazy-c.js",
      code: "export const lazy = 1;",
    };
    await expect(verified(() => {}, bundle)).rejects.toThrow(
      /lazy-c\.js, which the page does not load by a tag/u,
    );
  });

  it("refuses output without its manifest", async () => {
    await expect(
      verified(files => {
        files.delete(MANIFEST_FILE);
      }),
    ).rejects.toThrow(/has no integrity-manifest\.json/u);
  });
});
