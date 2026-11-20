import { describe, expect, it } from "vitest";

import { buildPagesConfigs, type PagesConfigInputs } from "../pages-config.ts";

// The Pages configuration tool's own rules (pages-config.ts,
// pages-config-rules.ts; ADR-009, amendment note of 2026-11-17): in both
// modes, every origin the deploy's headers step reads must be one it accepts;
// in production mode only, `environment` must be `production` (so W-26a's
// quorum rule and the validators' production cluster rule apply), which
// staging's mode does not require.
// tools/pages-config-origins.test.ts runs the deploy's own headers step against
// the same kinds of values.
// The hosts are reserved example names; the addresses are the signing
// vectors' public development values, as in pages-config.test.ts.

const WRAPPER = "https://wrapper.example";
const VERIFIER = "https://verifier.example";

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

const RPC1 = "https://rpc1.example/base";
const RPC = [RPC1, "https://rpc2.example/base"];

type Overrides = {
  readonly pins?: Readonly<Record<string, unknown>>;
  readonly rpc?: readonly string[];
  readonly inputs?: Partial<Record<keyof PagesConfigInputs, string>>;
};

/** The tool's inputs: production's pins and `rpc`'s URLs, one source. */
const inputs = ({
  pins = {},
  rpc = RPC,
  inputs: rest = {},
}: Overrides = {}): PagesConfigInputs => ({
  PAGES_WRAPPER_ORIGIN: WRAPPER,
  PAGES_VERIFIER_ORIGIN: VERIFIER,
  PAGES_CHAIN_PINS: JSON.stringify({ ...PINS, ...pins }),
  PAGES_RPC_ENDPOINTS: JSON.stringify({
    base: rpc.map((url, index) => ({ provider: `p${String(index)}`, url })),
  }),
  PAGES_RPC_ORIGINS: [...new Set(rpc.map(url => new URL(url).origin))].join(
    " ",
  ),
  PAGES_GAME_ORIGINS: "https://game.example",
  PAGES_OPERATOR_ORIGINS: "https://operator.example",
  ...rest,
});

const issuesIn = (production: boolean, overrides: Overrides = {}) => {
  const result = buildPagesConfigs(inputs(overrides), { production });
  return result.ok ? [] : result.issues;
};

const production = (overrides: Overrides = {}) => issuesIn(true, overrides);
const staging = (overrides: Overrides = {}) => issuesIn(false, overrides);

describe("the Pages configuration's own rules", () => {
  it("accepts production's pins and writes the same documents as staging's mode", () => {
    const strict = buildPagesConfigs(inputs(), { production: true });
    expect(strict.ok).toBe(true);
    expect(strict).toEqual(buildPagesConfigs(inputs()));
  });

  it("accepts production with no minRpcQuorum (W-26a's default, 2)", () => {
    const pins = Object.fromEntries(
      Object.entries(PINS).filter(([field]) => field !== "minRpcQuorum"),
    );
    const result = buildPagesConfigs(
      { ...inputs(), PAGES_CHAIN_PINS: JSON.stringify(pins) },
      { production: true },
    );
    expect(result.ok).toBe(true);
  });

  it.each(["preview", "local"])(
    "refuses environment %s, which staging's mode accepts",
    environment => {
      const pins = { environment, minRpcQuorum: 1 };
      expect(production({ pins })).toEqual([
        "PAGES_CHAIN_PINS: not-production at environment",
      ]);
      expect(staging({ pins })).toEqual([]);
    },
  );

  it("refuses a minRpcQuorum of 1 under production (W-26a), in both modes, and accepts it under preview in staging's mode", () => {
    const quorum = [
      "wrapper document: production-quorum at minRpcQuorum",
      "verifier document: production-quorum at minRpcQuorum",
    ];
    expect(production({ pins: { minRpcQuorum: 1 } })).toEqual(quorum);
    expect(staging({ pins: { minRpcQuorum: 1 } })).toEqual(quorum);
    expect(
      staging({ pins: { environment: "preview", minRpcQuorum: 1 } }),
    ).toEqual([]);
  });

  it.each([
    ["an uppercase letter", "https://RPC2.example/base"],
    ["an underscore", "https://rpc_2.example/base"],
    ["a label that starts with a hyphen", "https://-rpc2.example/base"],
    ["a bracketed IPv6 host", "https://[::1]:8545/"],
    ["http on a loopback host", "http://localhost:8545/"],
  ])(
    "refuses an RPC endpoint whose host has %s, in both modes",
    (_what, url) => {
      const rpc = [RPC1, url];
      const refused = [
        "PAGES_RPC_ENDPOINTS: not-https-origin at rpcEndpoints.base.1.url",
      ];
      expect(production({ rpc })).toEqual(refused);
      expect(staging({ rpc })).toEqual(refused);
    },
  );

  it.each([
    ["a port", "https://rpc2.example:8545/base"],
    ["no path", "https://rpc2.example"],
    ["an IPv4 host", "https://192.0.2.1:8545/"],
    ["an inner hyphen and digits", "https://rpc-2.example2/base"],
  ])("accepts an RPC endpoint with %s, in both modes", (_what, url) => {
    expect(production({ rpc: [RPC1, url] })).toEqual([]);
    expect(staging({ rpc: [RPC1, url] })).toEqual([]);
  });

  it.each([
    [
      "PAGES_GAME_ORIGINS",
      "https://game.example https://game_2.example",
      "gameOrigins.1",
    ],
    ["PAGES_GAME_ORIGINS", "http://localhost:5173", "gameOrigins.0"],
    [
      "PAGES_OPERATOR_ORIGINS",
      "https://operator_1.example",
      "operatorOrigins.0",
    ],
    ["PAGES_OPERATOR_ORIGINS", "http://127.0.0.1:8080", "operatorOrigins.0"],
  ] as const)(
    "refuses an entry of %s the headers step would refuse, in both modes",
    (input, value, field) => {
      const overrides = { inputs: { [input]: value } };
      const refused = [`${input}: not-https-origin at ${field}`];
      expect(production(overrides)).toEqual(refused);
      expect(staging(overrides)).toEqual(refused);
    },
  );

  it("refuses a Wrapper origin the headers step would refuse, in both modes", () => {
    const overrides = {
      inputs: { PAGES_WRAPPER_ORIGIN: "https://wrapper_site.example" },
    };
    const refused = [
      "PAGES_WRAPPER_ORIGIN: not-https-origin at playApiBaseUrl",
    ];
    expect(production(overrides)).toEqual(refused);
    expect(staging(overrides)).toEqual(refused);
  });

  it("accepts origins with a port, and an empty operator list, in both modes", () => {
    const overrides = {
      inputs: {
        PAGES_WRAPPER_ORIGIN: "https://wrapper.example:8443",
        PAGES_GAME_ORIGINS: "https://game.example:8443",
        PAGES_OPERATOR_ORIGINS: "",
      },
    };
    expect(production(overrides)).toEqual([]);
    expect(staging(overrides)).toEqual([]);
  });

  it("names every problem at once, and never a value; staging's mode names the same but the environment", () => {
    const issues = production({
      pins: { environment: "preview" },
      rpc: ["https://RPC1.example/base", "https://rpc_2.example/base"],
      inputs: { PAGES_GAME_ORIGINS: "https://game_1.example" },
    });
    expect(issues).toEqual([
      "PAGES_CHAIN_PINS: not-production at environment",
      "PAGES_RPC_ENDPOINTS: not-https-origin at rpcEndpoints.base.0.url",
      "PAGES_RPC_ENDPOINTS: not-https-origin at rpcEndpoints.base.1.url",
      "PAGES_GAME_ORIGINS: not-https-origin at gameOrigins.0",
    ]);
    for (const issue of issues) expect(issue).not.toMatch(/example|https?:/u);
    expect(
      staging({
        pins: { environment: "preview" },
        rpc: ["https://RPC1.example/base", "https://rpc_2.example/base"],
        inputs: { PAGES_GAME_ORIGINS: "https://game_1.example" },
      }),
    ).toEqual(issues.slice(1));
  });
});

