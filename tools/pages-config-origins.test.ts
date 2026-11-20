import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { headersStep } from "./pages-headers-step.ts";
import { prod } from "./release-workflow-lines.ts";
import { jobRange, keyLine, scalarAt, stepNamed } from "./workflow-text.ts";

// The Pages configuration tool (apps/wrapper/pages-config.ts, with
// apps/wrapper/pages-config-rules.ts; ADR-009, amendment note of 2026-11-17)
// refuses, in both modes, exactly the origins the deploy's headers step
// (pages.yml and pages-prod.yml, "Write the Pages headers files", one script)
// refuses, so the configuration job fails where the deploy would: for
// production, in the release's check before npm publishes. Each case runs the
// step's own script with bash and jq (tools/pages-headers-step.ts) on a
// document holding the case's values, and requires the step to fail exactly
// when the tool, in either mode, names the value.

type Result =
  | { readonly ok: true; readonly configs: { readonly wrapper: string } }
  | { readonly ok: false; readonly issues: readonly string[] };
type PagesTool = {
  readonly buildPagesConfigs: (
    inputs: Readonly<Record<string, string>>,
    options?: { readonly production?: boolean },
  ) => Result;
};
type Rules = { readonly HEADERS_ORIGIN_PATTERN: string };

const root = join(import.meta.dirname, "..");

// Loaded by path at run time: tools' typecheck does not follow into the apps,
// which have their own `tsconfig.json`.
const pagesTool = (await import(
  pathToFileURL(join(root, "apps/wrapper/pages-config.ts")).href
)) as PagesTool;
const rules = (await import(
  pathToFileURL(join(root, "apps/wrapper/pages-config-rules.ts")).href
)) as Rules;

// A minimal headers file with every placeholder the step fills.
const HEADERS = {
  "/*": {
    "Content-Security-Policy":
      "connect-src 'self' {{connectOrigins}}; frame-src {{gameOrigins}}; frame-ancestors {{operatorOrigins}}",
  },
  "/verify/*": {
    "Content-Security-Policy": "connect-src 'self' {{verifyConnectOrigins}}",
  },
};

const PINS = {
  environment: "production",
  runtimeSigner: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
  registryDomain: {
    chainId: 31337,
    verifyingContract: "0xd5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5",
  },
  entropyChainKind: { base: "evm" },
  entropyChainId: { base: 8453 },
  minRpcQuorum: 2,
  tipLagMargin: { base: 2 },
};

type Case = {
  readonly rpc?: readonly string[];
  readonly game?: string;
  readonly operator?: string;
  readonly wrapper?: string;
};

const RPC = "https://rpc1.example/base";

const inputsOf = ({
  rpc = [RPC, "https://rpc2.example/base"],
  game = "https://game.example",
  operator = "https://operator.example",
  wrapper = "https://wrapper.example",
}: Case): Readonly<Record<string, string>> => ({
  PAGES_WRAPPER_ORIGIN: wrapper,
  PAGES_VERIFIER_ORIGIN: "https://verifier.example",
  PAGES_CHAIN_PINS: JSON.stringify(PINS),
  PAGES_RPC_ENDPOINTS: JSON.stringify({
    base: rpc.map((url, index) => ({ provider: `p${String(index)}`, url })),
  }),
  PAGES_RPC_ORIGINS: [...new Set(rpc.map(url => new URL(url).origin))].join(
    " ",
  ),
  PAGES_GAME_ORIGINS: game,
  PAGES_OPERATOR_ORIGINS: operator,
});

const CASES: readonly (readonly [string, Case])[] = [
  ["accepted values", {}],
  ["an RPC host with a port", { rpc: [RPC, "https://rpc2.example:8545/x"] }],
  ["an RPC URL with no path", { rpc: [RPC, "https://rpc2.example"] }],
  ["an IPv4 RPC host", { rpc: [RPC, "https://192.0.2.1:8545/"] }],
  ["an uppercase RPC host", { rpc: [RPC, "https://RPC2.example/base"] }],
  ["an underscore in an RPC host", { rpc: [RPC, "https://rpc_2.example/b"] }],
  ["a leading hyphen in an RPC host", { rpc: [RPC, "https://-rpc2.example/"] }],
  ["an IPv6 RPC host", { rpc: [RPC, "https://[::1]:8545/"] }],
  ["a loopback http RPC endpoint", { rpc: [RPC, "http://localhost:8545/"] }],
  ["an underscore in a game origin", { game: "https://game_1.example" }],
  ["a loopback http game origin", { game: "http://localhost:5173" }],
  ["a game origin with a port", { game: "https://game.example:8443" }],
  ["an underscore in an operator origin", { operator: "https://op_1.example" }],
  ["no operator origin", { operator: "" }],
  ["an underscore in the Wrapper origin", { wrapper: "https://w_1.example" }],
  ["a Wrapper origin with a port", { wrapper: "https://wrapper.example:8443" }],
];

/** What the tool refuses for `inputs` in one mode (none when it accepts). */
const issuesIn = (
  inputs: Readonly<Record<string, string>>,
  production: boolean,
): readonly string[] => {
  const result = pagesTool.buildPagesConfigs(inputs, { production });
  return result.ok ? [] : result.issues;
};

describe("the configuration tool against the deploy's headers step", () => {
  const step = headersStep();
  afterAll(step.cleanup);

  it("holds the step's origin pattern, character for character", () => {
    const script = scalarAt(
      prod,
      keyLine(
        prod,
        ...stepNamed(
          prod,
          jobRange(prod, "deploy-prod"),
          "Write the Pages headers files",
        ),
        8,
        "run",
      ),
    );
    expect(script).toContain(`origin='${rules.HEADERS_ORIGIN_PATTERN}'\n`);
  });

  /** The headers step's exit status with the case's values in the document. */
  const stepStatus = ({
    rpc = [RPC, "https://rpc2.example/base"],
    game = "https://game.example",
    operator = "https://operator.example",
    wrapper = "https://wrapper.example",
  }: Case): number | null =>
    step.run(
      HEADERS,
      {
        rpc,
        game: [game],
        operator: operator === "" ? [] : [operator],
        playApiBaseUrl: `${wrapper}/play/v1`,
      },
      { game: false },
    ).status;

  it.each(CASES)(
    "refuses exactly what the step refuses: %s",
    (_what, values) => {
      const inputs = inputsOf(values);
      const issues = issuesIn(inputs, true);
      expect(issues.length === 0).toBe(stepStatus(values) === 0);
      expect(issuesIn(inputs, false)).toEqual(issues);
      expect(
        issues.filter(issue => !issue.includes(" not-https-origin at ")),
      ).toEqual([]);
    },
  );
});
