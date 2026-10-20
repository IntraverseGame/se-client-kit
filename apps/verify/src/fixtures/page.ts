// Test fixtures of the page's controller and view: a valid configuration
// document, a fake `fetch` that serves it, a clock that never fires, a view
// that records what it was shown, and round reports built by hand. The hosts
// are reserved example names that nothing resolves; no request leaves.

import type { CheckResult } from "../check-result.ts";
import type { PageState, PageView } from "../page-state.ts";
import type { RoundEvidence } from "../round-evidence.ts";
import type { RoundReport, Verdict } from "../verify-round.ts";

export const ORIGIN = "https://se.example";
export const CONFIG_URL = `${ORIGIN}/environment-config.json`;
export const ROUND_ID = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d";
export const HASH = `0x${"ab".repeat(32)}`;
export const OTHER_HASH = `0x${"cd".repeat(32)}`;

/** A valid production document for a page served at `ORIGIN/verify`. */
export const configDocument = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  environment: "production",
  playApiBaseUrl: `${ORIGIN}/play/v1`,
  verifyBaseUrl: `${ORIGIN}/verify`,
  verifyApiBaseUrl: `${ORIGIN}/verify/v1`,
  runtimeSigner: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
  registryDomain: {
    chainId: 31337,
    verifyingContract: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
  },
  rpcEndpoints: {
    "ethereum:block": [
      { provider: "p1", url: "https://rpc1.example/eth" },
      { provider: "p2", url: "https://rpc2.example/eth" },
    ],
  },
  entropyChainId: { "ethereum:block": 1 },
  minRpcQuorum: 2,
  tipLagMargin: { "ethereum:block": 2 },
  gameOrigins: ["https://game.example"],
  operatorOrigins: [],
  ...overrides,
});

/** A `fetch` that answers the configuration document and records each URL. */
export const configFetch = (
  document: unknown = configDocument(),
): { readonly fetch: typeof fetch; readonly urls: string[] } => {
  const urls: string[] = [];
  const fake = (input: RequestInfo | URL): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    urls.push(url);
    return Promise.resolve(
      url === CONFIG_URL
        ? new Response(JSON.stringify(document), { status: 200 })
        : new Response("", { status: 599 }),
    );
  };
  return { fetch: fake as typeof fetch, urls };
};

/** A clock whose timers never fire. */
export const stillClock = {
  setTimeout: (): unknown => 0,
  clearTimeout: (): void => undefined,
};

/** A view that records every state it is shown, with its focus flag. */
export const recordingView = (): PageView & {
  readonly shown: { readonly state: PageState; readonly focus: boolean }[];
  readonly last: () => PageState | undefined;
} => {
  const shown: { state: PageState; focus: boolean }[] = [];
  return {
    shown,
    show: (state, focus) => {
      shown.push({ state, focus });
    },
    last: () => shown.at(-1)?.state,
  };
};

/** A minimal ended Coin Flip round's evidence. */
export const evidence = (
  overrides: Partial<RoundEvidence> = {},
): RoundEvidence => ({
  roundId: ROUND_ID,
  kernelVersion: 1,
  status: "won",
  payout: { formatted: "€1.94", value: 194n, unit: "EUR" },
  steps: [{ optionCount: 2, selectedIndex: 1, losingIndex: 0 }],
  randomnessProof: {
    source: "ethereum:block",
    blockNumber: 21_000_123n,
    blockValue: HASH,
    roundSecretHash: HASH,
    roundSecret: HASH,
  },
  fairnessProof: { seedHash: HASH, readyHash: HASH, seed: HASH },
  ...overrides,
});

const matching = (id: CheckResult["id"]): CheckResult => ({
  id,
  title: `Check ${id}`,
  status: "matches",
  comparisons: [
    { name: `value ${id}`, recomputed: HASH, evidence: HASH, matches: true },
  ],
});

/** Seven checks, all matching, with `replace` swapped in by id. */
export const checks = (
  ...replace: readonly CheckResult[]
): readonly CheckResult[] =>
  ([1, 2, 3, 4, 5, 6, 7] as const).map(
    id => replace.find(c => c.id === id) ?? matching(id),
  );

export const report = (
  verdict: Verdict,
  overrides: {
    readonly evidence?: RoundEvidence;
    readonly checks?: readonly CheckResult[];
  } = {},
): RoundReport => ({
  roundId: ROUND_ID,
  evidence: overrides.evidence ?? evidence(),
  checks: overrides.checks ?? checks(),
  verdict,
});
