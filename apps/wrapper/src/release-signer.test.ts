// @vitest-environment node
// The signing page inside the Wrapper's release (specs/signing-page.md, SP-14;
// T-49): its build is read from disk, signed, given its own policy, listed in
// the manifest, and held to the output allow-list under `signer/`, with
// `signer/index.html` as the third HTML file.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HEADERS_FILE, MANIFEST_FILE } from "../release-files.ts";
import {
  SIGNER_HEADERS_PATH,
  SIGNER_META_CONTENT_SECURITY_POLICY,
  signerHeaders,
} from "../release-headers.ts";
import { signerOutputFiles } from "../release-signer.ts";
import {
  bundleOf,
  encoder,
  run,
  sha256,
  sourceOf,
  verified,
  writtenFiles,
} from "./fixtures/release-bundle.ts";

const SIGNER_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<script type="module" crossorigin src="/signer/assets/index-s.js"></script>
</head><body><main id="signer-root"></main></body></html>`;
const SIGNER_JS = "export const signer = 1;";
const SIGNER_FILES: Readonly<Record<string, string>> = {
  "index.html": SIGNER_PAGE,
  "assets/index-s.js": SIGNER_JS,
};
const VERIFY_FILES: Readonly<Record<string, string>> = {
  "index.html":
    '<!doctype html><html><head><script type="module" src="/verify/assets/v.js"></script></head></html>',
  "assets/v.js": "export {};",
};

const directories: string[] = [];

/** A build output directory holding `files`. */
const distOf = (files: Readonly<Record<string, string>>): string => {
  const directory = mkdtempSync(join(tmpdir(), "se-client-signer-dist-"));
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

/** A release build's options: both carried pages. */
const both = (signer = SIGNER_FILES) => ({
  verifyDist: distOf(VERIFY_FILES),
  signerDist: distOf(signer),
});
const REQUIRED = { requireVerify: true, requireSigner: true };

const OWN_PAGE = join(import.meta.dirname, "../../signing-page/index.html");

describe("the signing page's own HTML in the release (T-49, SP-13)", () => {
  it.runIf(existsSync(OWN_PAGE))(
    "gets its <meta> policy and SRI on every script and stylesheet",
    async () => {
      const html = readFileSync(OWN_PAGE, "utf8")
        .replaceAll(/src="\/src\/[^"]+\.ts"/gu, 'src="/signer/assets/main.js"')
        .replaceAll(
          /href="\/src\/[^"]+\.css"/gu,
          'href="/signer/assets/main.css"',
        );
      const files = await signerOutputFiles(
        distOf({
          "index.html": html,
          "assets/main.js": "export {};",
          "assets/main.css": "body{}",
        }),
        "/",
      );
      const page = new TextDecoder().decode(files.get("signer/index.html"));
      expect(page).toContain(
        `<meta http-equiv="Content-Security-Policy" content="${SIGNER_META_CONTENT_SECURITY_POLICY}">`,
      );
      const loads = [
        ...page.matchAll(/<(?:script|link)\b[^>]*\s(?:src|href)=/gu),
      ];
      expect(loads.length).toBeGreaterThan(0);
      expect([...page.matchAll(/integrity="sha256-/gu)]).toHaveLength(
        loads.length,
      );
    },
  );
});

describe("the signing page in the release", () => {
  it("signs its script, adds its own policy, and puts its files under signer/", async () => {
    const files = await signerOutputFiles(distOf(SIGNER_FILES), "/");
    expect([...files.keys()].toSorted()).toEqual([
      "signer/assets/index-s.js",
      "signer/index.html",
    ]);
    const page = new TextDecoder().decode(files.get("signer/index.html"));
    expect(page).toContain(
      `src="/signer/assets/index-s.js" integrity="sha256-${await sha256(SIGNER_JS, "base64")}"`,
    );
    expect(page).toContain(
      `<head><meta http-equiv="Content-Security-Policy" content="${SIGNER_META_CONTENT_SECURITY_POLICY}">`,
    );
  });

  it("lists its files in the manifest and its headers under /signer/*", async () => {
    const bundle = await run(bundleOf(), both());
    const manifest = JSON.parse(sourceOf(bundle, MANIFEST_FILE)) as {
      files: Record<string, string>;
    };
    expect(manifest.files["signer/assets/index-s.js"]).toBe(
      await sha256(SIGNER_JS, "hex"),
    );
    expect(manifest.files["signer/index.html"]).toBe(
      await sha256(sourceOf(bundle, "signer/index.html"), "hex"),
    );
    const headers = JSON.parse(sourceOf(bundle, HEADERS_FILE)) as Record<
      string,
      unknown
    >;
    expect(headers[SIGNER_HEADERS_PATH]).toEqual(signerHeaders());
  });

  it("accepts the output as written, signer/index.html as the third HTML file", async () => {
    await expect(
      verified(() => {}, bundleOf(), both(), REQUIRED),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["an inline script", "<script>alert(1)</script>"],
    ["an inline style", "<style>body{}</style>"],
    ["an event handler", '<body onload="x()"></body>'],
    ["a remote script", '<script src="https://cdn.example/x.js"></script>'],
    ["a script outside signer/", '<script src="/assets/index-a.js"></script>'],
    ["a file the build lacks", '<script src="/signer/assets/x.js"></script>'],
  ])("refuses a signing page with %s", async (_, html) => {
    const dist = distOf({
      ...SIGNER_FILES,
      "index.html": SIGNER_PAGE.replace("</head>", `${html}</head>`),
    });
    await expect(signerOutputFiles(dist, "/")).rejects.toThrow(
      /signer release page .* refused/u,
    );
  });

  it("refuses a page that has its own Content-Security-Policy meta", async () => {
    const dist = distOf({
      ...SIGNER_FILES,
      "index.html": SIGNER_PAGE.replace(
        "<head>",
        '<head><meta http-equiv="Content-Security-Policy" content="default-src *">',
      ),
    });
    await expect(signerOutputFiles(dist, "/")).rejects.toThrow(
      /^The signing page already has a Content-Security-Policy/u,
    );
  });

  it.each([
    ["no build output", () => join(tmpdir(), "se-client-signer-missing")],
    ["no index.html", () => distOf({ "assets/index-s.js": SIGNER_JS })],
  ])("refuses a build with %s", async (_, dist) => {
    await expect(signerOutputFiles(dist(), "/")).rejects.toThrow(
      /^The signing page .* refused/u,
    );
  });

  it("refuses a symbolic link in the build output", async () => {
    const dist = distOf(SIGNER_FILES);
    symlinkSync(join(dist, "index.html"), join(dist, "link.js"));
    await expect(signerOutputFiles(dist, "/")).rejects.toThrow(
      /^The signing page build has link\.js, a symbolic link/u,
    );
  });

  it.each([
    [
      "a type not on the allow-list",
      "assets/logo.svg",
      /whose type is not on/u,
    ],
    ["a script its page does not load", "assets/lazy.js", /does not load/u],
    ["another HTML file", "other.html", /whose type is not on/u],
    ["a headers file of its own", "_headers", /whose type is not on/u],
    ["a worker of its own", "_worker.js", /does not load/u],
  ])("refuses a stray file: %s", async (_, name, message) => {
    await expect(
      verified(
        () => {},
        bundleOf(),
        both({ ...SIGNER_FILES, [name]: "x" }),
        REQUIRED,
      ),
    ).rejects.toThrow(message);
  });

  it("refuses a signer file changed after it was hashed", async () => {
    await expect(
      verified(
        files => {
          files.set("signer/assets/index-s.js", encoder.encode("x"));
        },
        bundleOf(),
        both(),
        REQUIRED,
      ),
    ).rejects.toThrow(/signer\/assets\/index-s\.js, which differs/u);
  });

  it("refuses a Wrapper page that loads a file of the signing page", async () => {
    await expect(
      verified(
        files => {
          const page = new TextDecoder().decode(files.get("index.html"));
          files.set(
            "index.html",
            encoder.encode(
              page.replace(
                "</head>",
                '<script type="module" src="/signer/assets/index-s.js" integrity="sha256-x"></script></head>',
              ),
            ),
          );
        },
        bundleOf(),
        both(),
        REQUIRED,
      ),
    ).rejects.toThrow(
      /a page that loads \/signer\/assets\/index-s\.js, inside \/signer\//u,
    );
  });

  it("refuses an output without the signing page when it is required", async () => {
    await expect(
      verified(
        () => {},
        bundleOf(),
        { verifyDist: distOf(VERIFY_FILES) },
        REQUIRED,
      ),
    ).rejects.toThrow(/has no signer\/index\.html/u);
  });

  it("refuses signer files without their page, even when not required", async () => {
    const files = writtenFiles(await run(bundleOf(), both()));
    files.delete("signer/index.html");
    const { verifyOutput } = await import("../release-output-check.ts");
    await expect(verifyOutput(files, "/")).rejects.toThrow(
      /has no signer\/index\.html/u,
    );
  });
});
