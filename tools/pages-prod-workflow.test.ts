import { describe, expect, it } from "vitest";

import {
  CHECKOUT,
  DOWNLOAD,
  jobKey,
  jobKeys,
  prod,
  runsOf,
  SETUP,
  stepEnv,
  stepRun,
  UPLOAD,
  usesOf,
  valuesOf,
  workflow,
} from "./release-workflow-lines.ts";
import {
  blockEnd,
  jobNames,
  keyLine,
  type Line,
  mappingAt,
  scalarAt,
} from "./workflow-text.ts";

// The production deploy (.github/workflows/pages-prod.yml; ADR-009, decision
// 3; runbook, Deploy to Cloudflare Pages): its two entry points, jobs,
// permissions, environments, and concurrency; that its deploy job runs no
// repository script and shares staging's headers and worker scripts. Its
// scripts run in tools/pages-prod-scripts.test.ts.

const staging = workflow("pages.yml");

const JOBS = [
  "release-check",
  "prod-verify",
  "prod-worker",
  "config-prod",
  "deploy-prod",
];

const keysIn = (lines: readonly Line[], index: number, indent: number) =>
  lines
    .slice(index + 1, blockEnd(lines, index))
    .filter(line => line.indent === indent && !line.text.startsWith("#"))
    .map(line => line.text);

