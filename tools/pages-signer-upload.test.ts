import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runStep } from "./fixtures/workflow-step.ts";
import { prod, stepRun, workflow } from "./release-workflow-lines.ts";
import type { Line } from "./workflow-text.ts";

// T-49's deploy half, at the upload (specs/signing-page.md, SP-15;
// specs/client-kit.md, The signing page's site): the deploy's own steps, run
// here as Actions runs them (tools/fixtures/workflow-step.ts). The check right
// before the upload refuses a Wrapper's or verifier's site that holds
// `signer/` and a signing page site with a worker, routes, or redirects; the
// upload sends the signing page's site first, to its own project, only when it
// was laid out (tools/pages-signer-site.test.ts lays it out). The project
// names are placeholders.

const staging = workflow("pages.yml");
const GUARD = "Check the signing page's place";
const DEPLOY = "Deploy to Pages";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});
const scratch = (): string => {
  const made = mkdtempSync(join(tmpdir(), "pages-signer-upload-"));
  directories.push(made);
  return made;
};

const write = (path: string, text: string): void => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
};

const guard = (temp: string) => {
  const result = runStep(stepRun("deploy-stage", GUARD, staging), scratch(), {
    env: { PATH: process.env["PATH"], RUNNER_TEMP: temp },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

describe("the check before the upload", () => {
  it.each(["wrapper", "verifier"])(
    "refuses a %s site that holds signer/",
    site => {
      const temp = scratch();
      write(join(temp, "sites", site, "signer", "index.html"), "signer\n");
      expect(guard(temp)).toEqual({
        status: 1,
        output: `::error::The ${site} site holds signer/; its origin would serve the signing page.\n`,
      });
    },
  );

  it.each(["_worker.js", "_routes.json", "_redirects"])(
    "refuses a signing page site with %s",
    file => {
      const temp = scratch();
      write(join(temp, "sites", "signer", "index.html"), "signer\n");
      write(join(temp, "sites", "signer", file), "x\n");
      expect(guard(temp)).toEqual({
        status: 1,
        output: `::error::The signing page's site has a ${file}.\n`,
      });
    },
  );

  it("passes sites laid out as the deploy lays them out", () => {
    const temp = scratch();
    for (const site of ["wrapper", "verifier", "signer"]) {
      write(join(temp, "sites", site, "index.html"), `${site}\n`);
    }
    write(join(temp, "sites", "signer", "signer", "index.html"), "signer\n");
    write(join(temp, "sites", "wrapper", "verify", "index.html"), "verify\n");
    expect(guard(temp)).toEqual({ status: 0, output: "" });
  });
});

/** Runs a deploy step with a stub wrangler that records each upload. */
const deploy = (lines: readonly Line[], job: string, signer: boolean) => {
  const temp = scratch();
  const sites = [
    "wrapper",
    "verifier",
    ...(job === "deploy-stage" ? ["game"] : []),
  ];
  for (const site of [...sites, ...(signer ? ["signer"] : [])]) {
    write(join(temp, "sites", site, "index.html"), `${site}\n`);
  }
  const workspace = scratch();
  const wrangler = join(workspace, "node_modules", ".bin", "wrangler");
  write(
    wrangler,
    '#!/bin/sh\nprintf "%s %s %s\\n" "$3" "$5" "$(cd "$3" && ls | tr "\\n" " ")" >> "$CALLS"\n',
  );
  chmodSync(wrangler, 0o755);
  const calls = join(workspace, "calls");
  writeFileSync(calls, "");
  const result = runStep(stepRun(job, DEPLOY, lines), scratch(), {
    env: {
      PATH: process.env["PATH"],
      RUNNER_TEMP: temp,
      GITHUB_WORKSPACE: workspace,
      GITHUB_SHA: "0".repeat(40),
      COMMIT: "0".repeat(40),
      RELEASE_TAG: "@intraverse/se-client-wrapper@1.0.0",
      CALLS: calls,
      WRAPPER_PROJECT: "wrapper-site",
      VERIFIER_PROJECT: "verifier-site",
      GAME_PROJECT: "game-site",
      SIGNER_PROJECT: "signer-site",
    },
  });
  expect(result.status).toBe(0);
  return readFileSync(calls, "utf8").split("\n").filter(Boolean);
};

describe("the upload", () => {
  it.each([
    ["staging", staging, "deploy-stage", ["game game-site index.html "]],
    ["production", prod, "deploy-prod", []],
  ] as const)(
    "on %s, uploads the signing page's site first, to its own project, only when it was laid out",
    (_where, lines, job, game) => {
      const others = [
        "wrapper wrapper-site index.html ",
        "verifier verifier-site index.html ",
        ...game,
      ];
      expect(deploy(lines, job, true)).toEqual([
        "signer signer-site index.html ",
        ...others,
      ]);
      expect(deploy(lines, job, false)).toEqual(others);
    },
  );
});
