import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { headersStep } from "./pages-headers-step.ts";

// The Pages workflow's headers step (.github/workflows/pages.yml, "Write the
// Pages headers files"; ADR-008, decision 3): its own script, read from the
// workflow, runs here with bash and jq against temporary site directories
// (tools/pages-headers-step.ts), first from the Wrapper's built
// `headers.json`. It writes the Wrapper's site's `_headers` and the
// verifier's site's; the game's site's is tools/pages-game-site.test.ts.

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

describe("the Pages headers step", () => {
  const step = headersStep();
  const { run } = step;
  afterEach(step.cleanup);

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

  it("writes no game headers, and the same Wrapper and verifier headers, with no game site", () => {
    const withGame = run(REAL, { rpc: RPC_INPUT });
    const without = run(REAL, { rpc: RPC_INPUT }, { game: false });
    expect(without.status).toBe(0);
    expect(without.game).toBeNull();
    expect(without.wrapper).toBe(withGame.wrapper);
    expect(without.verifier).toBe(withGame.verifier);
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
        // The game's site takes it (tools/pages-game-site.test.ts).
        "Permissions-Policy": "camera=()",
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
        "  Permissions-Policy: camera=()",
        "/verify/*",
        "  ! Content-Security-Policy",
        "  ! Permissions-Policy",
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
    const sites = step.directory();
    mkdirSync(join(sites, "wrapper"));
    writeFileSync(join(sites, "wrapper", "headers.json"), JSON.stringify(REAL));
    const result = step.runOn(sites);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("has no environment-config.json");
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

  it.each(["verifier", "game"] as const)(
    "refuses a site that already has a _headers file (%s)",
    existing => {
      const result = run(REAL, {}, { existing });
      expect(result.status).not.toBe(0);
      expect(result.output).toContain("already has a _headers file");
      expect(result[existing]).toBe("kept\n");
    },
  );
});
