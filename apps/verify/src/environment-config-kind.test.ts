import { describe, expect, it } from "vitest";

import type { ConfigIssue } from "./environment-config.ts";
import {
  accepted,
  endpoints,
  environmentDocument,
  issues,
  SOURCE,
} from "./fixtures/environment.ts";
import { SOLANA_GENESIS_HASHES } from "./solana-clusters.ts";

const solanaDocument = (
  cluster: number,
  environment = "preview",
): Record<string, unknown> =>
  environmentDocument({
    environment,
    rpcEndpoints: { solana: endpoints(2) },
    entropyChainKind: { solana: "solana" },
    entropyChainId: { solana: cluster },
    tipLagMargin: { solana: 64 },
  });

describe("the chain kind of each entropy source", () => {
  it.each<[string, Record<string, unknown>, ConfigIssue]>([
    [
      "a kind that is not evm or solana",
      { entropyChainKind: { [SOURCE]: "Solana" } },
      {
        code: "invalid-entropy-chain-kind",
        field: `entropyChainKind.${SOURCE}`,
      },
    ],
    [
      "an evm source on a Solana cluster number",
      { entropyChainId: { [SOURCE]: 101 } },
      {
        code: "entropy-chain-kind-mismatch",
        field: `entropyChainKind.${SOURCE}`,
      },
    ],
  ])("refuses %s", (_, overrides, issue) => {
    expect(issues(environmentDocument(overrides))).toEqual([issue]);
  });

  it.each([101, 102, 103])(
    "pins cluster %i's genesis hash on a solana source",
    cluster => {
      const config = accepted(solanaDocument(cluster));
      expect(config.sources).toEqual({
        solana: {
          kind: "solana",
          chainId: cluster,
          genesisHash: SOLANA_GENESIS_HASHES.get(cluster),
          endpoints: endpoints(2),
        },
      });
      expect(Object.isFrozen(config.sources["solana"])).toBe(true);
    },
  );

  it("accepts an evm and a solana source in one preview document", () => {
    const config = accepted(
      environmentDocument({
        environment: "preview",
        minRpcQuorum: 1,
        rpcEndpoints: { anvil: endpoints(1), solana: endpoints(2) },
        entropyChainKind: { anvil: "evm", solana: "solana" },
        entropyChainId: { anvil: 50312, solana: 101 },
        tipLagMargin: { anvil: 100, solana: 64 },
      }),
    );
    expect(config.sources["anvil"]?.kind).toBe("evm");
    expect(config.sources["solana"]?.kind).toBe("solana");
  });
});

describe("production's Solana cluster (production-cluster)", () => {
  it("accepts a production solana source on mainnet-beta", () => {
    expect(issues(solanaDocument(101, "production"))).toEqual([]);
  });

  it.each([102, 103])(
    "refuses a production solana source on cluster %i, at its chain id",
    cluster => {
      expect(issues(solanaDocument(cluster, "production"))).toEqual([
        { code: "production-cluster", field: "entropyChainId.solana" },
      ]);
    },
  );
});
