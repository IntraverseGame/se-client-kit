import { describe, expect, it } from "vitest";

import {
  CHECKOUT,
  checkoutWith,
  jobKey,
  prod,
  prodCheck,
  release,
  SETUP,
  stepEnv,
  stepRun,
  usesOf,
  valuesOf,
  workflow,
} from "./release-workflow-lines.ts";
import {
  blockEnd,
  jobNames,
  jobRange,
  keyLine,
  keyLines,
  type Line,
  mappingAt,
  scalarAt,
  stepRanges,
} from "./workflow-text.ts";

// The production check the release runs before it publishes
// (.github/workflows/pages-prod-check.yml; ADR-009, amendment note of
// 2026-11-17; runbook, Release): called by release.yml's `prod-check` only.
// `config-check` (in `pages-prod-config`) runs the production deploy's
// `config-prod` steps word for word, in production mode, at the release run's
// own commit, then the deploy's own headers step on the documents;
// `deploy-check` (in `pages-prod`) runs `deploy-prod`'s settings step word for
// word, with no checkout and no repository code. release.yml's side (the call,
// its condition, `publish` needing it) is in tools/release-workflow.test.ts;
// the steps' scripts run in tools/pages-prod-check-scripts.test.ts.

const staging = workflow("pages.yml");

const keysIn = (lines: readonly Line[], index: number, indent: number) =>
  lines
    .slice(index + 1, blockEnd(lines, index))
    .filter(line => line.indent === indent && !line.text.startsWith("#"))
    .map(line => line.text);

/** The `name:` of each named step of job `job`, in order. */
const stepNames = (lines: readonly Line[], job: string): string[] =>
  stepRanges(lines, jobRange(lines, job)).flatMap(([from, to]) =>
    keyLines(lines, from, to, 8, "name").map(at => scalarAt(lines, at)),
  );

/** The `secrets.` lines of the check workflow in `[from, to)`. */
const secretsIn = (from: number, to: number): string[] =>
  prodCheck
    .slice(from, to)
    .filter(line => line.text.includes("secrets."))
    .map(line => line.text);

const CONFIG_STEPS = [
  "Build the shell",
  "Build and validate the configuration documents",
];
const HEADERS_STEP = "Write the Pages headers files";
const SETTINGS_STEP = "Require the Pages settings";

const DEPLOY_SECRETS = [
  "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}",
  "CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
  "WRAPPER_PROJECT: ${{ secrets.PAGES_WRAPPER_PROJECT }}",
  "VERIFIER_PROJECT: ${{ secrets.PAGES_VERIFIER_PROJECT }}",
  "SIGNER_PROJECT: ${{ secrets.PAGES_SIGNER_PROJECT }}",
];

