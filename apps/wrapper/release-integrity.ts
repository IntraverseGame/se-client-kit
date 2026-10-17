import { resolve } from "node:path";

import type { HtmlTagDescriptor, Plugin, Rolldown } from "vite";

import {
  attributesOf,
  base64,
  digest,
  HEADERS_FILE,
  hex,
  INLINE_HANDLER,
  MANIFEST_FILE,
  PAGE,
  STYLE_ATTRIBUTE,
  TAG,
} from "./release-files.ts";
import {
  META_CONTENT_SECURITY_POLICY,
  releaseHeaders,
} from "./release-headers.ts";
import { readTree, verifyOutput } from "./release-output-check.ts";

// The release bundle's integrity and its strict Content Security Policy
// (specs/client-kit.md, How the Wrapper reaches the SuperEngine origin, and
// specs/client-kit/supply-chain.md, Provenance):
//   - every `<script src>` and `<link href>` of the built page carries a
//     Subresource Integrity `integrity="sha256-..."` of the file it loads;
//   - the page has no inline script, no inline style or `style` attribute, no
//     event-handler attribute, and loads nothing from another origin, so the
//     policy needs no `unsafe-inline` and no `unsafe-eval`; a build that would
//     need one is refused (fail closed);
//   - the page carries the environment-independent part of the policy in a
//     `<meta>` element;
//   - `headers.json` holds the recommended response headers, and
//     `integrity-manifest.json` the SHA-256 of every other emitted file, from
//     which a deploy verifies the bundle;
//   - after the build has written everything, the output directory is read
//     back from disk (`verifyOutput`): its files must be exactly the
//     manifest's files plus the manifest, each with the hash the manifest
//     gives; `index.html` is the only HTML file; and every script and
//     stylesheet must be one the page names by a tag (so it carries SRI: a
//     dynamic `import()` chunk, which would load without it, is refused). A
//     file another step wrote (a `public/` directory, a later plugin) or
//     changed fails the build.

type OutputBundle = Rolldown.OutputBundle;

const encoder = new TextEncoder();

const bytesOf = (bundle: OutputBundle, file: string): Uint8Array => {
  const entry = bundle[file];
  if (entry === undefined) {
    throw new Error(`The release integrity step cannot find ${file}.`);
  }
  if (entry.type === "chunk") {
    return encoder.encode(entry.code);
  }
  return typeof entry.source === "string"
    ? encoder.encode(entry.source)
    : entry.source;
};

/**
 * The manifest: the SHA-256 of every emitted file but the manifest itself, by
 * path, plus `extra` files not in the bundle yet (an asset emitted in the same
 * hook is not visible in it).
 */
const manifestOf = async (
  bundle: OutputBundle,
  extra: Readonly<Record<string, string>> = {},
): Promise<string> => {
  const sources = new Map<string, Uint8Array>();
  for (const file of Object.keys(bundle)) {
    if (file !== MANIFEST_FILE) sources.set(file, bytesOf(bundle, file));
  }
  for (const [file, text] of Object.entries(extra)) {
    sources.set(file, encoder.encode(text));
  }
  const files = await Promise.all(
    [...sources.keys()]
      .toSorted()
      .map(
        async file =>
          [
            file,
            hex(await digest(sources.get(file) ?? new Uint8Array())),
          ] as const,
      ),
  );
  return `${JSON.stringify(
    { algorithm: "sha256", files: Object.fromEntries(files) },
    undefined,
    2,
  )}\n`;
};

const refuse = (what: string): never => {
  throw new Error(
    `The Wrapper's release page ${what}, which its strict Content Security Policy forbids; the build is refused.`,
  );
};

/** The bundle file a same-origin reference names, or a refusal. */
const fileOf = (
  reference: string,
  base: string,
  bundle: OutputBundle,
): string => {
  if (!reference.startsWith(base) || reference.startsWith("//")) {
    return refuse(`loads ${reference} from outside the bundle`);
  }
  const file = reference.slice(base.length);
  if (bundle[file] === undefined) {
    return refuse(`references ${reference}, which is not an emitted file`);
  }
  return file;
};

/** The page with an `integrity` attribute on every script and link. */
const withIntegrity = async (
  html: string,
  base: string,
  bundle: OutputBundle,
): Promise<string> => {
  if (INLINE_HANDLER.test(html)) refuse("has an event-handler attribute");
  if (STYLE_ATTRIBUTE.test(html)) refuse("has a style attribute");
  const tags = [...html.matchAll(TAG)];
  const replacements = await Promise.all(
    tags.map(async match => {
      const [whole, rawName = "", rawAttributes = ""] = match;
      const name = rawName.toLowerCase();
      if (name === "style") refuse("has an inline <style>");
      const attributes = attributesOf(rawAttributes);
      const reference =
        name === "script" ? attributes.get("src") : attributes.get("href");
      if (reference === undefined) {
        return name === "script" ? refuse("has an inline <script>") : whole;
      }
      if (attributes.has("integrity")) {
        return refuse("already has an integrity attribute");
      }
      const file = fileOf(reference, base, bundle);
      const integrity = `sha256-${base64(await digest(bytesOf(bundle, file)))}`;
      return whole.replace(/\s*\/?>$/u, ` integrity="${integrity}">`);
    }),
  );
  let index = 0;
  return html.replace(TAG, () => {
    const replacement = replacements[index];
    index += 1;
    return replacement ?? "";
  });
};

export const releaseIntegrity = (): Plugin => {
  let base = "/";
  let outDir = "";
  return {
    name: "se-client-release-integrity",
    apply: "build",
    configResolved: config => {
      base = config.base;
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      order: "post",
      handler: (): HtmlTagDescriptor[] => [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content: META_CONTENT_SECURITY_POLICY,
          },
          injectTo: "head-prepend",
        },
      ],
    },
    generateBundle: {
      order: "post",
      async handler(_options, bundle) {
        const page = bundle[PAGE];
        if (page?.type !== "asset" || typeof page.source !== "string") {
          throw new Error(
            `The release integrity step found no ${PAGE} to sign; the build is refused.`,
          );
        }
        page.source = await withIntegrity(page.source, base, bundle);
        const headers = `${JSON.stringify(releaseHeaders(), undefined, 2)}\n`;
        this.emitFile({
          type: "asset",
          fileName: HEADERS_FILE,
          source: headers,
        });
        const manifest = await manifestOf(bundle, { [HEADERS_FILE]: headers });
        this.emitFile({
          type: "asset",
          fileName: MANIFEST_FILE,
          source: manifest,
        });
      },
    },
    // After every write (the bundle, and anything copied beside it), the
    // directory on disk is what is checked.
    closeBundle: {
      order: "post",
      handler: async () => {
        await verifyOutput(await readTree(outDir), base);
      },
    },
  };
};
