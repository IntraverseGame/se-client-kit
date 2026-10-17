// Test-only: environment configuration documents. The addresses are the
// signing vectors' public development values; the hosts are reserved example
// names that nothing resolves (no request is ever sent).

export const SOURCE = "base";

/** `count` endpoints of `SOURCE`, each with its own provider. */
export const endpoints = (
  count: number,
  host = "rpc",
): readonly { provider: string; url: string }[] =>
  Array.from({ length: count }, (_, i) => ({
    provider: `p${i + 1}`,
    url: `https://${host}${i + 1}.example/base`,
  }));

/** A valid production document with two endpoints, and `overrides`. */
export const environmentDocument = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  environment: "production",
  playApiBaseUrl: "https://se.example/play/v1",
  verifyBaseUrl: "https://verify.example/",
  runtimeSigner: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
  registryDomain: {
    chainId: 31337,
    verifyingContract: "0xd5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5",
  },
  rpcEndpoints: { [SOURCE]: endpoints(2) },
  entropyChainId: { [SOURCE]: 8453 },
  minRpcQuorum: 2,
  tipLagMargin: { [SOURCE]: 2 },
  gameOrigins: ["https://game.example"],
  operatorOrigins: ["https://operator.example"],
  ...overrides,
});

/** A local document with one node (`minRpcQuorum` 1). */
export const localDocument = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> =>
  environmentDocument({
    environment: "local",
    playApiBaseUrl: "http://localhost:8080/play/v1",
    verifyBaseUrl: "http://localhost:8081/",
    minRpcQuorum: 1,
    rpcEndpoints: {
      [SOURCE]: [{ provider: "anvil", url: "http://localhost:8545" }],
    },
    gameOrigins: ["http://127.0.0.1:5174"],
    operatorOrigins: [],
    ...overrides,
  });
