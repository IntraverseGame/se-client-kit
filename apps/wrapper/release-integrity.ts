import { resolve } from "node:path";

import type { HtmlTagDescriptor, Plugin, Rolldown } from "vite";

import {
  HEADERS_FILE,
  hex,
  digest,
  MANIFEST_FILE,
  PAGE,
} from "./release-files.ts";
import {
  headersFile,
  META_CONTENT_SECURITY_POLICY,
} from "./release-headers.ts";
import { readTree, verifyOutput } from "./release-output-check.ts";
import { withIntegrity } from "./release-sri.ts";
import { verifyOutputFiles } from "./release-verify.ts";

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
//     changed fails the build;
//   - the verify page (apps/verify, specs/verify-page.md V-16) is read from its
//     own build and put into the output under `verify/` with the same rules:
//     its own `<meta>` policy, SRI, its files in the manifest, and
//     `verify/index.html` as the second allowed HTML file. `headers.json`
//     holds its policy under `/verify/*` (release-verify.ts).

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
  extra: ReadonlyMap<string, Uint8Array> = new Map(),
): Promise<string> => {
  const sources = new Map<string, Uint8Array>();
  for (const file of Object.keys(bundle)) {
    if (file !== MANIFEST_FILE) sources.set(file, bytesOf(bundle, file));
  }
  for (const [file, bytes] of extra) sources.set(file, bytes);
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

export type ReleaseIntegrityOptions = {
  /**
   * The verify app's build output, put into the release under `verify/`
   * (release-verify.ts). A release build always sets it; without it (the
   * component tests of this step) there is no verify page.
   */
  readonly verifyDist?: string;
};

export const releaseIntegrity = (
  options: ReleaseIntegrityOptions = {},
): Plugin => {
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
        page.source = await withIntegrity(
          "Wrapper's",
          page.source,
          base,
          file =>
            bundle[file] === undefined ? undefined : bytesOf(bundle, file),
        );
        const extra = new Map<string, Uint8Array>();
        if (options.verifyDist !== undefined) {
          for (const [file, source] of await verifyOutputFiles(
            options.verifyDist,
            base,
          )) {
            extra.set(file, source);
            this.emitFile({ type: "asset", fileName: file, source });
          }
        }
        const headers = `${JSON.stringify(headersFile(), undefined, 2)}\n`;
        extra.set(HEADERS_FILE, encoder.encode(headers));
        this.emitFile({
          type: "asset",
          fileName: HEADERS_FILE,
          source: headers,
        });
        const manifest = await manifestOf(bundle, extra);
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
        await verifyOutput(await readTree(outDir), base, {
          requireVerify: options.verifyDist !== undefined,
        });
      },
    },
  };
};
