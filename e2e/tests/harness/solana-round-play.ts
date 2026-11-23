import {
  evmSolanaEnvironmentConfig,
  ROUND_RPC_ENDPOINTS,
  serveEnvironmentConfig,
  SOLANA_LAG_MARGIN,
  SOLANA_RPC_ENDPOINTS,
  solanaEnvironmentConfig,
} from "./environment-config.ts";
import { createFakeRpc, type FakeRpc } from "./fake-rpc.ts";
import { createFakeSolanaRpc, type FakeSolanaRpc } from "./fake-solana-rpc.ts";
import { WRAPPER_ORIGIN } from "./origins.ts";
import { expect, roundSession } from "./round-play.ts";
import { ROUND, ROUND_PINS } from "./round-vector.ts";
import { type SolanaCase, solanaLedger } from "./solana-ledger.ts";
import { solanaPins } from "./solana-round.ts";

export type SolanaDocument = "solana-only" | "evm-and-solana";

type SolanaOptions = {
  readonly solanaDocument: SolanaDocument;
  readonly solanaCase: SolanaCase;
};

type SolanaFixtures = {
  readonly fakeSolanaRpc: FakeSolanaRpc;
  readonly fakeEvmRpc: FakeRpc;
};

export const test = roundSession.extend<SolanaOptions & SolanaFixtures>({
  solanaDocument: ["solana-only", { option: true }],
  solanaCase: ["produced-slot", { option: true }],

  fakeSolanaRpc: [
    async (
      { context, hermetic: _guard, playApiBaseUrl, solanaDocument, solanaCase },
      use,
    ) => {
      await serveEnvironmentConfig(
        context,
        solanaDocument === "solana-only"
          ? solanaEnvironmentConfig(playApiBaseUrl, solanaPins())
          : evmSolanaEnvironmentConfig(playApiBaseUrl, ROUND_PINS),
      );
      const rpc = createFakeSolanaRpc({
        endpoints: SOLANA_RPC_ENDPOINTS,
        ledger: solanaLedger(solanaCase),
        lagMargin: BigInt(SOLANA_LAG_MARGIN),
        allowOrigin: WRAPPER_ORIGIN,
      });
      await rpc.install(context);
      await use(rpc);
      expect(
        rpc.unexpected(),
        "calls the fake Solana RPC did not know",
      ).toEqual([]);
    },
    { auto: true },
  ],

  fakeEvmRpc: [
    async ({ context, hermetic: _guard, fakeSolanaRpc: _solana }, use) => {
      const rpc = createFakeRpc({
        endpoints: ROUND_RPC_ENDPOINTS,
        chainId: BigInt(ROUND_PINS.entropyChainId),
        blockNumber: ROUND.blockNumber,
        allowOrigin: WRAPPER_ORIGIN,
      });
      await rpc.install(context);
      await use(rpc);
      expect(rpc.unexpected(), "calls the fake RPC did not know").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
