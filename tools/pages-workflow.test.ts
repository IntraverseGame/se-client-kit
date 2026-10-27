import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  blockEnd,
  jobNames,
  jobRange,
  keyLine,
  keyLines,
  type Line,
  mappingAt,
  readLines,
  scalarAt,
  stepNamed,
  stepRanges,
} from "./workflow-text.ts";

// The Pages workflow (.github/workflows/pages.yml; ADR-008; runbook, Deploy to
// Cloudflare Pages), read with the block-style reader of
// tools/workflow-text.ts: its gates, permissions, environment, and pins, which
// secrets reach which step, and that the deploy job runs no repository
// script. The headers step's own script runs in tools/pages-headers.test.ts.

const pages: Line[] = readLines(
  readFileSync(
    join(import.meta.dirname, "..", ".github", "workflows", "pages.yml"),
    "utf8",
  ),
);

/** Every value of key `key` in `lines`, at any indentation, in file order. */
const valuesOf = (lines: readonly Line[], key: string): string[] =>
  lines.flatMap((line, index) =>
    line.text === `${key}:` || line.text.startsWith(`${key}: `)
      ? [scalarAt(lines, index)]
      : [],
  );

const jobKey = (job: string, key: string): number => {
  const [start, end] = jobRange(pages, job);
  return keyLine(pages, start, end, 4, key);
};

/** The `run:` scripts of job `job`, in order. */
const runsOf = (job: string): string[] =>
  stepRanges(pages, jobRange(pages, job)).flatMap(([from, to]) =>
    keyLines(pages, from, to, 8, "run").map(index => scalarAt(pages, index)),
  );

/** The `env:` entries of step `name` of job `job`. */
const stepEnv = (job: string, name: string): string[] => {
  const [from, to] = stepNamed(pages, jobRange(pages, job), name);
  return mappingAt(pages, keyLine(pages, from, to, 8, "env"));
};

// Every push to main deploys staging, with no repository-variable switch
// (the human, 2026-10-27; ADR-008).
const GATE = "github.ref == 'refs/heads/main'";

/** The lines at `indent` inside the block of line `index`, comments left out. */
const keysIn = (index: number, indent: number): string[] =>
  pages
    .slice(index + 1, blockEnd(pages, index))
    .filter(line => line.indent === indent && !line.text.startsWith("#"))
    .map(line => line.text);

/** The one `run:` script of job `job` that contains `text`. */
const runWith = (job: string, text: string): string => {
  const found = runsOf(job).filter(script => script.includes(text));
  const [script] = found;
  if (found.length !== 1 || script === undefined) {
    throw new Error(`expected one run: with ${text} in ${job}`);
  }
  return script;
};

