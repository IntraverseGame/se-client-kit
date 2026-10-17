// Test-only: environment configuration documents for the chain checks. The
// addresses are the signing vectors' public development values; the URLs are
// reserved example hosts that nothing resolves (no request is ever sent).

import {
  type ChainConfig,
  type ChainConfigIssue,
  type ChainConfigIssueCode,
  validateChainConfig,
} from "../chain-config.ts";

export const SIGNER = "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e";
export const REGISTRY = "0xd5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5";
export const SOURCE = "base";
/** The chain id the fixture document pins for `SOURCE`. */
export const ENTROPY_CHAIN_ID = 8453;

/** `count` endpoints of `SOURCE`, providers `p1` to `p<count>`. */
export const endpoints = (
  count: number,
): readonly { provider: string; url: string }[] =>
  Array.from({ length: count }, (_, i) => ({
    provider: `p${i + 1}`,
    url: `https://rpc${i + 1}.example/base`,
  }));

/**
 * A production document with three endpoints, the source's chain pinned, and a
 * margin of 2 blocks.
 */
export const configDocument = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  environment: "production",
  playApiBaseUrl: "https://play.example/play/v1",
  runtimeSigner: SIGNER,
  registryDomain: { chainId: 31337, verifyingContract: REGISTRY },
  rpcEndpoints: { [SOURCE]: endpoints(3) },
  entropyChainId: { [SOURCE]: ENTROPY_CHAIN_ID },
  minRpcQuorum: 2,
  tipLagMargin: { [SOURCE]: 2 },
  ...overrides,
});

/** A document's issues; empty when it is accepted. */
export const issuesOf = (document: unknown): readonly ChainConfigIssue[] => {
  const result = validateChainConfig(document);
  return result.ok ? [] : result.issues;
};

/** A document's issue codes; empty when it is accepted. */
export const issueCodes = (
  document: unknown,
): readonly ChainConfigIssueCode[] =>
  issuesOf(document).map(issue => issue.code);

/** A document validated, or a thrown error naming the issues. */
export const accepted = (document: unknown): ChainConfig => {
  const result = validateChainConfig(document);
  if (!result.ok) {
    throw new Error(
      `fixture refused: ${result.issues.map(i => i.code).join(", ")}`,
    );
  }
  return result.config;
};

/** A validated configuration from the fixture document with `overrides`. */
export const chainConfig = (
  overrides: Readonly<Record<string, unknown>> = {},
): ChainConfig => accepted(configDocument(overrides));
