// Test-only: environment configuration documents for the verify page, the same
// shape as the Wrapper's fixtures. The addresses are the signing vectors'
// public development values; the hosts are reserved example names that
// nothing resolves (no request is ever sent).

import {
  type ConfigIssue,
  validateEnvironmentConfig,
  type VerifyConfig,
} from "../environment-config.ts";

export const SOURCE = "base";

/** The page's own origin, the Wrapper's origin. */
export const OWN_ORIGIN = "https://se.example";

/** `count` endpoints of `SOURCE`, each with its own provider. */
export const endpoints = (
  count: number,
): readonly { provider: string; url: string }[] =>
  Array.from({ length: count }, (_, i) => ({
    provider: `p${String(i + 1)}`,
    url: `https://rpc${String(i + 1)}.example/base`,
  }));

/** A valid production document with two endpoints, and `overrides`. */
export const environmentDocument = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  environment: "production",
  playApiBaseUrl: "https://se.example/play/v1",
  verifyBaseUrl: "https://se.example/verify",
  verifyApiBaseUrl: "https://se.example/verify/v1",
  runtimeSigner: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  registryDomain: {
    chainId: 31337,
    verifyingContract: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
  },
  rpcEndpoints: { [SOURCE]: endpoints(2) },
  entropyChainKind: { [SOURCE]: "evm" },
  entropyChainId: { [SOURCE]: 8453 },
  minRpcQuorum: 2,
  tipLagMargin: { [SOURCE]: 2 },
  gameOrigins: ["https://game.example"],
  operatorOrigins: ["https://operator.example"],
  ...overrides,
});

/** A document validated for a page at `ownOrigin`, or a thrown refusal. */
export const accepted = (
  document: unknown,
  ownOrigin: string = OWN_ORIGIN,
): VerifyConfig => {
  const result = validateEnvironmentConfig(document, ownOrigin);
  if (!result.ok) {
    throw new TypeError(`refused: ${JSON.stringify(result.issues)}`);
  }
  return result.config;
};

/** A document's issues for a page at `ownOrigin`; empty when accepted. */
export const issues = (
  document: unknown,
  ownOrigin: string = OWN_ORIGIN,
): readonly ConfigIssue[] => {
  const result = validateEnvironmentConfig(document, ownOrigin);
  return result.ok ? [] : result.issues;
};

/** A document's issue codes for a page at `ownOrigin`. */
export const codes = (
  document: unknown,
  ownOrigin: string = OWN_ORIGIN,
): string[] => issues(document, ownOrigin).map(issue => issue.code);
