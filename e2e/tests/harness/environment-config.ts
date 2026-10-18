// The environment configuration document the Wrapper reads at boot
// (specs/wrapper.md, Configuration). The release bundle is the same for every
// environment and does not hold this document; the SuperEngine side serves it.
// In the suite, the harness serves it, at the Wrapper's origin and the path the
// Wrapper reads, with values that point at the suite's own fake origins.
//
// Every value is public. The addresses are public development values, and
// every host is under the reserved `.test` domain, so nothing can resolve.

import type { BrowserContext } from "@playwright/test";

import { GAME_ORIGIN, WRAPPER_ORIGIN } from "./origins.ts";

/**
 * Where the Wrapper reads the document, relative to its page. PROVISIONAL, as
 * in the spec (TODO(hosting)): it moves when hosting decides the path.
 */
export const ENVIRONMENT_CONFIG_PATH = "/environment-config.json";

/** The entropy source the document configures. */
const SOURCE = "base";

/**
 * A valid `preview` document: the fake Play API at `playApiBaseUrl`, two RPC
 * endpoints of distinct providers (so `minRpcQuorum` is 2 and no degraded
 * indicator is shown), and one game origin. No page may embed the Wrapper.
 */
export const environmentConfig = (
  playApiBaseUrl: string,
): Readonly<Record<string, unknown>> => ({
  environment: "preview",
  playApiBaseUrl,
  verifyBaseUrl: "https://verify.e2e.test/",
  runtimeSigner: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
  registryDomain: {
    chainId: 31_337,
    verifyingContract: "0xd5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5",
  },
  rpcEndpoints: {
    [SOURCE]: [
      { provider: "p1", url: "https://rpc1.e2e.test/base" },
      { provider: "p2", url: "https://rpc2.e2e.test/base" },
    ],
  },
  entropyChainId: { [SOURCE]: 8453 },
  minRpcQuorum: 2,
  tipLagMargin: { [SOURCE]: 2 },
  gameOrigins: [GAME_ORIGIN],
  operatorOrigins: [],
});

/**
 * Serves `document` at the Wrapper's configuration path, with `Cache-Control:
 * no-store` like any token-free public document. Registered after the static
 * origin, so it takes that one path.
 */
export const serveEnvironmentConfig = async (
  context: BrowserContext,
  document: Readonly<Record<string, unknown>>,
): Promise<void> => {
  await context.route(`${WRAPPER_ORIGIN}${ENVIRONMENT_CONFIG_PATH}`, route =>
    route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
      body: JSON.stringify(document),
    }),
  );
};

/** What a round configuration pins, from the round's `CreateRoundAuth`. */
export type RoundPins = {
  /** The round's `CreateRoundAuth` signer: the configuration's `runtimeSigner`. */
  readonly signer: string;
  readonly domain: {
    readonly chainId: number;
    readonly verifyingContract: string;
  };
  /** The round's `proofs.randomnessProof.source`. */
  readonly source: string;
  readonly entropyChainId: number;
};

/** The round configuration's two RPC endpoints, each its own provider. */
export const ROUND_RPC_ENDPOINTS: readonly {
  readonly provider: string;
  readonly url: string;
}[] = [
  { provider: "p1", url: "https://rpc1.e2e.test/round" },
  { provider: "p2", url: "https://rpc2.e2e.test/round" },
];

/**
 * A valid `preview` document that pins `pins`, the vendored round's signer,
 * domain, and entropy source (round-play.ts), so a round of the session's own
 * key passes W-26's checks 1 to 5; the tip check (W-26b) goes to the fake RPC
 * endpoints (fake-rpc.ts), with a quorum of 2 and a lag margin of 2.
 */
export const roundEnvironmentConfig = (
  playApiBaseUrl: string,
  pins: RoundPins,
): Readonly<Record<string, unknown>> => ({
  ...environmentConfig(playApiBaseUrl),
  runtimeSigner: pins.signer,
  registryDomain: pins.domain,
  rpcEndpoints: { [pins.source]: ROUND_RPC_ENDPOINTS },
  entropyChainId: { [pins.source]: pins.entropyChainId },
  tipLagMargin: { [pins.source]: 2 },
});
