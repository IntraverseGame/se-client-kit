// One shared set of environment configuration documents (V-3: the verify page
// and the Wrapper read the same document with the same schema). Each is run
// through both validators by `tools/config-parity.test.ts`. The hosts are
// reserved example names; the addresses are the signing vectors' public
// development values.

export const OWN_ORIGIN = "https://se.example";

const SOURCE = "ethereum:block";

const endpoints = (count: number): { provider: string; url: string }[] =>
  Array.from({ length: count }, (_, i) => ({
    provider: `p${i + 1}`,
    url: `https://rpc${i + 1}.example/eth`,
  }));

/** A valid production document, with `overrides` (`undefined` drops a field). */
export const configDocument = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => {
  const document: Record<string, unknown> = {
    environment: "production",
    playApiBaseUrl: `${OWN_ORIGIN}/play/v1`,
    verifyBaseUrl: `${OWN_ORIGIN}/verify`,
    verifyApiBaseUrl: `${OWN_ORIGIN}/verify/v1`,
    runtimeSigner: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
    registryDomain: {
      chainId: 31337,
      verifyingContract: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
    },
    rpcEndpoints: { [SOURCE]: endpoints(2) },
    entropyChainId: { [SOURCE]: 1 },
    minRpcQuorum: 2,
    tipLagMargin: { [SOURCE]: 2 },
    gameOrigins: ["https://game.example"],
    operatorOrigins: ["https://operator.example"],
    ...overrides,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete document[key];
  }
  return document;
};

/** Named documents, valid and not, that both validators must judge alike. */
export const CONFIG_DOCUMENTS: readonly (readonly [string, unknown])[] = [
  ["valid production", configDocument()],
  [
    "valid local, one loopback node, quorum 1",
    configDocument({
      environment: "local",
      playApiBaseUrl: "http://localhost:8080/play/v1",
      verifyBaseUrl: "http://localhost:8080/verify",
      verifyApiBaseUrl: "http://localhost:8080/verify/v1",
      rpcEndpoints: {
        [SOURCE]: [{ provider: "anvil", url: "http://127.0.0.1:8545" }],
      },
      minRpcQuorum: 1,
    }),
  ],
  ["valid, minRpcQuorum absent", configDocument({ minRpcQuorum: undefined })],
  ["valid, no operator origins", configDocument({ operatorOrigins: [] })],
  ["not an object", "text"],
  ["null", null],
  ["an unknown field", configDocument({ extra: 1 })],
  ["environment unknown", configDocument({ environment: "staging" })],
  [
    "runtimeSigner the zero address",
    configDocument({ runtimeSigner: `0x${"0".repeat(40)}` }),
  ],
  [
    "registryDomain without a contract",
    configDocument({ registryDomain: { chainId: 31337 } }),
  ],
  ["minRpcQuorum 0", configDocument({ minRpcQuorum: 0 })],
  ["production with quorum 1", configDocument({ minRpcQuorum: 1 })],
  ["quorum above the endpoints", configDocument({ minRpcQuorum: 3 })],
  ["no endpoints", configDocument({ rpcEndpoints: {} })],
  [
    "endpoint over plain http on a public host",
    configDocument({
      rpcEndpoints: {
        [SOURCE]: [
          endpoints(1)[0],
          { provider: "p2", url: "http://rpc2.example/eth" },
        ],
      },
    }),
  ],
  [
    "two endpoints of one provider",
    configDocument({
      rpcEndpoints: {
        [SOURCE]: [
          { provider: "p1", url: "https://rpc1.example/eth" },
          { provider: "P1", url: "https://rpc2.example/eth" },
        ],
      },
    }),
  ],
  ["entropyChainId missing a source", configDocument({ entropyChainId: {} })],
  ["entropyChainId 0", configDocument({ entropyChainId: { [SOURCE]: 0 } })],
  [
    "tipLagMargin for an unknown source",
    configDocument({ tipLagMargin: { [SOURCE]: 2, other: 1 } }),
  ],
  [
    "playApiBaseUrl without /play/v1",
    configDocument({ playApiBaseUrl: `${OWN_ORIGIN}/api` }),
  ],
  [
    "playApiBaseUrl with a query",
    configDocument({ playApiBaseUrl: `${OWN_ORIGIN}/play/v1?a=1` }),
  ],
  ["verifyBaseUrl not a URL", configDocument({ verifyBaseUrl: "verify" })],
  ["verifyApiBaseUrl absent", configDocument({ verifyApiBaseUrl: undefined })],
  [
    "verifyApiBaseUrl with a trailing slash",
    configDocument({ verifyApiBaseUrl: `${OWN_ORIGIN}/verify/v1/` }),
  ],
  [
    "verifyApiBaseUrl over http on a public host",
    configDocument({ verifyApiBaseUrl: "http://se.example/verify/v1" }),
  ],
  ["no game origins", configDocument({ gameOrigins: [] })],
  [
    "a game origin with a path",
    configDocument({ gameOrigins: ["https://game.example/x"] }),
  ],
  ["the own origin as a game", configDocument({ gameOrigins: [OWN_ORIGIN] })],
  [
    "an origin both operator and game",
    configDocument({ operatorOrigins: ["https://game.example"] }),
  ],
];
