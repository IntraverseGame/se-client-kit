// @vitest-environment node
// The verify page inside the Wrapper's release (specs/verify-page.md, V-16):
// its build is read from disk, signed, given its own policy, listed in the
// manifest, and held to the output allow-list under `verify/`.

import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HEADERS_FILE, MANIFEST_FILE } from "../release-files.ts";
import {
  VERIFY_HEADERS_PATH,
  VERIFY_META_CONTENT_SECURITY_POLICY,
} from "../release-headers.ts";
import { verifyOutputFiles } from "../release-verify.ts";
import {
  bundleOf,
  encoder,
  run,
  sha256,
  sourceOf,
  verified,
  writtenFiles,
} from "./fixtures/release-bundle.ts";

const VERIFY_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script type="module" crossorigin src="/verify/assets/index-v.js"></script>
</head><body><div id="app"></div></body></html>`;
const VERIFY_JS = "console.log('verify');";

const directories: string[] = [];

const VERIFY_FILES: Readonly<Record<string, string>> = {
  "index.html": VERIFY_PAGE,
  "assets/index-v.js": VERIFY_JS,
};

/** A verify build output (`apps/verify/dist/`) holding `files`. */
const verifyDist = (
  files: Readonly<Record<string, string>> = VERIFY_FILES,
): string => {
  const directory = mkdtempSync(join(tmpdir(), "se-client-verify-dist-"));
  directories.push(directory);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), text);
  }
  return directory;
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const REQUIRED = { requireVerify: true };

describe("the verify page in the release", () => {
  it("signs its script, adds its own policy, and puts its files under verify/", async () => {
    const files = await verifyOutputFiles(verifyDist(), "/");
    expect([...files.keys()].toSorted()).toEqual([
      "verify/assets/index-v.js",
      "verify/index.html",
    ]);
    const page = new TextDecoder().decode(files.get("verify/index.html"));
    expect(page).toContain(
      `src="/verify/assets/index-v.js" integrity="sha256-${await sha256(VERIFY_JS, "base64")}"`,
    );
    expect(page).toContain(
      `<head><meta http-equiv="Content-Security-Policy" content="${VERIFY_META_CONTENT_SECURITY_POLICY}">`,
    );
    expect(
      new TextDecoder().decode(files.get("verify/assets/index-v.js")),
    ).toBe(VERIFY_JS);
  });

  it("lists its files in the manifest and its policy in the headers file", async () => {
    const bundle = await run(bundleOf(), { verifyDist: verifyDist() });
    const manifest = JSON.parse(sourceOf(bundle, MANIFEST_FILE)) as {
      files: Record<string, string>;
    };
    expect(Object.keys(manifest.files)).toEqual([
      "assets/index-a.js",
      "assets/index-b.css",
      HEADERS_FILE,
      "index.html",
      "verify/assets/index-v.js",
      "verify/index.html",
    ]);
    expect(manifest.files["verify/assets/index-v.js"]).toBe(
      await sha256(VERIFY_JS, "hex"),
    );
    expect(manifest.files["verify/index.html"]).toBe(
      await sha256(sourceOf(bundle, "verify/index.html"), "hex"),
    );
    expect(
      Object.keys(JSON.parse(sourceOf(bundle, HEADERS_FILE)) as object),
    ).toContain(VERIFY_HEADERS_PATH);
  });

  it("accepts the output as written, verify/index.html as the second HTML file", async () => {
    await expect(
      verified(() => {}, bundleOf(), { verifyDist: verifyDist() }, REQUIRED),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["an inline script", "<script>alert(1)</script>"],
    ["an inline style", "<style>body{}</style>"],
    ["a style attribute", '<div style="color:red"></div>'],
    ["an event handler", '<body onload="x()"></body>'],
    ["a remote script", '<script src="https://cdn.example/x.js"></script>'],
    ["a script outside verify/", '<script src="/assets/index-a.js"></script>'],
    ["a file the build lacks", '<script src="/verify/assets/x.js"></script>'],
  ])("refuses a verify page with %s", async (_, html) => {
    const dist = verifyDist({
      "index.html": VERIFY_PAGE.replace("</head>", `${html}</head>`),
      "assets/index-v.js": VERIFY_JS,
    });
    await expect(verifyOutputFiles(dist, "/")).rejects.toThrow(
      /verify release page .* refused/u,
    );
  });

  it("refuses a page that has its own Content-Security-Policy meta", async () => {
    const dist = verifyDist({
      "index.html": VERIFY_PAGE.replace(
        "<head>",
        '<head><meta http-equiv="Content-Security-Policy" content="default-src *">',
      ),
      "assets/index-v.js": VERIFY_JS,
    });
    await expect(verifyOutputFiles(dist, "/")).rejects.toThrow(
      /already has a Content-Security-Policy/u,
    );
  });

  it.each([
    ["no build output", () => join(tmpdir(), "se-client-verify-missing")],
    ["no index.html", () => verifyDist({ "assets/index-v.js": VERIFY_JS })],
  ])("refuses a build with %s", async (_, dist) => {
    await expect(verifyOutputFiles(dist(), "/")).rejects.toThrow(
      /verify page .* refused/u,
    );
  });

  it("refuses a symbolic link in the build output", async () => {
    const dist = verifyDist();
    symlinkSync(join(dist, "index.html"), join(dist, "link.js"));
    await expect(verifyOutputFiles(dist, "/")).rejects.toThrow(
      /^The verify build has link\.js, a symbolic link/u,
    );
  });

  it("refuses a verify build file whose type is not on the allow-list", async () => {
    const dist = verifyDist({
      "index.html": VERIFY_PAGE,
      "assets/index-v.js": VERIFY_JS,
      "assets/logo.svg": "<svg/>",
    });
    await expect(
      verified(() => {}, bundleOf(), { verifyDist: dist }, REQUIRED),
    ).rejects.toThrow(/verify\/assets\/logo\.svg, whose type is not on/u);
  });

  it("refuses a script of the verify build that its page does not load", async () => {
    const dist = verifyDist({
      "index.html": VERIFY_PAGE,
      "assets/index-v.js": VERIFY_JS,
      "assets/lazy.js": "export const lazy = 1;",
    });
    await expect(
      verified(() => {}, bundleOf(), { verifyDist: dist }, REQUIRED),
    ).rejects.toThrow(
      /verify\/assets\/lazy\.js, which the page does not load/u,
    );
  });

  it.each([
    "verify/other.html",
    "verify/Index.html",
    "verify/headers.json",
    "verify/integrity-manifest.json",
    "verify/nested/index.html",
  ])("refuses %s, even when the manifest lists it", async name => {
    const bundle = bundleOf();
    bundle[name] = { type: "asset", fileName: name, source: "{}" };
    await expect(
      verified(() => {}, bundle, { verifyDist: verifyDist() }, REQUIRED),
    ).rejects.toThrow(/whose type is not on the output allow-list/u);
  });

  it("refuses a verify file changed after it was hashed", async () => {
    await expect(
      verified(
        files => {
          files.set("verify/assets/index-v.js", encoder.encode("x"));
        },
        bundleOf(),
        { verifyDist: verifyDist() },
        REQUIRED,
      ),
    ).rejects.toThrow(/verify\/assets\/index-v\.js, which differs/u);
  });

  it("refuses a Wrapper page that loads a file of the verify page", async () => {
    await expect(
      verified(
        files => {
          const page = new TextDecoder().decode(files.get("index.html"));
          files.set(
            "index.html",
            encoder.encode(
              page.replace(
                "</head>",
                '<script type="module" src="/verify/assets/index-v.js" integrity="sha256-x"></script></head>',
              ),
            ),
          );
        },
        bundleOf(),
        { verifyDist: verifyDist() },
        REQUIRED,
      ),
    ).rejects.toThrow(
      /a page that loads \/verify\/assets\/index-v\.js, inside \/verify\//u,
    );
  });

  it("refuses an output without the verify page when it is required", async () => {
    await expect(verified(() => {}, bundleOf(), {}, REQUIRED)).rejects.toThrow(
      /has no verify\/index\.html/u,
    );
  });

  it("refuses verify files without their page, even when not required", async () => {
    const files = writtenFiles(
      await run(bundleOf(), { verifyDist: verifyDist() }),
    );
    files.delete("verify/index.html");
    const { verifyOutput } = await import("../release-output-check.ts");
    await expect(verifyOutput(files, "/")).rejects.toThrow(
      /has no verify\/index\.html/u,
    );
  });
});