describe("the production check workflow", () => {
  it("is only called, with no input, and only by the release workflow's prod-check", () => {
    const on = keyLine(prodCheck, 0, prodCheck.length, 0, "on");
    expect(keysIn(prodCheck, on, 2)).toEqual(["workflow_call:"]);
    expect(prodCheck[on + 1]?.text).toBe("workflow_call:");
    expect(blockEnd(prodCheck, on + 1)).toBe(on + 2);
    expect(
      release
        .filter(line => line.text.includes("pages-prod-check.yml"))
        .filter(line => !line.text.startsWith("#"))
        .map(line => line.text),
    ).toEqual(["uses: ./.github/workflows/pages-prod-check.yml"]);
  });

  it("has two jobs, config-check in pages-prod-config and deploy-check in pages-prod after it, with no condition or group, and one output", () => {
    expect(
      scalarAt(
        prodCheck,
        keyLine(prodCheck, 0, prodCheck.length, 0, "permissions"),
      ),
    ).toBe("{}");
    expect(jobNames(prodCheck)).toEqual(["config-check", "deploy-check"]);
    expect(
      mappingAt(prodCheck, jobKey("config-check", "permissions", prodCheck)),
    ).toEqual(["contents: read"]);
    expect(
      scalarAt(prodCheck, jobKey("deploy-check", "permissions", prodCheck)),
    ).toBe("{}");
    expect(valuesOf(prodCheck, "environment")).toEqual([
      "pages-prod-config",
      "pages-prod",
    ]);
    expect(
      scalarAt(prodCheck, jobKey("config-check", "environment", prodCheck)),
    ).toBe("pages-prod-config");
    expect(
      scalarAt(prodCheck, jobKey("deploy-check", "environment", prodCheck)),
    ).toBe("pages-prod");
    expect(valuesOf(prodCheck, "if")).toEqual([]);
    expect(valuesOf(prodCheck, "needs")).toEqual(["config-check"]);
    expect(
      scalarAt(prodCheck, jobKey("deploy-check", "needs", prodCheck)),
    ).toBe("config-check");
    expect(valuesOf(prodCheck, "concurrency")).toEqual([]);
    expect(valuesOf(prodCheck, "continue-on-error")).toEqual([]);
    // Whether production names a signing page, for deploy-check's settings.
    expect(
      mappingAt(prodCheck, jobKey("config-check", "outputs", prodCheck)),
    ).toEqual([
      "signer-config-digest: ${{ steps.config.outputs.signer-config-digest }}",
    ]);
  });

  it("checks out the run's own commit without persisted credentials in config-check, and uploads nothing", () => {
    expect(usesOf("config-check", prodCheck)).toEqual([CHECKOUT, SETUP]);
    expect(checkoutWith("config-check", prodCheck)).toEqual([
      "persist-credentials: false",
    ]);
    expect(valuesOf(prodCheck, "ref")).toEqual([]);
  });

  it("runs config-prod's own steps word for word in production mode, then the Wrapper's build and the deploy's own headers step", () => {
    expect(stepNames(prodCheck, "config-check")).toEqual([
      ...CONFIG_STEPS,
      "Build the Wrapper",
      "Lay out the sites",
      HEADERS_STEP,
    ]);
    expect(stepNames(prod, "config-prod")).toEqual(CONFIG_STEPS);
    for (const name of CONFIG_STEPS) {
      expect(stepRun("config-check", name, prodCheck)).toBe(
        stepRun("config-prod", name, prod),
      );
    }
    const config = "Build and validate the configuration documents";
    expect(stepEnv("config-check", config, prodCheck)).toEqual(
      stepEnv("config-prod", config, prod),
    );
    expect(stepRun("config-check", config, prodCheck)).toContain(
      "pages-config-cli.ts --production --out",
    );
    expect(stepRun("config-check", "Build the Wrapper", prodCheck)).toBe(
      "pnpm --filter @intraverse/se-client-wrapper run build",
    );
    expect(stepRun("config-check", HEADERS_STEP, prodCheck)).toBe(
      stepRun("deploy-prod", HEADERS_STEP, prod),
    );
    expect(stepRun("config-check", HEADERS_STEP, prodCheck)).toBe(
      stepRun("deploy-stage", HEADERS_STEP, staging),
    );
    expect(stepEnv("config-check", HEADERS_STEP, prodCheck)).toEqual([
      "SITES: ${{ runner.temp }}/sites",
    ]);
  });

  it("runs deploy-prod's own settings step in deploy-check, word for word, with no checkout and no repository code", () => {
    expect(stepNames(prodCheck, "deploy-check")).toEqual([SETTINGS_STEP]);
    expect(usesOf("deploy-check", prodCheck)).toEqual([]);
    expect(stepRun("deploy-check", SETTINGS_STEP, prodCheck)).toBe(
      stepRun("deploy-prod", SETTINGS_STEP, prod),
    );
    // The same settings, and the same answer to whether production names a
    // signing page, from this run's own configuration job.
    expect(stepEnv("deploy-check", SETTINGS_STEP, prodCheck)).toEqual([
      ...DEPLOY_SECRETS,
      "SIGNER_CONFIG_DIGEST:",
      "${{ needs.config-check.outputs.signer-config-digest }}",
    ]);
    expect(stepEnv("deploy-prod", SETTINGS_STEP, prod)).toEqual([
      ...DEPLOY_SECRETS,
      "SIGNER_CONFIG_DIGEST:",
      "${{ needs.config-prod.outputs.signer-config-digest }}",
    ]);
    expect(stepRun("deploy-check", SETTINGS_STEP, prodCheck)).not.toMatch(
      /\b(?:pnpm|npm|npx|tsx|tsc|node|curl|wget|wrangler)\b|tools\//u,
    );
  });

  it("reads the nine configuration values in config-check and the deploy settings in deploy-check, and nothing else", () => {
    const [configFrom, configTo] = jobRange(prodCheck, "config-check");
    const [deployFrom, deployTo] = jobRange(prodCheck, "deploy-check");
    // Every secret line of the job is the configuration step's (a value the
    // formatter folds is on its own line, after its key).
    expect(secretsIn(configFrom, configTo)).toEqual(
      stepEnv(
        "config-check",
        "Build and validate the configuration documents",
        prodCheck,
      ).filter(entry => entry.includes("secrets.")),
    );
    expect(secretsIn(configFrom, configTo)).toHaveLength(9);
    expect(secretsIn(deployFrom, deployTo)).toEqual(DEPLOY_SECRETS);
    expect(
      prodCheck.filter(line => line.text.includes("secrets.")),
    ).toHaveLength(14);
    expect(prodCheck.filter(line => /\bvars\./u.test(line.text))).toEqual([]);
  });

  it("writes no production value, and no ${{ expression inside a run: script", () => {
    for (const line of prodCheck.filter(entry => !entry.text.startsWith("#"))) {
      expect(line.text).not.toMatch(
        /se-(?:wrapper|verifier|games|signer)-|https:\/\/[a-z0-9-]+\./u,
      );
    }
    for (const script of valuesOf(prodCheck, "run")) {
      expect(script).not.toContain("${{");
    }
  });
});
