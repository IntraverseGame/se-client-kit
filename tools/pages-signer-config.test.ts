import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { runStep } from "./fixtures/workflow-step.ts";
import { stepRun, workflow } from "./release-workflow-lines.ts";

// T-48, the signing page's side (specs/signing-page.md, SP-3 and SP-15;
// specs/client-kit.md, The Pages sites' configuration): the document the
// Wrapper's Pages tool builds passes the signing page's own validator, which
// the configuration job runs on the written file through
// apps/signing-page/config-check-cli.ts (no app imports the signing page); the
// CLI refuses what the validator refuses, naming the field, never a value; and
// the job's own step, run here as Actions runs it, writes and checks the
// third document only with `PAGES_SIGNER_ORIGIN`. The hosts are reserved
// example names.

const root = join(import.meta.dirname, "..");
const tsx = join(root, "node_modules", ".bin", "tsx");
const CHECK_CLI = "apps/signing-page/config-check-cli.ts";

type Built =
  | {
      readonly ok: true;
      readonly configs: { readonly wrapper: string; readonly signer?: string };
    }
  | { readonly ok: false; readonly issues: readonly string[] };
type PagesTool = {
  readonly buildPagesConfigs: (
    inputs: Readonly<Record<string, string>>,
    options?: { readonly production?: boolean },
  ) => Built;
};
type SignerValidator = {
  readonly validateSignerConfig: (
    document: unknown,
    ownOrigin: string,
  ) =>
    | { readonly ok: true; readonly config: unknown }
    | { readonly ok: false; readonly issues: readonly unknown[] };
};

// Loaded by path at run time: tools' typecheck does not follow into the apps.
const load = async <T>(path: string): Promise<T> =>
  (await import(pathToFileURL(join(root, path)).href)) as T;
const pagesTool = await load<PagesTool>("apps/wrapper/pages-config.ts");
const signerPage = await load<SignerValidator>(
  "apps/signing-page/src/environment-config.ts",
);

const WRAPPER = "https://wrapper.example";
const SIGNER = "https://signer.example-signer.test";

const pins = (environment: string) => ({
  environment,
  runtimeSigner: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
  registryDomain: {
    chainId: 31337,
    verifyingContract: "0xd5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5",
  },
  entropyChainKind: { base: "evm" },
  entropyChainId: { base: 8453 },
  minRpcQuorum: 2,
  tipLagMargin: { base: 2 },
});

const INPUTS: Readonly<Record<string, string>> = {
  PAGES_WRAPPER_ORIGIN: WRAPPER,
  PAGES_VERIFIER_ORIGIN: "https://verifier.example",
  PAGES_CHAIN_PINS: JSON.stringify(pins("preview")),
  PAGES_RPC_ENDPOINTS: JSON.stringify({
    base: [
      { provider: "p1", url: "https://rpc1.example/base" },
      { provider: "p2", url: "https://rpc2.example/base" },
    ],
  }),
  PAGES_RPC_ORIGINS: "https://rpc1.example https://rpc2.example",
  PAGES_GAME_ORIGINS: "https://game.example",
  PAGES_OPERATOR_ORIGINS: "https://operator.example",
};

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});
const scratch = (): string => {
  const made = mkdtempSync(join(tmpdir(), "pages-signer-config-"));
  directories.push(made);
  return made;
};

const signerDocument = (
  overrides: Readonly<Record<string, string>>,
  production = false,
): unknown => {
  const result = pagesTool.buildPagesConfigs(
    { ...INPUTS, ...overrides },
    { production },
  );
  if (!result.ok) throw new Error(result.issues.join("; "));
  return JSON.parse(result.configs.signer ?? "null");
};

describe("the signing page's document, by the page's own validator", () => {
  it.each([
    ["staging, without the flag", {}, false],
    ["staging, with the flag", { PAGES_ACCEPT_PENDING_NOTICES: "true" }, false],
    [
      "production",
      { PAGES_CHAIN_PINS: JSON.stringify(pins("production")) },
      true,
    ],
  ])("passes for %s", (_what, overrides, production) => {
    const document = signerDocument(
      { PAGES_SIGNER_ORIGIN: SIGNER, ...overrides },
      production,
    );
    expect(signerPage.validateSignerConfig(document, SIGNER)).toMatchObject({
      ok: true,
    });
  });
});

/**
 * Runs the check CLI on `document` (written as given when a string), with
 * `PAGES_SIGNER_ORIGIN` unset when `origin` is `null`.
 */
