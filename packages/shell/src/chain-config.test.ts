// T-8a (configuration) and W-26a's boot rule: the chain part of the
// environment configuration is validated before the Wrapper starts. The shapes
// of each field are in chain-config-shapes.test.ts.

import { describe, expect, it } from "vitest";

import { DEFAULT_MIN_RPC_QUORUM } from "./chain-config.ts";
import {
  accepted,
  configDocument,
  endpoints,
  issueCodes,
  issuesOf,
  REGISTRY,
  SIGNER,
  SOURCE,
} from "./fixtures/chain-config.ts";

const local = (environment: string): Record<string, unknown> =>
  configDocument({
    environment,
    minRpcQuorum: 1,
    rpcEndpoints: {
      [SOURCE]: [{ provider: "anvil", url: "http://localhost:8545" }],
    },
  });

describe("validateChainConfig", () => {
  it("accepts a production document and returns it typed and frozen", () => {
    const config = accepted(configDocument());
    expect(config.environment).toBe("production");
    expect(config.runtimeSigner).toBe(SIGNER);
    expect(config.registryDomain).toEqual({
      chainId: 31337n,
      verifyingContract: REGISTRY,
    });
    expect(config.minRpcQuorum).toBe(2);
    expect(config.degraded).toBe(false);
    expect(config.sources[SOURCE]?.tipLagMargin).toBe(2n);
    expect(config.sources[SOURCE]?.endpoints).toEqual(endpoints(3));
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.sources)).toBe(true);
    expect(Object.isFrozen(config.sources[SOURCE]?.endpoints)).toBe(true);
    expect(Object.isFrozen(config.registryDomain)).toBe(true);
  });

  it("defaults minRpcQuorum to 2", () => {
    const document = configDocument();
    delete document["minRpcQuorum"];
    expect(DEFAULT_MIN_RPC_QUORUM).toBe(2);
    expect(accepted(document).minRpcQuorum).toBe(DEFAULT_MIN_RPC_QUORUM);
  });

  it("lowercases the pinned addresses", () => {
    const config = accepted(
      configDocument({
        runtimeSigner: SIGNER.replace("0x5e", "0x5E"),
        registryDomain: {
          chainId: 1,
          verifyingContract: `0x${REGISTRY.slice(2).toUpperCase()}`,
        },
      }),
    );
    expect(config.runtimeSigner).toBe(SIGNER);
    expect(config.registryDomain.verifyingContract).toBe(REGISTRY);
  });

  it("ignores the fields of the document it does not read", () => {
    expect(issueCodes(configDocument({ gameOrigins: "anything" }))).toEqual([]);
  });

  describe("the boot rule (W-26a)", () => {
    it("refuses production with minRpcQuorum below 2", () => {
      expect(issuesOf(configDocument({ minRpcQuorum: 1 }))).toEqual([
        { code: "production-quorum", field: "minRpcQuorum" },
      ]);
    });

    it.each(["local", "preview"])(
      "accepts %s with minRpcQuorum 1 and one endpoint, as degraded",
      environment => {
        expect(accepted(local(environment)).degraded).toBe(true);
      },
    );

    it.each(["local", "preview"])(
      "does not flag %s with a quorum of 2 as degraded",
      environment => {
        expect(accepted(configDocument({ environment })).degraded).toBe(false);
      },
    );
  });

  describe("independence (W-26b)", () => {
    it("refuses two endpoints of one source that share a provider", () => {
      const rpcEndpoints = {
        [SOURCE]: [
          { provider: "p1", url: "https://a.example/" },
          { provider: "p2", url: "https://b.example/" },
          { provider: "p1", url: "https://c.example/" },
        ],
      };
      expect(issuesOf(configDocument({ rpcEndpoints }))).toEqual([
        { code: "shared-provider", field: "rpcEndpoints.base" },
      ]);
    });

    it("compares provider names without case", () => {
      const rpcEndpoints = {
        [SOURCE]: [
          { provider: "Acme", url: "https://a.example/" },
          { provider: "acme", url: "https://b.example/" },
        ],
      };
      expect(issueCodes(configDocument({ rpcEndpoints }))).toEqual([
        "shared-provider",
      ]);
    });

    it("refuses one URL listed under two provider names", () => {
      const rpcEndpoints = {
        [SOURCE]: [
          { provider: "p1", url: "https://a.example/rpc" },
          { provider: "p2", url: "https://a.example/rpc" },
        ],
      };
      expect(issueCodes(configDocument({ rpcEndpoints }))).toEqual([
        "shared-provider",
      ]);
    });

    it("allows one provider on two different sources", () => {
      const document = configDocument({
        rpcEndpoints: { [SOURCE]: endpoints(2), other: endpoints(2) },
        tipLagMargin: { [SOURCE]: 2, other: 5 },
      });
      expect(accepted(document).sources["other"]?.tipLagMargin).toBe(5n);
    });

    it("refuses a source with fewer endpoints than minRpcQuorum", () => {
      const document = configDocument({
        minRpcQuorum: 3,
        rpcEndpoints: { [SOURCE]: endpoints(3), other: endpoints(2) },
        tipLagMargin: { [SOURCE]: 2, other: 2 },
      });
      expect(issuesOf(document)).toEqual([
        { code: "quorum-unreachable", field: "rpcEndpoints.other" },
      ]);
    });
  });

  describe("the lag margin (provisional, no default)", () => {
    it("is required for every source", () => {
      expect(issuesOf(configDocument({ tipLagMargin: {} }))).toEqual([
        { code: "invalid-lag-margin", field: "tipLagMargin.base" },
      ]);
      const document = configDocument();
      delete document["tipLagMargin"];
      expect(issuesOf(document)).toEqual([
        { code: "invalid-lag-margin", field: "tipLagMargin" },
      ]);
    });

    it("accepts 0", () => {
      const config = accepted(
        configDocument({ tipLagMargin: { [SOURCE]: 0 } }),
      );
      expect(config.sources[SOURCE]?.tipLagMargin).toBe(0n);
    });

    it("refuses a margin for a source with no endpoints", () => {
      const document = configDocument({
        tipLagMargin: { [SOURCE]: 2, other: 2 },
      });
      expect(issuesOf(document)).toEqual([
        { code: "invalid-lag-margin", field: "tipLagMargin.other" },
      ]);
    });
  });
});