describe("the production deploy workflow", () => {
  it("is called by the release workflow or dispatched by hand, with a tag", () => {
    const on = keyLine(prod, 0, prod.length, 0, "on");
    expect(keysIn(prod, on, 2)).toEqual([
      "workflow_call:",
      "workflow_dispatch:",
    ]);
    for (const trigger of ["workflow_call", "workflow_dispatch"]) {
      const at = keyLine(prod, on, blockEnd(prod, on), 2, trigger);
      const inputs = keyLine(prod, at, blockEnd(prod, at), 4, "inputs");
      expect(keysIn(prod, inputs, 6)).toEqual(["tag:"]);
    }
    expect(valuesOf(prod, "required")).toEqual(["true", "true"]);
  });

  it("has exactly its five jobs, deploy last, and runs none of the tag's code before prod-verify has verified its attestation", () => {
    expect(jobNames(prod)).toEqual(JOBS);
    const needs = Object.fromEntries(
      JOBS.slice(1).map(job => [
        job,
        scalarAt(prod, jobKey(job, "needs", prod)),
      ]),
    );
    expect(needs).toEqual({
      "prod-verify": "release-check",
      "prod-worker": "[release-check, prod-verify]",
      "config-prod": "[release-check, prod-verify]",
      "deploy-prod": "[release-check, prod-verify, prod-worker, config-prod]",
    });
    expect(valuesOf(prod, "if")).toEqual(["github.ref == 'refs/heads/main'"]);
  });

  it("gives each job exactly its permissions, and no token at the top", () => {
    expect(
      scalarAt(prod, keyLine(prod, 0, prod.length, 0, "permissions")),
    ).toBe("{}");
    expect(
      Object.fromEntries(
        JOBS.map(job => [
          job,
          mappingAt(prod, jobKey(job, "permissions", prod)),
        ]),
      ),
    ).toEqual({
      "release-check": ["actions: read"],
      "prod-verify": ["contents: read", "attestations: read"],
      "prod-worker": ["contents: read"],
      "config-prod": ["contents: read"],
      "deploy-prod": ["contents: read"],
    });
  });

  it("names pages-prod-config in config-prod and pages-prod in deploy-prod, and no other", () => {
    expect(valuesOf(prod, "environment")).toEqual([
      "pages-prod-config",
      "pages-prod",
    ]);
    expect(scalarAt(prod, jobKey("config-prod", "environment", prod))).toBe(
      "pages-prod-config",
    );
    expect(scalarAt(prod, jobKey("deploy-prod", "environment", prod))).toBe(
      "pages-prod",
    );
  });

  it("puts deploy-prod alone in the pages-prod group, never cancelled, and nothing else in a group", () => {
    expect(
      JOBS.map(job => [job, jobKeys(job, "concurrency", prod).length]),
    ).toEqual([
      ["release-check", 0],
      ["prod-verify", 0],
      ["prod-worker", 0],
      ["config-prod", 0],
      ["deploy-prod", 1],
    ]);
    expect(mappingAt(prod, jobKey("deploy-prod", "concurrency", prod))).toEqual(
      ["group: pages-prod", "cancel-in-progress: false"],
    );
    expect(
      prod.filter(line => line.text.startsWith("concurrency:")),
    ).toHaveLength(1);
    expect(valuesOf(staging, "group")).toEqual(["pages"]);
  });

  it("reads the deploy credential and the project names in deploy-prod only, and the configuration values in config-prod only", () => {
    const deploy = [
      "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}",
      "CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
      "WRAPPER_PROJECT: ${{ secrets.PAGES_WRAPPER_PROJECT }}",
      "VERIFIER_PROJECT: ${{ secrets.PAGES_VERIFIER_PROJECT }}",
    ];
    for (const step of ["Require the Pages settings", "Deploy to Pages"]) {
      expect(stepEnv("deploy-prod", step, prod)).toEqual(
        expect.arrayContaining(deploy),
      );
    }
    expect(
      stepEnv(
        "config-prod",
        "Build and validate the configuration documents",
        prod,
      ),
    ).toEqual(
      stepEnv(
        "config-stage",
        "Build and validate the configuration documents",
        staging,
      ),
    );
    const secrets = prod
      .filter(line => line.text.includes("secrets."))
      .map(line => line.text);
    expect(secrets).toHaveLength(deploy.length * 2 + 7);
    expect(secrets.filter(text => /CLOUDFLARE|PROJECT/u.test(text))).toEqual([
      ...deploy,
      ...deploy,
    ]);
    expect(prod.filter(line => /\bvars\./u.test(line.text))).toEqual([]);
  });

  it("writes no production value: no project name, hostname, or account", () => {
    for (const line of prod.filter(entry => !entry.text.startsWith("#"))) {
      expect(line.text).not.toMatch(
        /se-(?:wrapper|verifier|games)-|https:\/\/[a-z0-9-]+\./u,
      );
    }
  });

  it("checks out the tag's commit without persisted credentials", () => {
    for (const job of ["prod-worker", "config-prod", "deploy-prod"]) {
      expect(usesOf(job, prod).slice(0, 2)).toEqual([CHECKOUT, SETUP]);
    }
    expect(valuesOf(prod, "persist-credentials")).toEqual([
      "false",
      "false",
      "false",
    ]);
    expect(valuesOf(prod, "ref")).toEqual([
      "${{ needs.release-check.outputs.commit }}",
      "${{ needs.release-check.outputs.commit }}",
      "${{ needs.release-check.outputs.commit }}",
    ]);
    expect(usesOf("prod-verify", prod)).toEqual([]);
    expect(usesOf("release-check", prod)).toEqual([]);
  });

  it("runs no repository script in release-check, prod-verify, or deploy-prod", () => {
    for (const job of ["release-check", "prod-verify", "deploy-prod"]) {
      for (const script of runsOf(job, prod)) {
        expect(script).not.toMatch(/\b(?:pnpm|npm|npx|tsx|tsc|wireit|node)\b/u);
        expect(script).not.toContain("tools/");
      }
    }
    expect(usesOf("deploy-prod", prod)).toEqual([
      CHECKOUT,
      SETUP,
      DOWNLOAD,
      DOWNLOAD,
      DOWNLOAD,
    ]);
    expect(usesOf("prod-worker", prod)).toEqual([CHECKOUT, SETUP, UPLOAD]);
  });

  it("builds the worker and writes the headers with staging's own scripts", () => {
    expect(stepRun("prod-worker", "Build the API proxy worker", prod)).toBe(
      stepRun("build", "Build the API proxy worker", staging),
    );
    expect(stepRun("deploy-prod", "Write the Pages headers files", prod)).toBe(
      stepRun("deploy-stage", "Write the Pages headers files", staging),
    );
  });

  it("checks every download against its producing job's digest, the tar against prod-verify's", () => {
    const unpack = stepRun(
      "deploy-prod",
      "Check and unpack the artifacts",
      prod,
    );
    for (const pair of [
      '"${WRAPPER_FILE_NAME}:$WRAPPER_DIGEST"',
      '"_worker.js:$WORKER_DIGEST"',
      '"wrapper-environment-config.json:$WRAPPER_CONFIG_DIGEST"',
      '"verifier-environment-config.json:$VERIFIER_CONFIG_DIGEST"',
    ]) {
      expect(unpack).toContain(pair);
    }
    expect(
      stepEnv("deploy-prod", "Check and unpack the artifacts", prod),
    ).toContain(
      "WRAPPER_DIGEST: ${{ needs.prod-verify.outputs.wrapper-digest }}",
    );
    expect(unpack).not.toContain("game");
  });

  it("deploys the Wrapper's and the verifier's sites, unbundled, from the tag's commit", () => {
    const deploy = stepRun("deploy-prod", "Deploy to Pages", prod);
    expect(deploy).toContain("for site in wrapper verifier; do");
    expect(deploy).toContain("--no-bundle");
    expect(deploy).toContain('--commit-hash "$COMMIT"');
    expect(deploy).toContain('cd "$workdir"');
    expect(stepEnv("deploy-prod", "Deploy to Pages", prod)).toContain(
      'WRANGLER_SEND_METRICS: "false"',
    );
  });

  it("puts no ${{ expression inside any run: script", () => {
    for (const script of valuesOf(prod, "run")) {
      expect(script).not.toContain("${{");
    }
  });
});

// --- The scripts, run with stubs ---------------------------------------------