const check = (document: unknown, origin: string | null = SIGNER) => {
  const directory = scratch();
  const file = join(directory, "signer-environment-config.json");
  writeFileSync(
    file,
    typeof document === "string" ? document : JSON.stringify(document),
  );
  const result = spawnSync(tsx, [CHECK_CLI, "--file", file], {
    cwd: root,
    encoding: "utf8",
    env: {
      PATH: process.env["PATH"],
      ...(origin === null ? {} : { PAGES_SIGNER_ORIGIN: origin }),
    },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

describe("apps/signing-page/config-check-cli.ts", () => {
  it("accepts the document the Pages tool built", () => {
    expect(check(signerDocument({ PAGES_SIGNER_ORIGIN: SIGNER }))).toEqual({
      status: 0,
      output: "Validated the signing page's configuration document.\n",
    });
  });

  it("refuses a document naming its own origin, an unknown field, and a pending notice in production, by field and code, never a value", () => {
    const result = check({
      environment: "production",
      wrapperOrigins: [SIGNER],
      acceptPendingNotices: true,
      extra: "https://leak.example",
    });
    expect(result.status).toBe(1);
    expect(result.output.split("\n").filter(Boolean).toSorted()).toEqual([
      "::error::signer document: overlapping-origins at wrapperOrigins.0",
      "::error::signer document: pending-notices-in-production at acceptPendingNotices",
      "::error::signer document: unknown-field at extra",
    ]);
    expect(result.output).not.toContain("example");
  });

  it("refuses a file that is not JSON, and a missing PAGES_SIGNER_ORIGIN", () => {
    expect(check("{")).toEqual({
      status: 1,
      output: "::error::signer document: unreadable or not JSON\n",
    });
    expect(
      check({ environment: "preview", wrapperOrigins: [WRAPPER] }, null),
    ).toEqual({ status: 1, output: "::error::PAGES_SIGNER_ORIGIN: missing\n" });
  });

  it("asks for --file", () => {
    const result = spawnSync(tsx, [CHECK_CLI], {
      cwd: root,
      encoding: "utf8",
      env: { PATH: process.env["PATH"], PAGES_SIGNER_ORIGIN: SIGNER },
    });
    expect(result.status).toBe(2);
  });
});

describe("config-stage's configuration step", () => {
  const STEP = stepRun(
    "config-stage",
    "Build and validate the configuration documents",
    workflow("pages.yml"),
  );

  /** Runs the step from the repository root, as the job does. */
  const run = (overrides: Readonly<Record<string, string>>) => {
    const temp = scratch();
    const output = join(temp, "github-output");
    writeFileSync(output, "");
    const result = runStep(STEP, scratch(), {
      cwd: root,
      env: {
        PATH: process.env["PATH"],
        RUNNER_TEMP: temp,
        GITHUB_OUTPUT: output,
        ...INPUTS,
        ...overrides,
      },
    });
    return {
      status: result.status,
      logs: `${result.stdout}${result.stderr}`,
      outputs: readFileSync(output, "utf8").split("\n").filter(Boolean),
      files: readdirSync(join(temp, "pages-config")).toSorted(),
    };
  };

  it("writes and checks the signing page's document, and outputs its digest, with PAGES_SIGNER_ORIGIN", () => {
    const result = run({ PAGES_SIGNER_ORIGIN: SIGNER });
    expect(result.status).toBe(0);
    expect(result.files).toEqual([
      "signer-environment-config.json",
      "verifier-environment-config.json",
      "wrapper-environment-config.json",
    ]);
    expect(result.logs).toContain(
      "Validated the signing page's configuration document.",
    );
    expect(result.outputs.map(line => line.split("=")[0])).toEqual([
      "wrapper-config-digest",
      "verifier-config-digest",
      "signer-config-digest",
    ]);
    expect(result.logs).not.toContain("signer.example");
  });

  it("writes no signing page document, and no digest for one, without it", () => {
    const result = run({ PAGES_ACCEPT_PENDING_NOTICES: "true" });
    expect(result.status).toBe(0);
    expect(result.files).toEqual([
      "verifier-environment-config.json",
      "wrapper-environment-config.json",
    ]);
    expect(result.outputs.map(line => line.split("=")[0])).toEqual([
      "wrapper-config-digest",
      "verifier-config-digest",
    ]);
  });
});
