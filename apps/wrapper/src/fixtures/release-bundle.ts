// Test-only: a fake bundle for the release integrity step, its hooks run as
// the bundler would, and the output directory it would write.

import { releaseIntegrity } from "../../release-integrity.ts";
import { verifyOutput } from "../../release-output-check.ts";

export const sha256 = async (
  text: string,
  encoding: "hex" | "base64",
): Promise<string> => {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
  return encoding === "hex"
    ? [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("")
    : btoa(String.fromCodePoint(...bytes));
};

export type Asset = {
  type: "asset";
  fileName: string;
  source: string | Uint8Array;
};
export type Chunk = { type: "chunk"; fileName: string; code: string };
export type Bundle = Record<string, Asset | Chunk>;

export const PAGE = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-a.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-b.css">
</head><body><div id="app"></div></body></html>`;

export const JS = "console.log(1);";
export const CSS = "body{margin:0}";

export const bundleOf = (page = PAGE): Bundle => ({
  "index.html": { type: "asset", fileName: "index.html", source: page },
  "assets/index-a.js": {
    type: "chunk",
    fileName: "assets/index-a.js",
    code: JS,
  },
  "assets/index-b.css": {
    type: "asset",
    fileName: "assets/index-b.css",
    source: CSS,
  },
});

type Hook = {
  handler: (this: unknown, options: unknown, bundle: Bundle) => Promise<void>;
};

/** Runs the plugin's `generateBundle` over a bundle, as the bundler would. */
export const run = async (bundle: Bundle): Promise<Bundle> => {
  const plugin = releaseIntegrity() as unknown as {
    configResolved: (config: unknown) => void;
    generateBundle: Hook;
  };
  plugin.configResolved({ base: "/", root: "/", build: { outDir: "dist" } });
  const emitted: Asset[] = [];
  await plugin.generateBundle.handler.call(
    {
      emitFile: (file: Omit<Asset, "type">) =>
        emitted.push({ ...file, type: "asset" }),
    },
    {},
    bundle,
  );
  for (const file of emitted) bundle[file.fileName] = file;
  return bundle;
};

export const encoder = new TextEncoder();

/** The output directory as the bundle would write it, by relative path. */
export const writtenFiles = (bundle: Bundle): Map<string, Uint8Array> =>
  new Map(
    Object.entries(bundle).map(([file, entry]) => [
      file,
      encoder.encode(
        entry.type === "chunk" ? entry.code : String(entry.source),
      ),
    ]),
  );

/** Builds a bundle, writes it, then lets `change` alter the output. */
export const verified = async (
  change: (files: Map<string, Uint8Array>) => void = () => {},
  bundle: Bundle = bundleOf(),
): Promise<void> => {
  const files = writtenFiles(await run(bundle));
  change(files);
  await verifyOutput(files, "/");
};

export const sourceOf = (bundle: Bundle, file: string): string => {
  const entry = bundle[file];
  return entry?.type === "asset" ? String(entry.source) : (entry?.code ?? "");
};
