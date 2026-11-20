import { describe, expect, it } from "vitest";

import {
  type EnvironmentConfig,
  type EnvironmentConfigIssueCode,
  validateEnvironmentConfig,
} from "./environment-config.ts";
import {
  endpoints,
  environmentDocument,
  SE_ORIGIN,
} from "./fixtures/environment.ts";

const codes = (document: unknown): readonly EnvironmentConfigIssueCode[] => {
  const result = validateEnvironmentConfig(document, SE_ORIGIN);
  return result.ok ? [] : result.issues.map(issue => issue.code);
};

const accepted = (document: unknown): EnvironmentConfig => {
  const result = validateEnvironmentConfig(document, SE_ORIGIN);
  if (!result.ok) {
    throw new Error(result.issues.map(issue => issue.code).join(", "));
  }
  return result.config;
};

const solanaDocument = (cluster: number): Record<string, unknown> =>
  environmentDocument({
    rpcEndpoints: { solana: endpoints(2) },
    entropyChainKind: { solana: "solana" },
    entropyChainId: { solana: cluster },
    tipLagMargin: { solana: 64 },
  });

describe("the chain kind of each source", () => {
  it("refuses a document without it (the shell's rule)", () => {
    const document = environmentDocument();
    delete document["entropyChainKind"];
    expect(codes(document)).toEqual(["invalid-entropy-chain-kind"]);
  });

  it("accepts a production solana source on mainnet-beta", () => {
    expect(accepted(solanaDocument(101)).chain.sources["solana"]?.kind).toBe(
      "solana",
    );
  });

  it.each([102, 103])(
    "refuses a production solana source on cluster %i (the shell's rule)",
    cluster => {
      expect(codes(solanaDocument(cluster))).toEqual(["production-cluster"]);
    },
  );

  it.each([102, 103])(
    "accepts a preview solana source on cluster %i",
    cluster => {
      const document = { ...solanaDocument(cluster), environment: "preview" };
      expect(accepted(document).chain.sources["solana"]?.kind).toBe("solana");
    },
  );

  it("refuses a solana source on another chain (the shell's rule)", () => {
    expect(codes(solanaDocument(104))).toEqual(["entropy-chain-kind-mismatch"]);
  });
});
