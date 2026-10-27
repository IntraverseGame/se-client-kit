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

import { afterEach, describe, expect, it } from "vitest";

import {
  jobRange,
  keyLine,
  readLines,
  scalarAt,
  stepNamed,
} from "./workflow-text.ts";

// The Pages workflow's headers step (.github/workflows/pages.yml, "Write the
// Pages headers files"; ADR-008, decision 3): its own script, read from the
// workflow, runs here with bash and jq against temporary site directories,
// first from the Wrapper's built `headers.json`. It writes the
// Wrapper's site's `_headers` and the verifier's site's.

type Headers = Readonly<Record<string, string>>;

// The Wrapper's real headers file, from its build output (`test:tools`
// depends on the Wrapper's build).
const REAL = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "apps", "wrapper", "dist", "headers.json"),
    "utf8",
  ),
) as Readonly<Record<string, Headers>>;

const ruleOf = (pattern: string): Headers => {
  const rule = REAL[pattern];
  if (rule === undefined) throw new Error(`headers.json has no ${pattern}`);
  return rule;
};

const wrapper = ruleOf("/*");
const verify = ruleOf("/verify/*");

const pages = readLines(
  readFileSync(
    join(import.meta.dirname, "..", ".github", "workflows", "pages.yml"),
    "utf8",
  ),
);

const read = (path: string): string | null =>
  existsSync(path) ? readFileSync(path, "utf8") : null;

