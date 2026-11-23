import type { Page } from "@playwright/test";

import {
  evmSolanaEnvironmentConfig,
  ROUND_RPC_ENDPOINTS,
  serveEnvironmentConfig,
  SOLANA_CLUSTER,
  SOLANA_LAG_MARGIN,
  SOLANA_RPC_ENDPOINTS,
  SOLANA_SOURCE,
  solanaEnvironmentConfig,
} from "./environment-config.ts";
import { createFakeSolanaRpc, type FakeSolanaRpc } from "./fake-solana-rpc.ts";
import { WRAPPER_ORIGIN } from "./origins.ts";
import { ROUND_PINS } from "./round-vector.ts";
import { type SolanaCase, solanaLedger } from "./solana-ledger.ts";
import { solanaPins } from "./solana-round.ts";
import { type BookEnding, bookRound } from "./verify-book-rounds.ts";
import {
  expect,
  serveVerifyPage,
  test as verifyTest,
  VERIFY_BASE_URL,
  verifyPolicyHeaders,
} from "./verify-page.ts";

export type VerifySolanaDocument = "solana-only" | "evm-and-solana";

type VerifySolanaOptions = {
  readonly solanaCase: SolanaCase;
  readonly solanaDocument: VerifySolanaDocument;
};

type VerifySolanaFixtures = {
  readonly solanaRpc: FakeSolanaRpc;
  readonly solanaVerifyPage: {
    readonly open: (page: Page, roundId: string) => Promise<void>;
  };
};

export const SOLANA_ROUND_ID = "01927c63-6f7a-7b8c-9d9e-0f1a2b3c4d5e";

export const solanaBookRound = (
  ending: BookEnding,
  solanaCase: SolanaCase,
): Record<string, unknown> => {
  const ledger = solanaLedger(solanaCase);
  if (ledger.value === undefined) {
    throw new Error(`${solanaCase} gives no value`);
  }
  return {
    ...bookRound(ending, ledger.value, {
      source: SOLANA_SOURCE,
      chainId: SOLANA_CLUSTER,
      block: Number(ledger.slot),
    }),
    roundId: SOLANA_ROUND_ID,
  };
};

const documentOf = (
  document: VerifySolanaDocument,
  playApiBaseUrl: string,
  verifyApiBaseUrl: string,
): Readonly<Record<string, unknown>> => ({
  ...(document === "solana-only"
    ? solanaEnvironmentConfig(playApiBaseUrl, solanaPins())
    : evmSolanaEnvironmentConfig(playApiBaseUrl, ROUND_PINS)),
  verifyBaseUrl: VERIFY_BASE_URL,
  verifyApiBaseUrl,
});

export const configuredRpcUrls = (
  document: VerifySolanaDocument,
): readonly string[] =>
  [
    ...(document === "solana-only" ? [] : ROUND_RPC_ENDPOINTS),
    ...SOLANA_RPC_ENDPOINTS,
  ].map(endpoint => endpoint.url);

export const test = verifyTest.extend<
  VerifySolanaOptions & VerifySolanaFixtures
>({
  solanaCase: ["produced-slot", { option: true }],
  solanaDocument: ["solana-only", { option: true }],

  solanaRpc: async ({ context, hermetic: _guard, solanaCase }, use) => {
    const rpc = createFakeSolanaRpc({
      endpoints: SOLANA_RPC_ENDPOINTS,
      ledger: solanaLedger(solanaCase),
      lagMargin: BigInt(SOLANA_LAG_MARGIN),
      allowOrigin: WRAPPER_ORIGIN,
    });
    await rpc.install(context);
    await use(rpc);
    expect(rpc.unexpected(), "calls the fake Solana RPC did not know").toEqual(
      [],
    );
  },

  solanaVerifyPage: async (
    {
      context,
      verifyPage,
      solanaRpc: _rpc,
      playApiBaseUrl,
      verifyApiBaseUrl,
      solanaDocument,
      verifyPolicy,
    },
    use,
  ) => {
    await serveEnvironmentConfig(
      context,
      documentOf(solanaDocument, playApiBaseUrl, verifyApiBaseUrl),
    );
    if (verifyPolicy) {
      await serveVerifyPage(
        context,
        verifyPolicyHeaders(
          verifyApiBaseUrl,
          configuredRpcUrls(solanaDocument),
        ),
      );
    }
    await use({ open: (page, roundId) => verifyPage.open(page, roundId) });
  },
});

export { expect };