describe("the Pages workflow", () => {
  it("has exactly the jobs build, config-stage, and deploy-stage, deploy last", () => {
    expect(jobNames(pages)).toEqual(["build", "config-stage", "deploy-stage"]);
    expect(scalarAt(pages, jobKey("deploy-stage", "needs"))).toBe(
      "[build, config-stage]",
    );
  });

  it("runs on every push to main, and by hand", () => {
    const on = keyLine(pages, 0, pages.length, 0, "on");
    expect(keysIn(on, 2)).toEqual(["push:", "workflow_dispatch:"]);
    const push = keyLine(pages, on, blockEnd(pages, on), 2, "push");
    expect(keysIn(push, 4)).toEqual(["branches: [main]"]);
  });

  it("runs every job only from main, with no other condition", () => {
    expect(valuesOf(pages, "if")).toEqual([GATE, GATE, GATE]);
  });

  it("never continues on an error and never cancels a deploy", () => {
    expect(valuesOf(pages, "continue-on-error")).toEqual([]);
    expect(valuesOf(pages, "cancel-in-progress")).toEqual(["false"]);
  });

  it("gives each job contents: read only, and no token at the top", () => {
    expect(
      scalarAt(pages, keyLine(pages, 0, pages.length, 0, "permissions")),
    ).toBe("{}");
    for (const job of ["build", "config-stage", "deploy-stage"]) {
      expect(mappingAt(pages, jobKey(job, "permissions"))).toEqual([
        "contents: read",
      ]);
    }
  });

  it("names the pages-stage environment in the config and deploy jobs only", () => {
    expect(valuesOf(pages, "environment")).toEqual([
      "pages-stage",
      "pages-stage",
    ]);
    expect(scalarAt(pages, jobKey("config-stage", "environment"))).toBe(
      "pages-stage",
    );
    expect(scalarAt(pages, jobKey("deploy-stage", "environment"))).toBe(
      "pages-stage",
    );
  });

  it("deploys to the two staging projects by their public names", () => {
    expect(mappingAt(pages, jobKey("deploy-stage", "env"))).toEqual([
      "WRAPPER_PROJECT: se-wrapper-stage",
      "VERIFIER_PROJECT: se-verifier-stage",
    ]);
  });

  it("checks out without persisted credentials, and sets up without a cache", () => {
    expect(valuesOf(pages, "persist-credentials")).toEqual([
      "false",
      "false",
      "false",
    ]);
    expect(valuesOf(pages, "cache")).toEqual(['"false"', '"false"', '"false"']);
  });

  it("pins every Action by full commit SHA or uses a local one", () => {
    const uses = valuesOf(pages, "uses");
    for (const value of uses) {
      expect(value).toMatch(/^(?:\.\/|[^@\s]+@[0-9a-f]{40}$)/u);
    }
    expect(uses).toContain(
      "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9",
    );
    expect(uses).toContain(
      "actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333",
    );
  });

  it("puts no ${{ expression inside any run: script", () => {
    for (const script of valuesOf(pages, "run")) {
      expect(script).not.toContain("${{");
    }
  });

  it("references no secret in the build job, the token in two deploy steps", () => {
    const [buildStart, buildEnd] = jobRange(pages, "build");
    expect(
      pages
        .slice(buildStart, buildEnd)
        .filter(line => /\b(?:secrets|vars\.CLOUDFLARE)/u.test(line.text)),
    ).toEqual([]);
    const token = "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}";
    const account =
      "CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}";
    for (const step of ["Require the Pages settings", "Deploy to Pages"]) {
      expect(stepEnv("deploy-stage", step)).toEqual(
        expect.arrayContaining([token, account]),
      );
    }
    expect(
      pages.filter(line => line.text.includes("secrets.CLOUDFLARE_API_TOKEN")),
    ).toHaveLength(2);
    expect(
      pages.filter(line => line.text.includes("secrets.CLOUDFLARE_ACCOUNT_ID")),
    ).toHaveLength(2);
    expect(pages.filter(line => line.text.includes("vars.CLOUDFLARE"))).toEqual(
      [],
    );
  });

  it("gives the config job its configuration values and never the token", () => {
    const [start, end] = jobRange(pages, "config-stage");
    const job = pages.slice(start, end).map(line => line.text);
    expect(job.filter(text => text.includes("CLOUDFLARE"))).toEqual([]);
    expect(
      stepEnv("config-stage", "Build and validate the configuration documents"),
    ).toEqual([
      "PAGES_WRAPPER_ORIGIN: ${{ secrets.PAGES_WRAPPER_ORIGIN }}",
      "PAGES_VERIFIER_ORIGIN: ${{ secrets.PAGES_VERIFIER_ORIGIN }}",
      "PAGES_CHAIN_PINS: ${{ secrets.PAGES_CHAIN_PINS }}",
      "PAGES_RPC_ENDPOINTS: ${{ secrets.PAGES_RPC_ENDPOINTS }}",
      "PAGES_RPC_ORIGINS: ${{ secrets.PAGES_RPC_ORIGINS }}",
      "PAGES_GAME_ORIGINS: ${{ secrets.PAGES_GAME_ORIGINS }}",
      "PAGES_OPERATOR_ORIGINS: ${{ secrets.PAGES_OPERATOR_ORIGINS }}",
    ]);
    expect(runWith("config-stage", "pages-config-cli.ts")).toContain(
      "pnpm exec tsx apps/wrapper/pages-config-cli.ts",
    );
  });

  it("reads every pages-stage value as a secret, and no variable at all", () => {
    expect(pages.filter(line => /\bvars\./u.test(line.text))).toEqual([]);
  });

  it("never names the proxy's upstream in CI", () => {
    expect(
      pages.filter(line => line.text.includes("SE_API_UPSTREAM_ORIGIN")),
    ).toHaveLength(1);
    expect(
      pages.find(line => line.text.includes("SE_API_UPSTREAM_ORIGIN"))?.text,
    ).toMatch(/^#/u);
  });

  it("runs no repository script in the deploy job", () => {
    for (const script of runsOf("deploy-stage")) {
      expect(script).not.toMatch(/\b(?:pnpm|npm|npx|tsx|tsc|wireit|node)\b/u);
      expect(script).not.toContain("tools/");
    }
    expect(runWith("deploy-stage", "node_modules/.bin/wrangler")).toBeTruthy();
  });

  it("builds the proxy worker with tsc alone in the build job", () => {
    const build = runWith("build", "apps/pages-proxy");
    expect(build).toContain(
      "pnpm exec tsc -p apps/pages-proxy/tsconfig.build.json",
    );
    expect(build).toContain("--sourceMap false");
    expect(build).toContain("worker-digest=");
  });

  it("checks every download against its job's digest", () => {
    const unpack = runWith("deploy-stage", "tar -x");
    expect(unpack).toContain('"$actual" != "$WRAPPER_DIGEST"');
    expect(unpack).toContain('"_worker.js:$WORKER_DIGEST"');
    expect(unpack).toContain(
      '"wrapper-environment-config.json:$WRAPPER_CONFIG_DIGEST"',
    );
    expect(unpack).toContain(
      '"verifier-environment-config.json:$VERIFIER_CONFIG_DIGEST"',
    );
  });

  it("puts each site's own configuration document next to its page", () => {
    const unpack = runWith("deploy-stage", "tar -x");
    expect(unpack).toContain(
      'cp "$download/wrapper-environment-config.json" "$wrapper/environment-config.json"',
    );
    expect(unpack).toContain(
      'cp "$download/verifier-environment-config.json" "$verifier/environment-config.json"',
    );
  });

  it("serves the verify page at the root of the verifier's site", () => {
    const unpack = runWith("deploy-stage", "tar -x");
    expect(unpack).toContain('cp -R "$wrapper/verify" "$verifier/verify"');
    expect(unpack).toContain(
      'cp "$wrapper/verify/index.html" "$verifier/index.html"',
    );
  });

  it("routes only each site's API paths to the proxy", () => {
    const unpack = runWith("deploy-stage", "tar -x");
    expect(unpack).toContain(
      `'{"version":1,"include":["/play/v1/*","/verify/v1/*"],"exclude":[]}'`,
    );
    expect(unpack).toContain(
      `'{"version":1,"include":["/verify/v1/*"],"exclude":[]}'`,
    );
    expect(unpack).toContain('cp "$worker" "$site/_worker.js"');
  });

  it("deploys each site from main, unbundled, with metrics off", () => {
    expect(stepEnv("deploy-stage", "Deploy to Pages")).toContain(
      'WRANGLER_SEND_METRICS: "false"',
    );
    const deploy = runWith("deploy-stage", "wrangler");
    expect(deploy).toContain('pages deploy "$site"');
    expect(deploy).toContain('--project-name "$project"');
    expect(deploy).toContain("--no-bundle");
    expect(deploy).toContain("--branch main");
    expect(deploy).toContain('cd "$workdir"');
  });

  it("leaves no hosting TODO behind", () => {
    expect(pages.filter(line => line.text.includes("TODO"))).toEqual([]);
  });
});
