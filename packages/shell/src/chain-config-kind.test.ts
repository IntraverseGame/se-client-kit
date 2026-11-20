import { describe, expect, it } from "vitest";

import {
  accepted,
  configDocument,
  ENTROPY_CHAIN_ID,
  endpoints,
  issuesOf,
  SOURCE,
} from "./fixtures/chain-config.ts";
import { SOLANA_GENESIS_HASHES } from "./solana-clusters.ts";

const mismatch = (source: string): { code: string; field: string } => ({
  code: "entropy-chain-kind-mismatch",
  field: `entropyChainKind.${source}`,
});

const solanaDocument = (
  cluster: unknown,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> =>
  configDocument({
    rpcEndpoints: { solana: endpoints(2) },
    entropyChainKind: { solana: "solana" },
    entropyChainId: { solana: cluster },
    tipLagMargin: { solana: 64 },
    ...overrides,
  });

const stagingDocument = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> =>
  configDocument({
    environment: "preview",
    minRpcQuorum: 1,
    rpcEndpoints: {
      anvil: [{ provider: "p1", url: "https://rpc1.example/anvil" }],
      solana: [{ provider: "p2", url: "https://rpc2.example/solana" }],
    },
    entropyChainKind: { anvil: "evm", solana: "solana" },
    entropyChainId: { anvil: 50312, solana: 101 },
    tipLagMargin: { anvil: 100, solana: 64 },
    ...overrides,
  });

describe("the chain kind of each entropy source", () => {
  it("is required for every source", () => {
    expect(issuesOf(configDocument({ entropyChainKind: {} }))).toEqual([
      { code: "invalid-entropy-chain-kind", field: "entropyChainKind.base" },
    ]);
    const document = configDocument();
    delete document["entropyChainKind"];
    expect(issuesOf(document)).toEqual([
      { code: "invalid-entropy-chain-kind", field: "entropyChainKind" },
    ]);
  });

  it.each([[["evm"]], ["evm"], [null]])("refuses a map that is %j", map => {
    expect(issuesOf(configDocument({ entropyChainKind: map }))).toEqual([
      { code: "invalid-entropy-chain-kind", field: "entropyChainKind" },
    ]);
  });

  it("refuses a kind for a source with no endpoints", () => {
    const document = configDocument({
      entropyChainKind: { [SOURCE]: "evm", other: "evm" },
    });
    expect(issuesOf(document)).toEqual([
      { code: "invalid-entropy-chain-kind", field: "entropyChainKind.other" },
    ]);
  });

  it.each(["EVM", "Solana", "", "ethereum", 1, null, true, ["evm"]])(
    "refuses the kind %j",
    kind => {
      expect(
        issuesOf(configDocument({ entropyChainKind: { [SOURCE]: kind } })),
      ).toEqual([
        { code: "invalid-entropy-chain-kind", field: "entropyChainKind.base" },
      ]);
    },
  );

  it("pins an evm source with no genesis hash", () => {
    const source = accepted(configDocument()).sources[SOURCE];
    expect(source).toEqual({
      kind: "evm",
      chainId: BigInt(ENTROPY_CHAIN_ID),
      endpoints: endpoints(3),
      tipLagMargin: 2n,
    });
    expect(Object.isFrozen(source)).toBe(true);
  });

  it.each([101, 102, 103])(
    "pins cluster %i's genesis hash on a solana source",
    cluster => {
      const document = solanaDocument(cluster, { environment: "preview" });
      const source = accepted(document).sources["solana"];
      expect(source).toEqual({
        kind: "solana",
        chainId: BigInt(cluster),
        genesisHash: SOLANA_GENESIS_HASHES.get(BigInt(cluster)),
        endpoints: endpoints(2),
        tipLagMargin: 64n,
      });
      expect(Object.isFrozen(source)).toBe(true);
    },
  );

  it.each([100, 104, 1, 8453])(
    "refuses a solana source on chain %i",
    cluster => {
      expect(issuesOf(solanaDocument(cluster))).toEqual([mismatch("solana")]);
    },
  );

  it.each([101, 102, 103])(
    "refuses an evm source on Solana cluster %i",
    cluster => {
      expect(
        issuesOf(configDocument({ entropyChainId: { [SOURCE]: cluster } })),
      ).toEqual([mismatch(SOURCE)]);
    },
  );

  it("refuses a solana source keyed otherwise", () => {
    const document = configDocument({
      entropyChainKind: { [SOURCE]: "solana" },
      entropyChainId: { [SOURCE]: 101 },
    });
    expect(issuesOf(document)).toEqual([mismatch(SOURCE)]);
  });

  it("refuses a source keyed solana of kind evm", () => {
    const document = solanaDocument(ENTROPY_CHAIN_ID, {
      entropyChainKind: { solana: "evm" },
    });
    expect(issuesOf(document)).toEqual([mismatch("solana")]);
  });

  it("checks the name when the chain id is refused, and the chain only when it is valid", () => {
    const misnamed = configDocument({
      entropyChainKind: { [SOURCE]: "solana" },
      entropyChainId: { [SOURCE]: 0 },
    });
    expect(issuesOf(misnamed)).toEqual([
      { code: "invalid-entropy-chain-id", field: "entropyChainId.base" },
      mismatch(SOURCE),
    ]);
    expect(issuesOf(solanaDocument(0))).toEqual([
      { code: "invalid-entropy-chain-id", field: "entropyChainId.solana" },
    ]);
  });

  it("names the field, never a value", () => {
    const issues = JSON.stringify([
      ...issuesOf(configDocument({ entropyChainKind: { [SOURCE]: "k-text" } })),
      ...issuesOf(solanaDocument(104)),
    ]);
    expect(issues).not.toContain("k-text");
    expect(issues).not.toContain("104");
  });
});

describe("several entropy sources of either kind", () => {
  it("accepts staging's shape: an evm and a solana source", () => {
    const config = accepted(stagingDocument());
    expect(config.degraded).toBe(true);
    expect(config.sources["anvil"]).toEqual({
      kind: "evm",
      chainId: 50312n,
      endpoints: [{ provider: "p1", url: "https://rpc1.example/anvil" }],
      tipLagMargin: 100n,
    });
    expect(config.sources["solana"]).toEqual({
      kind: "solana",
      chainId: 101n,
      genesisHash: SOLANA_GENESIS_HASHES.get(101n),
      endpoints: [{ provider: "p2", url: "https://rpc2.example/solana" }],
      tipLagMargin: 64n,
    });
  });

  it("holds each source to its own kind's rules", () => {
    const document = stagingDocument({
      entropyChainId: { anvil: 101, solana: 50312 },
    });
    expect(issuesOf(document)).toEqual([mismatch("anvil"), mismatch("solana")]);
  });

  it("refuses a source with fewer endpoints than minRpcQuorum, at that source", () => {
    const document = stagingDocument({
      minRpcQuorum: 2,
      rpcEndpoints: {
        anvil: [{ provider: "p1", url: "https://rpc1.example/anvil" }],
        solana: endpoints(2),
      },
    });
    expect(issuesOf(document)).toEqual([
      { code: "quorum-unreachable", field: "rpcEndpoints.anvil" },
    ]);
  });

  it("refuses a second solana source", () => {
    const document = solanaDocument(101, {
      environment: "preview",
      rpcEndpoints: { solana: endpoints(2), testnet: endpoints(2) },
      entropyChainKind: { solana: "solana", testnet: "solana" },
      entropyChainId: { solana: 101, testnet: 102 },
      tipLagMargin: { solana: 64, testnet: 64 },
    });
    expect(issuesOf(document)).toEqual([mismatch("testnet")]);
  });
});

describe("production's Solana cluster (production-cluster)", () => {
  const offCluster = {
    code: "production-cluster",
    field: "entropyChainId.solana",
  };

  it("accepts a production document's solana source on mainnet-beta", () => {
    expect(accepted(solanaDocument(101)).sources["solana"]?.chainId).toBe(101n);
  });

  it.each([102, 103])(
    "refuses a production document's solana source on cluster %i, at its chain id",
    cluster => {
      expect(issuesOf(solanaDocument(cluster))).toEqual([offCluster]);
    },
  );

  it.each(
    (["preview", "local"] as const).flatMap(environment =>
      [101, 102, 103].map(cluster => [environment, cluster] as const),
    ),
  )(
    "accepts a %s document's solana source on cluster %i",
    (environment, cluster) => {
      expect(
        accepted(solanaDocument(cluster, { environment })).sources["solana"]
          ?.kind,
      ).toBe("solana");
    },
  );

  it("leaves a mismatched source to the cross-check alone", () => {
    expect(issuesOf(solanaDocument(104))).toEqual([mismatch("solana")]);
  });

  it("names the field, never a value", () => {
    expect(JSON.stringify(issuesOf(solanaDocument(103)))).not.toContain("103");
  });
});