describe("the Pages headers step", () => {
  const [from, to] = stepNamed(
    pages,
    jobRange(pages, "deploy-stage"),
    "Write the Pages headers files",
  );
  const script = scalarAt(pages, keyLine(pages, from, to, 8, "run"));

  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  /** What the Wrapper site's configuration document holds for the CSP. */
  type Origins = {
    /** The RPC endpoints' URLs (one source). */
    readonly rpc?: readonly string[];
    readonly game?: readonly string[];
    readonly operator?: readonly string[];
  };

  type Result = {
    readonly status: number | null;
    readonly output: string;
    readonly wrapper: string | null;
    readonly verifier: string | null;
  };

  const run = (
    headers: unknown,
    origins: Origins = {},
    { existing = false }: { readonly existing?: boolean } = {},
  ): Result => {
    const sites = mkdtempSync(join(tmpdir(), "pages-headers-"));
    directories.push(sites);
    mkdirSync(join(sites, "wrapper"));
    mkdirSync(join(sites, "verifier"));
    writeFileSync(
      join(sites, "wrapper", "headers.json"),
      JSON.stringify(headers),
    );
    writeFileSync(
      join(sites, "wrapper", "environment-config.json"),
      JSON.stringify({
        rpcEndpoints: {
          base: (origins.rpc ?? []).map((url, index) => ({
            provider: `p${String(index)}`,
            url,
          })),
        },
        gameOrigins: origins.game ?? [],
        operatorOrigins: origins.operator ?? [],
      }),
    );
    if (existing) writeFileSync(join(sites, "verifier", "_headers"), "kept\n");
    const result = spawnSync("bash", ["-c", script], {
      encoding: "utf8",
      env: { PATH: process.env["PATH"], LC_ALL: "C", SITES: sites },
    });
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
      wrapper: read(join(sites, "wrapper", "_headers")),
      verifier: read(join(sites, "verifier", "_headers")),
    };
  };

  const RPC_INPUT = [
    "https://rpc-b.example/base",
    "https://rpc-a.example:8545/",
    "https://rpc-b.example/other?key=x",
  ];
  const RPC = "https://rpc-a.example:8545 https://rpc-b.example";

  const verifyLines = (): string[] =>
    Object.entries(verify).map(
      ([name, value]) =>
        `  ${name}: ${value.replace("{{verifyConnectOrigins}}", RPC)}`,
    );

  it("writes the Wrapper's rule, then the verify page's replacing it", () => {
    const result = run(REAL, {
      rpc: RPC_INPUT,
      game: ["https://game.example"],
      operator: [],
    });
    expect(result.status).toBe(0);
    expect(result.wrapper).toBe(
      [
        "/*",
        ...Object.entries(wrapper).map(
          ([name, value]) =>
            `  ${name}: ${value
              .replace("{{connectOrigins}}", RPC)
              .replace("{{gameOrigins}}", "https://game.example")
              .replace("{{operatorOrigins}}", "'none'")}`,
        ),
        "/verify/*",
        ...Object.keys(wrapper)
          .toSorted()
          .map(name => `  ! ${name}`),
        ...verifyLines(),
        "",
      ].join("\n"),
    );
    expect(result.wrapper).toContain("frame-ancestors 'none'");
  });

  it("accepts the staging placeholder https://invalid.example in every list", () => {
    const placeholder = "https://invalid.example";
    const result = run(REAL, {
      rpc: [placeholder],
      game: [placeholder],
      operator: [placeholder],
    });
    expect(result.status).toBe(0);
    expect(result.wrapper).toContain(`connect-src 'self' ${placeholder}`);
    expect(result.wrapper).toContain(`frame-src ${placeholder}`);
    expect(result.wrapper).toContain(`frame-ancestors ${placeholder}`);
    expect(result.verifier).toContain(`connect-src 'self' ${placeholder}`);
  });

  it("gives the verifier's site the verify page's headers on every path", () => {
    const result = run(REAL, { rpc: RPC_INPUT });
    expect(result.status).toBe(0);
    expect(result.verifier).toBe(["/*", ...verifyLines(), ""].join("\n"));
    expect(result.verifier).toContain("frame-ancestors 'none'");
    expect(result.verifier).not.toContain("{{");
  });

  it("leaves connect-src 'self' alone, and makes an empty frame list 'none'", () => {
    const result = run({
      "/*": {
        "Content-Security-Policy":
          "connect-src 'self' {{connectOrigins}}; frame-src {{gameOrigins}}; frame-ancestors {{operatorOrigins}}",
      },
      "/verify/*": {
        "Content-Security-Policy":
          "connect-src 'self' {{verifyConnectOrigins}}",
      },
    });
    expect(result.status).toBe(0);
    expect(result.wrapper).toBe(
      [
        "/*",
        "  Content-Security-Policy: connect-src 'self'; frame-src 'none'; frame-ancestors 'none'",
        "/verify/*",
        "  ! Content-Security-Policy",
        "  Content-Security-Policy: connect-src 'self'",
        "",
      ].join("\n"),
    );
  });

  it.each([
    ["plain http", "http://rpc.example/base"],
    ["a wildcard", "https://*.example/base"],
    ["a directive", "https://rpc.example;script-src/base"],
    ["upper case", "https://RPC.example/base"],
  ])("refuses an RPC endpoint with %s, without printing it", (_, url) => {
    const result = run(REAL, { rpc: [url] });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(
      "rpcEndpoints holds an entry that is not an https origin.",
    );
    expect(result.output).not.toContain(url);
    expect(result.wrapper).toBeNull();
    expect(result.verifier).toBeNull();
  });

  it.each([
    ["a path", "https://game.example/v1"],
    ["a trailing slash", "https://game.example/"],
    ["plain http", "http://game.example"],
  ])("refuses a game origin with %s, without printing it", (_, origin) => {
    const result = run(REAL, { game: [origin] });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(
      "gameOrigins holds an entry that is not an https origin.",
    );
    expect(result.output).not.toContain(origin);
  });

  it("refuses a site without its configuration document", () => {
    const sites = mkdtempSync(join(tmpdir(), "pages-headers-"));
    directories.push(sites);
    mkdirSync(join(sites, "wrapper"));
    writeFileSync(join(sites, "wrapper", "headers.json"), JSON.stringify(REAL));
    const result = spawnSync("bash", ["-c", script], {
      encoding: "utf8",
      env: { PATH: process.env["PATH"], LC_ALL: "C", SITES: sites },
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      "has no environment-config.json",
    );
  });

  it("refuses a placeholder it does not fill", () => {
    const result = run({
      "/*": { "X-Test": "{{somethingNew}}" },
      "/verify/*": {},
    });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("a placeholder this step does not fill");
  });

  it("refuses a value Pages would read as another line", () => {
    const result = run({ "/*": { "X-Test": "one\n/evil/*" }, "/verify/*": {} });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("not path patterns of one-line string");
  });

  it("refuses a headers.json without a /verify/* rule", () => {
    const result = run({ "/*": {} });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("with a /verify/* rule");
  });

  it("refuses a line over the Pages limit", () => {
    const result = run({
      "/*": { "X-Test": "a".repeat(2000) },
      "/verify/*": {},
    });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("over the Pages limit");
  });

  it("refuses a site that already has a _headers file", () => {
    const result = run(REAL, {}, { existing: true });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("already has a _headers file");
    expect(result.verifier).toBe("kept\n");
  });
});
