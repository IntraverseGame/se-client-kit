// T-39, the verify page's guard: until RFC-007's slice 4, check 6 of a round
// whose source is of kind `solana` asks no endpoint and is could not be
// verified. The rounds are issued again for their source and chain by a seeded
// registry key (`fixtures/issued-round.ts`), so checks 1 to 5 hold on them and
// check 6 is the only check that fails.

import { describe, expect, it } from "vitest";

import { checkBlock } from "./block-check.ts";
import type { CheckId } from "./check-result.ts";
import type { VerifyConfig } from "./environment-config.ts";
import { accepted, environmentDocument } from "./fixtures/environment.ts";
import {
  issuedSnapshot,
  pinnedFor,
  registryKey,
} from "./fixtures/issued-round.ts";
import {
  chainDeps,
  configFor,
  type EndpointReply,
  evidenceOf,
  ROUND_ID,
} from "./fixtures/rounds.ts";
import type { RoundEvidence } from "./round-evidence.ts";
import { type RoundReport, waitsForEnd } from "./round-report.ts";
import { verifyRound } from "./verify-round.ts";

const HASH = `0x${"ab".repeat(32)}`;
const ANVIL_CHAIN = 50312;
const ANVIL_URLS = ["https://anvil-a.example/", "https://anvil-b.example/"];
const SOLANA_URLS = ["https://solana-a.example/", "https://solana-b.example/"];

const endpointsOf = (
  urls: readonly string[],
): readonly { provider: string; url: string }[] =>
  urls.map((url, i) => ({ provider: `p${String(i)}`, url }));

const registry = registryKey();

/** A configuration that pins `registry` and the document's sources. */
const configWith = (document: Record<string, unknown>): VerifyConfig => {
  const validated = accepted(environmentDocument(document));
  return configFor(pinnedFor(registry), {
    environment: validated.environment,
    sources: validated.sources,
  });
};

/** Production's shape: one `solana` source on mainnet-beta. */
const solanaConfig = configWith({
  rpcEndpoints: { solana: endpointsOf(SOLANA_URLS) },
  entropyChainKind: { solana: "solana" },
  entropyChainId: { solana: 101 },
  tipLagMargin: { solana: 64 },
});

/** Staging's shape during its switch: `anvil`, of kind `evm`, and `solana`. */
const stagingConfig = configWith({
  environment: "preview",
  rpcEndpoints: {
    anvil: endpointsOf(ANVIL_URLS),
    solana: endpointsOf(SOLANA_URLS),
  },
  entropyChainKind: { anvil: "evm", solana: "solana" },
  entropyChainId: { anvil: ANVIL_CHAIN, solana: 101 },
  tipLagMargin: { anvil: 100, solana: 64 },
});

/**
 * Endpoints that would answer a read: the `anvil` ones as its chain, the
 * `solana` ones as cluster 101, all with one block hash. Every URL asked is
 * kept, so a test sees whether any request was sent.
 */
const endpoints = (): {
  deps: ReturnType<typeof chainDeps>;
  asked: string[];
} => {
  const replies: Record<string, EndpointReply> = Object.fromEntries([
    ...ANVIL_URLS.map(url => [url, { chainId: ANVIL_CHAIN, hash: HASH }]),
    ...SOLANA_URLS.map(url => [url, { chainId: 101, hash: HASH }]),
  ]);
  const deps = chainDeps(replies);
  const asked: string[] = [];
  return {
    asked,
    deps: {
      ...deps,
      fetch: ((input: string | URL | Request, init?: RequestInit) => {
        asked.push(String(input));
        return deps.fetch(input, init);
      }) as typeof fetch,
    },
  };
};

const evidence = async (
  source: string,
  entropyChainId: number,
  status: string,
  reveals = false,
): Promise<RoundEvidence> =>
  evidenceOf(
    await issuedSnapshot({
      source,
      entropyChainId,
      status,
      reveals,
      registry,
    }),
  );

const solanaRound = (status: string, reveals = false): Promise<RoundEvidence> =>
  evidence("solana", 101, status, reveals);

const statusOf = (report: RoundReport, id: CheckId): string | undefined =>
  report.checks.find(c => c.id === id)?.status;

const UNSUPPORTED = {
  id: 6,
  title: "Block N",
  status: "unverified",
  comparisons: [],
  note: "This page cannot read a Solana entropy chain yet; no endpoint was asked.",
  details: [],
  chainFailure: "unsupported-chain-kind",
};

describe("check 6 of a solana source, before the Solana reader", () => {
  it("asks no endpoint and could not be verified, with why", async () => {
    const e = endpoints();
    const { result, agreed } = await checkBlock(
      e.deps,
      solanaConfig,
      await solanaRound("active"),
    );
    expect(e.asked).toEqual([]);
    expect(agreed).toBeUndefined();
    expect(result).toEqual(UNSUPPORTED);
  });

  it("does not wait for the end of a round still running", async () => {
    const e = endpoints();
    const { result } = await checkBlock(
      e.deps,
      solanaConfig,
      await solanaRound("active"),
    );
    expect(waitsForEnd(result)).toEqual(result);
  });

  it("never lets an ended round pass, and check 7 is not run", async () => {
    // A won round with its reveals, consistent for source `solana` on 101:
    // checks 1 to 5 match, so check 6 is the only failure.
    const e = endpoints();
    const report = await verifyRound(
      e.deps,
      solanaConfig,
      await solanaRound("won", true),
      ROUND_ID,
    );
    expect(e.asked).toEqual([]);
    expect(([1, 2, 3, 4, 5] as const).map(id => statusOf(report, id))).toEqual([
      "matches",
      "matches",
      "matches",
      "matches",
      "matches",
    ]);
    expect(report.checks.find(c => c.id === 6)).toEqual(UNSUPPORTED);
    expect(report.checks.find(c => c.id === 7)).toEqual({
      id: 7,
      title: "Seed and outcome",
      status: "not-checked",
      comparisons: [],
      note: "It needs block N's hash (check 6).",
    });
    expect(report.verdict).toEqual({ kind: "chain-unverified" });
  });
});

describe("staging's shape: an evm source beside a solana one", () => {
  it("reads a round on anvil from its endpoints, and check 6 matches", async () => {
    const e = endpoints();
    const report = await verifyRound(
      e.deps,
      stagingConfig,
      await evidence("anvil", ANVIL_CHAIN, "canceled"),
      ROUND_ID,
    );
    expect([...new Set(e.asked)].toSorted()).toEqual(ANVIL_URLS);
    expect(statusOf(report, 6)).toBe("matches");
    expect(report.verdict).toEqual({ kind: "matches" });
  });

  it("sends no request for a round on solana", async () => {
    const e = endpoints();
    const report = await verifyRound(
      e.deps,
      stagingConfig,
      await solanaRound("won", true),
      ROUND_ID,
    );
    expect(e.asked).toEqual([]);
    expect(report.checks.find(c => c.id === 6)).toEqual(UNSUPPORTED);
    expect(report.verdict).toEqual({ kind: "chain-unverified" });
  });
});
