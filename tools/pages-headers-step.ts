// Runs the Pages workflow's headers step (.github/workflows/pages.yml, "Write
// the Pages headers files") for the tests: its own script, read from the
// workflow, with bash and jq against temporary site directories (the
// Wrapper's, the verifier's, and the game's). Used by
// tools/pages-headers.test.ts and tools/pages-game-site.test.ts.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  jobRange,
  keyLine,
  readLines,
  scalarAt,
  stepNamed,
} from "./workflow-text.ts";

const pages = readLines(
  readFileSync(
    join(import.meta.dirname, "..", ".github", "workflows", "pages.yml"),
    "utf8",
  ),
);
const [from, to] = stepNamed(
  pages,
  jobRange(pages, "deploy-stage"),
  "Write the Pages headers files",
);
const script = scalarAt(pages, keyLine(pages, from, to, 8, "run"));

/** The Wrapper's origin the step's default document names. */
export const WRAPPER_ORIGIN = "https://wrapper.example";

/** What the Wrapper site's configuration document holds for the headers. */
export type Origins = {
  /** The RPC endpoints' URLs (one source). */
  readonly rpc?: readonly string[];
  readonly game?: readonly string[];
  readonly operator?: readonly string[];
  /** The document's `playApiBaseUrl`; `null` leaves it out. */
  readonly playApiBaseUrl?: string | null;
};

export type Site = "wrapper" | "verifier" | "game";

export type Result = {
  readonly status: number | null;
  readonly output: string;
} & Readonly<Record<Site, string | null>>;

export type HeadersStep = {
  /** Runs the step on new sites from `headers` and `origins`. */
  readonly run: (
    headers: unknown,
    origins?: Origins,
    options?: { readonly existing?: Site | undefined },
  ) => Result;
  /** Runs the step on `sites` as they are; returns its status and output. */
  readonly runOn: (sites: string) => Pick<Result, "status" | "output">;
  /** A new, empty directory, removed by `cleanup`. */
  readonly directory: () => string;
  /** Removes every directory made so far. */
  readonly cleanup: () => void;
};

const read = (path: string): string | null =>
  existsSync(path) ? readFileSync(path, "utf8") : null;

const runOn = (sites: string): Pick<Result, "status" | "output"> => {
  const result = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: { PATH: process.env["PATH"], LC_ALL: "C", SITES: sites },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

/** The configuration document's fields the step reads. */
const documentOf = (origins: Origins): Record<string, unknown> => {
  const playApiBaseUrl =
    origins.playApiBaseUrl === undefined
      ? `${WRAPPER_ORIGIN}/play/v1`
      : origins.playApiBaseUrl;
  return {
    rpcEndpoints: {
      base: (origins.rpc ?? []).map((url, index) => ({
        provider: `p${String(index)}`,
        url,
      })),
    },
    gameOrigins: origins.game ?? [],
    operatorOrigins: origins.operator ?? [],
    ...(playApiBaseUrl === null ? {} : { playApiBaseUrl }),
  };
};

export const headersStep = (): HeadersStep => {
  const directories: string[] = [];
  const directory = (): string => {
    const made = mkdtempSync(join(tmpdir(), "pages-headers-"));
    directories.push(made);
    return made;
  };
  const run: HeadersStep["run"] = (headers, origins = {}, options = {}) => {
    const sites = directory();
    for (const site of ["wrapper", "verifier", "game"] as const) {
      mkdirSync(join(sites, site));
    }
    writeFileSync(
      join(sites, "wrapper", "headers.json"),
      JSON.stringify(headers),
    );
    writeFileSync(
      join(sites, "wrapper", "environment-config.json"),
      JSON.stringify(documentOf(origins)),
    );
    if (options.existing !== undefined) {
      writeFileSync(join(sites, options.existing, "_headers"), "kept\n");
    }
    return {
      ...runOn(sites),
      wrapper: read(join(sites, "wrapper", "_headers")),
      verifier: read(join(sites, "verifier", "_headers")),
      game: read(join(sites, "game", "_headers")),
    };
  };
  const cleanup = (): void => {
    for (const made of directories.splice(0)) {
      rmSync(made, { recursive: true, force: true });
    }
  };
  return { run, runOn, directory, cleanup };
};
