// T-39 and VT-14, check 6 of a round whose source is of kind `solana`, read
// with the Solana calls since RFC-007's slice 4 replaced slice 1's guard. The
// rounds are issued again for their source and chain by a seeded registry key
// (`fixtures/issued-round.ts`), so checks 1 to 5 hold on them and check 6 is
// the check under test. Endpoints that answer only the EVM calls give a Solana
// read no value; the Solana fake (`fixtures/solana-rpc.ts`) gives it one.

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
import { blockAt, solanaFake, VALUE_A } from "./fixtures/solana-rpc.ts";
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
 * Endpoints that answer only the EVM calls: the `anvil` ones as its chain, the
 * `solana` ones as chain 101, all with one block hash. Every call is kept as
 * `<url> <method>`, so a test sees what was asked.
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
        const { method } = JSON.parse(String(init?.body)) as { method: string };
        asked.push(`${String(input)} ${method}`);
        return deps.fetch(input, init);
      }) as typeof fetch,
    },
  };
};

/** The Solana calls each `solana` endpoint is asked, sorted. */
const SOLANA_CALLS = SOLANA_URLS.flatMap(url => [
  `${url} getBlock`,
  `${url} getGenesisHash`,
]);

const evidence = async (
  source: string,
  entropyChainId: number,
  status: string,
  reveals = false,
) =>
  evidenceOf(
    await issuedSnapshot({
      source,
      entropyChainId,
      status,
      reveals,
      registry,
    }),
  );

const solanaRound = (status: string, reveals = false) =>
  evidence("solana", 101, status, reveals);

/** The slot N a round is bound to. */
const slotOf = (round: Awaited<ReturnType<typeof solanaRound>>): bigint => {
  if (round.randomnessProof === undefined) {
    throw new TypeError("the round carries no randomness proof");
  }
  return round.randomnessProof.blockNumber;
};

const statusOf = (report: RoundReport, id: CheckId): string | undefined =>
  report.checks.find(c => c.id === id)?.status;

/** Check 6 when no endpoint answers the Solana calls. */
const TOO_FEW = {
  id: 6,
  title: "Block N",
  status: "unverified",
  comparisons: [],
  note: "Too few endpoints answered.",
  details: ["p0", "p1"].flatMap(provider => [
    { label: `${provider}: genesis hash`, value: "no answer" },
    { label: `${provider}: block value`, value: "no answer" },
  ]),
  chainFailure: "too-few",
};

describe("check 6 of a solana source, read with the Solana calls", () => {
  it("asks each endpoint the Solana calls, and one that does not answer them gives nothing", async () => {
    const e = endpoints();
    const { result, agreed } = await checkBlock(
      e.deps,
      solanaConfig,
      await solanaRound("active"),
    );
    expect(e.asked.toSorted()).toEqual(SOLANA_CALLS);
    expect(agreed).toBeUndefined();
    expect(result).toEqual(TOO_FEW);
  });

  it("waits for the end of a round still running when too few answered", async () => {
    const e = endpoints();
    const { result } = await checkBlock(
      e.deps,
      solanaConfig,
      await solanaRound("active"),
    );
    expect(waitsForEnd(result).status).toBe("not-checked");
  });

  it("never lets an ended round pass, and check 7 is not checked", async () => {
    // A won round with its reveals, consistent for source `solana` on 101:
    // checks 1 to 5 match, so check 6 is the only failure.
    const e = endpoints();
    const report = await verifyRound(
      e.deps,
      solanaConfig,
      await solanaRound("won", true),
      ROUND_ID,
    );
    expect(e.asked.toSorted()).toEqual(SOLANA_CALLS);
    expect(([1, 2, 3, 4, 5] as const).map(id => statusOf(report, id))).toEqual([
      "matches",
      "matches",
      "matches",
      "matches",
      "matches",
    ]);
    expect(report.checks.find(c => c.id === 6)).toEqual(TOO_FEW);
    expect(report.checks.find(c => c.id === 7)).toEqual({
      id: 7,
      title: "Seed and outcome",
      status: "not-checked",
      comparisons: [],
      note: "It needs block N's hash (check 6).",
    });
    expect(report.verdict).toEqual({ kind: "chain-unverified" });
  });

  it("matches on the endpoints' agreed value, with checks 1 to 4", async () => {
    const round = await solanaRound("active");
    const slot = slotOf(round);
    const script = {
      blocks: { [slot.toString()]: { result: blockAt(slot, VALUE_A.base58) } },
    };
    const f = solanaFake(
      Object.fromEntries(SOLANA_URLS.map(url => [url, script])),
    );
    const report = await verifyRound(f.deps, solanaConfig, round, ROUND_ID);
    expect(f.unexpected).toEqual([]);
    // A round still running carries no reveals yet: check 5 waits for them.
    expect(([1, 2, 3, 4, 6] as const).map(id => statusOf(report, id))).toEqual(
      Array.from({ length: 5 }, () => "matches"),
    );
    expect(report.checks.find(c => c.id === 6)?.details).toContainEqual({
      label: "p0: block value",
      value: VALUE_A.hex,
    });
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
    expect(
      [...new Set(e.asked.map(call => call.split(" ")[0]))].toSorted(),
    ).toEqual(ANVIL_URLS);
    expect(statusOf(report, 6)).toBe("matches");
    expect(report.verdict).toEqual({ kind: "matches" });
  });

  it("reads a round on solana from its own endpoints, with the Solana calls only", async () => {
    const e = endpoints();
    const report = await verifyRound(
      e.deps,
      stagingConfig,
      await solanaRound("won", true),
      ROUND_ID,
    );
    expect(e.asked.toSorted()).toEqual(SOLANA_CALLS);
    expect(report.checks.find(c => c.id === 6)).toEqual(TOO_FEW);
    expect(report.verdict).toEqual({ kind: "chain-unverified" });
  });
});
