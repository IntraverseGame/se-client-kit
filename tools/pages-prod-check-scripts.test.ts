import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { runStep } from "./fixtures/workflow-step.ts";
import { prod, prodCheck, stepRun } from "./release-workflow-lines.ts";

// The production check's scripts (.github/workflows/pages-prod-check.yml;
// ADR-009, amendment note of 2026-11-17), run as Actions runs them
// (tools/fixtures/workflow-step.ts): `deploy-check`'s settings step, which is
// `deploy-prod`'s own (the deploy credential and the project names set, the
// names Pages project names, and different), and `config-check`'s last two
// steps, which lay out the sites from the Wrapper's built `headers.json` and
// production's configuration document and run the deploy's own headers step
// on them, so a `_headers` line over the Pages limit fails before publish.
// The hosts are reserved example names; the token is a placeholder.

const root = join(import.meta.dirname, "..");

type PagesTool = {
  readonly buildPagesConfigs: (
    inputs: Readonly<Record<string, string>>,
    options?: { readonly production?: boolean },
  ) =>
    | { readonly ok: true; readonly configs: { readonly wrapper: string } }
    | { readonly ok: false; readonly issues: readonly string[] };
};

// Loaded by path at run time: tools' typecheck does not follow into the apps.
const pagesTool = (await import(
  pathToFileURL(join(root, "apps/wrapper/pages-config.ts")).href
)) as PagesTool;

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const scratch = (): string => {
  const made = mkdtempSync(join(tmpdir(), "pages-prod-check-"));
  directories.push(made);
  return made;
};

const SETTINGS = stepRun(
  "deploy-check",
  "Require the Pages settings",
  prodCheck,
);
const LAYOUT = stepRun("config-check", "Lay out the sites", prodCheck);
const HEADERS = stepRun(
  "config-check",
  "Write the Pages headers files",
  prodCheck,
);

const TOKEN = "placeholder-token-value";
const SETTINGS_ENV = {
  CLOUDFLARE_API_TOKEN: TOKEN,
  CLOUDFLARE_ACCOUNT_ID: "placeholder-account",
  WRAPPER_PROJECT: "wrapper-site",
  VERIFIER_PROJECT: "verifier-site",
};

const settings = (overrides: Readonly<Record<string, string>> = {}) => {
  const result = runStep(SETTINGS, scratch(), {
    env: { PATH: process.env["PATH"], ...SETTINGS_ENV, ...overrides },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

describe("deploy-check's settings step", () => {
  it("is deploy-prod's own", () => {
    expect(SETTINGS).toBe(
      stepRun("deploy-prod", "Require the Pages settings", prod),
    );
  });

  it.each(["wrapper-site", "a", "a1-b2", "x".repeat(63)])(
    "accepts the project name %s",
    name => {
      expect(settings({ WRAPPER_PROJECT: name })).toEqual({
        status: 0,
        output: "",
      });
    },
  );

  it.each([
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "WRAPPER_PROJECT",
    "VERIFIER_PROJECT",
  ])("refuses a missing %s, by name", name => {
    const result = settings({ [name]: "" });
    expect(result.status).toBe(1);
    expect(result.output).toBe(
      `::error::The pages-prod environment has no ${name} (runbook/client-kit-release.md, Deploy to Cloudflare Pages).\n`,
    );
  });

  it.each([
    ["an uppercase letter", "Wrapper-site"],
    ["an underscore", "wrapper_site"],
    ["a leading dash", "-wrapper"],
    ["a trailing dash", "wrapper-"],
    ["a dot", "wrapper.site"],
    ["64 characters", "x".repeat(64)],
  ])("refuses a project name with %s, never printing it", (_what, name) => {
    const result = settings({ VERIFIER_PROJECT: name });
    expect(result.status).toBe(1);
    expect(result.output).toBe(
      "::error::The pages-prod environment's VERIFIER_PROJECT is not a Pages project name (lowercase letters, digits, and inner dashes, at most 63 characters).\n",
    );
  });

  it("refuses the same project for both sites", () => {
    const result = settings({ VERIFIER_PROJECT: "wrapper-site" });
    expect(result.status).toBe(1);
    expect(result.output).toBe(
      "::error::The pages-prod environment's WRAPPER_PROJECT and VERIFIER_PROJECT name the same project.\n",
    );
  });

  it("names every problem at once, and never prints the token", () => {
    const result = settings({
      CLOUDFLARE_ACCOUNT_ID: "",
      WRAPPER_PROJECT: "Bad_Name",
    });
    expect(result.status).toBe(1);
    expect(result.output.split("\n").filter(line => line !== "")).toHaveLength(
      2,
    );
    expect(result.output).not.toContain(TOKEN);
    expect(result.output).not.toContain("Bad_Name");
  });
});

const PINS = {
  environment: "production",
  runtimeSigner: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
  registryDomain: {
    chainId: 31337,
    verifyingContract: "0xd5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5",
  },
  entropyChainKind: { solana: "solana" },
  entropyChainId: { solana: 101 },
  minRpcQuorum: 2,
  tipLagMargin: { solana: 64 },
};

/**
 * Production's Wrapper document with `count` RPC endpoints of their own
 * origins.
 */
const wrapperDocument = (count: number): string => {
  const urls = Array.from(
    { length: count },
    (_, index) => `https://rpc-${String(index)}.example/browser-key`,
  );
  const result = pagesTool.buildPagesConfigs(
    {
      PAGES_WRAPPER_ORIGIN: "https://wrapper.example",
      PAGES_VERIFIER_ORIGIN: "https://verifier.example",
      PAGES_CHAIN_PINS: JSON.stringify(PINS),
      PAGES_RPC_ENDPOINTS: JSON.stringify({
        solana: urls.map((url, index) => ({
          provider: `p${String(index)}`,
          url,
        })),
      }),
      PAGES_RPC_ORIGINS: urls.map(url => new URL(url).origin).join(" "),
      PAGES_GAME_ORIGINS: "https://game.example",
      PAGES_OPERATOR_ORIGINS: "https://operator.example",
    },
    { production: true },
  );
  if (!result.ok) throw new Error(result.issues.join("; "));
  return result.configs.wrapper;
};

/** The layout and headers steps, from the repository root, as the job runs them. */
const headersCheck = (count: number) => {
  const temp = scratch();
  mkdirSync(join(temp, "pages-config"));
  writeFileSync(
    join(temp, "pages-config", "wrapper-environment-config.json"),
    wrapperDocument(count),
  );
  const env = { PATH: process.env["PATH"], LC_ALL: "C", RUNNER_TEMP: temp };
  const layout = runStep(LAYOUT, scratch(), { cwd: root, env });
  const headers = runStep(HEADERS, scratch(), {
    cwd: root,
    env: { ...env, SITES: join(temp, "sites") },
  });
  return {
    layout: layout.status,
    status: headers.status,
    output: `${headers.stdout}${headers.stderr}`,
  };
};

describe("config-check's headers check", () => {
  it("writes both sites' headers from the Wrapper's built headers.json and production's document", () => {
    const result = headersCheck(2);
    expect(result.layout).toBe(0);
    expect(result.status).toBe(0);
    expect(result.output).toContain("/wrapper/_headers:");
    expect(result.output).toContain("/verifier/_headers:");
  });

  it("refuses a _headers line over the Pages limit, naming the site and the header, never a value", () => {
    const result = headersCheck(100);
    expect(result.layout).toBe(0);
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "::error::The wrapper site's _headers line for Content-Security-Policy is over the Pages limit of 2000 characters.",
    );
    expect(result.output).not.toContain("rpc-1.example");
  });
});