const SOLANA_RPC = ["https://sol1.example/browser-key", "https://sol2.example"];

/** The tool's inputs with a `solana` source on `cluster` beside `base`. */
const withSolana = (
  cluster: number,
  pins: Readonly<Record<string, unknown>> = {},
): PagesConfigInputs => {
  const urls = { base: RPC, solana: SOLANA_RPC };
  return {
    ...inputs({
      pins: {
        entropyChainKind: { base: "evm", solana: "solana" },
        entropyChainId: { base: 8453, solana: cluster },
        tipLagMargin: { base: 2, solana: 64 },
        ...pins,
      },
    }),
    PAGES_RPC_ENDPOINTS: JSON.stringify(
      Object.fromEntries(
        Object.entries(urls).map(([source, list]) => [
          source,
          list.map((url, index) => ({ provider: `p${String(index)}`, url })),
        ]),
      ),
    ),
    PAGES_RPC_ORIGINS: [...RPC, ...SOLANA_RPC]
      .map(url => new URL(url).origin)
      .join(" "),
  };
};

const solanaIssues = (
  productionMode: boolean,
  cluster: number,
  pins: Readonly<Record<string, unknown>> = {},
): readonly string[] => {
  const result = buildPagesConfigs(withSolana(cluster, pins), {
    production: productionMode,
  });
  return result.ok ? [] : result.issues;
};

describe("production's Solana cluster (production-cluster, the validators' rule)", () => {
  it("accepts a solana source on mainnet-beta beside an evm source, in both modes", () => {
    expect(solanaIssues(true, 101)).toEqual([]);
    expect(solanaIssues(false, 101)).toEqual([]);
  });

  it.each([102, 103])(
    "refuses a production document's solana source on cluster %i, in both modes, through the validator",
    cluster => {
      const refused = [
        "wrapper document: production-cluster at entropyChainId.solana",
        "verifier document: production-cluster at entropyChainId.solana",
      ];
      expect(solanaIssues(true, cluster)).toEqual(refused);
      expect(solanaIssues(false, cluster)).toEqual(refused);
    },
  );

  it.each([101, 102, 103])(
    "accepts a preview document with a solana source on cluster %i in staging's mode",
    cluster => {
      const pins = { environment: "preview", minRpcQuorum: 1 };
      expect(solanaIssues(false, cluster, pins)).toEqual([]);
    },
  );

  it("names the field, never a value", () => {
    const issues = solanaIssues(true, 103);
    expect(issues).not.toEqual([]);
    for (const issue of issues) expect(issue).not.toMatch(/103|example/u);
  });
});
