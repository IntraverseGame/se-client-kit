// The shared cases of the chain kind (RFC-007 section 1): `entropyChainKind`,
// its cross-check with each source's key and `entropyChainId`, and the
// production cluster rule (`production-cluster`), run through
// both validators by `tools/config-parity.test.ts` with the other shared
// documents (V-3). A name starting "valid" is accepted by both.

import {
  type ConfigCase,
  configDocument,
  endpoints,
  OWN_ORIGIN,
  SOURCE,
} from "./config-documents.ts";

/** A valid production document whose one source is `solana`, on `cluster`. */
const solanaDocument = (
  cluster: number,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> =>
  configDocument({
    rpcEndpoints: { solana: endpoints(2) },
    entropyChainKind: { solana: "solana" },
    entropyChainId: { solana: cluster },
    tipLagMargin: { solana: 64 },
    ...overrides,
  });

/** A valid preview document with an `evm` and a `solana` source, as staging's. */
const stagingDocument = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> =>
  configDocument({
    environment: "preview",
    minRpcQuorum: 1,
    rpcEndpoints: {
      anvil: [{ provider: "p1", url: "https://rpc1.example/anvil" }],
      solana: endpoints(2),
    },
    entropyChainKind: { anvil: "evm", solana: "solana" },
    entropyChainId: { anvil: 50312, solana: 101 },
    tipLagMargin: { anvil: 100, solana: 64 },
    ...overrides,
  });

const DOCUMENTS: readonly (readonly [string, unknown])[] = [
  ["valid, a solana source on mainnet-beta", solanaDocument(101)],
  ...[101, 102, 103].map((cluster): readonly [string, unknown] => [
    `valid, a preview document with a solana source on cluster ${String(cluster)}`,
    solanaDocument(cluster, { environment: "preview" }),
  ]),
  ...[102, 103].map((cluster): readonly [string, unknown] => [
    `a production document with a solana source on cluster ${String(cluster)}`,
    solanaDocument(cluster),
  ]),
  ["valid, an evm and a solana source (staging's shape)", stagingDocument()],
  [
    "valid, a preview document with a solana source on mainnet-beta, quorum 1",
    solanaDocument(101, { environment: "preview", minRpcQuorum: 1 }),
  ],
  ["entropyChainKind absent", configDocument({ entropyChainKind: undefined })],
  [
    "entropyChainKind missing a source",
    configDocument({ entropyChainKind: {} }),
  ],
  [
    "entropyChainKind not an object",
    configDocument({ entropyChainKind: "evm" }),
  ],
  [
    "entropyChainKind for an unknown source",
    configDocument({ entropyChainKind: { [SOURCE]: "evm", other: "evm" } }),
  ],
  ...(["EVM", "Solana", "", 1, null] as const).map(
    (kind): readonly [string, unknown] => [
      `entropyChainKind ${JSON.stringify(kind)}`,
      configDocument({ entropyChainKind: { [SOURCE]: kind } }),
    ],
  ),
  ["a solana source on chain 100", solanaDocument(100)],
  ["a solana source on chain 104", solanaDocument(104)],
  ...[101, 102, 103].map((cluster): readonly [string, unknown] => [
    `an evm source on Solana cluster ${String(cluster)}`,
    configDocument({ entropyChainId: { [SOURCE]: cluster } }),
  ]),
  [
    "a solana source keyed otherwise",
    configDocument({
      entropyChainKind: { [SOURCE]: "solana" },
      entropyChainId: { [SOURCE]: 101 },
    }),
  ],
  [
    "a solana source keyed otherwise, its chain id refused",
    configDocument({
      entropyChainKind: { [SOURCE]: "solana" },
      entropyChainId: { [SOURCE]: 0 },
    }),
  ],
  [
    "a source keyed solana of kind evm",
    solanaDocument(1, { entropyChainKind: { solana: "evm" } }),
  ],
  [
    "a second solana source",
    solanaDocument(101, {
      rpcEndpoints: { solana: endpoints(2), testnet: endpoints(2) },
      entropyChainKind: { solana: "solana", testnet: "solana" },
      entropyChainId: { solana: 101, testnet: 102 },
      tipLagMargin: { solana: 64, testnet: 64 },
    }),
  ],
  [
    "an evm and a solana source, each on the other's chain",
    stagingDocument({ entropyChainId: { anvil: 101, solana: 50312 } }),
  ],
  [
    "an evm and a solana source, one below the quorum",
    stagingDocument({ minRpcQuorum: 2 }),
  ],
];

/** The chain kind's shared cases, each for a page at `OWN_ORIGIN`. */
export const CHAIN_KIND_DOCUMENTS: readonly ConfigCase[] = DOCUMENTS.map(
  ([name, document]) => ({ name, document, ownOrigin: OWN_ORIGIN }),
);
