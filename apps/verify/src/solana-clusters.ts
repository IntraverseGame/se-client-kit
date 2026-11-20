// A Solana cluster is identified by its genesis hash, the same in every
// environment, so the kit pins it in code by the cluster number the backend
// reserves for it, never in configuration (RFC-007 section 2, ADR-013). The
// page cannot import the shell's table (D-2), so it holds the same one;
// tools/solana-clusters.test.ts holds both to the shell spec's.

/**
 * Each Solana cluster's genesis hash (base58, as `getGenesisHash` returns it)
 * by its cluster number: 101 mainnet-beta, 102 testnet, 103 devnet. Only these
 * numbers may pin a `solana` source, and no `evm` source may use one.
 */
export const SOLANA_GENESIS_HASHES: ReadonlyMap<number, string> = new Map([
  [101, "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"],
  [102, "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY"],
  [103, "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"],
]);
