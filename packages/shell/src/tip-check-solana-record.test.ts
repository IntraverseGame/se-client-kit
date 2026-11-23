// T-40 (RFC-007 section 3): what a Solana tip check records (W-27), its bind in
// slots, its decision with W-26b's reasons, the degraded mode, and a
// configuration with an `evm` and a `solana` source, each round read by its own
// source's kind at its own endpoints. Synthetic answers: the vendored
// `entropy/v1/solana` reads hold no genesis hash and no shell call.

import { describe, expect, it } from "vitest";

import { decideChain } from "./chain-decision.ts";
import { endpoints, SOURCE } from "./fixtures/chain-config.ts";
import { runScripted } from "./fixtures/fake-rpc.ts";
import {
  issueSolanaRound,
  MAINNET_GENESIS,
  runSolanaScripted,
  SILENT_ROUND_ENDPOINTS,
  SOLANA_MARGIN,
  type SolanaScript,
  solanaEndpoints,
  solanaOnly,
  TESTNET_GENESIS,
  WITH_BOTH,
} from "./fixtures/fake-solana-rpc.ts";
import { ROUND_REQUEST } from "./fixtures/round-auth.ts";
import { ROUND_ID } from "./fixtures/vectors.ts";
import { createRoundVerification } from "./round-verification.ts";

const TIP = 300_000_000n;

const SPREAD: Record<string, SolanaScript> = {
  s1: { slot: TIP },
  s2: { slot: TIP - 3n },
  s3: { slot: "silent" },
};

const passing = async () =>
  (await runSolanaScripted({ scripts: SPREAD })).result;

const stringify = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    typeof v === "bigint" ? v.toString() : v,
  );

describe("the Solana tip check's record (W-27)", () => {
  it("holds the source, the kind, the cluster, the pinned genesis hash, the tips, the margin, and every answer", async () => {
    const result = await passing();
    expect(result).toEqual({
      kind: "solana",
      source: "solana",
      passed: true,
      tipCheck: "independent",
      tip: TIP,
      low: TIP - 3n,
      tipLagMargin: SOLANA_MARGIN,
      chainId: 101n,
      genesisHash: MAINNET_GENESIS,
      answers: [
        {
          kind: "solana",
          provider: "s1",
          genesisHash: MAINNET_GENESIS,
          finalSlot: TIP,
        },
        {
          kind: "solana",
          provider: "s2",
          genesisHash: MAINNET_GENESIS,
          finalSlot: TIP - 3n,
        },
        {
          kind: "solana",
          provider: "s3",
          genesisHash: MAINNET_GENESIS,
          finalSlot: null,
        },
      ],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.answers)).toBe(true);
    expect(result.answers.every(a => Object.isFrozen(a))).toBe(true);
  });

  it("records the reported genesis hash of an endpoint on another cluster, and the failure", async () => {
    const { result } = await runSolanaScripted({
      scripts: {
        ...SPREAD,
        s3: { genesisHash: TESTNET_GENESIS, slot: "silent" },
      },
    });
    expect(result.passed).toBe(false);
    expect(result.failure).toBe("chain-id-mismatch");
    expect(result.genesisHash).toBe(MAINNET_GENESIS);
    expect(result.answers[2]).toEqual({
      kind: "solana",
      provider: "s3",
      genesisHash: TESTNET_GENESIS,
      finalSlot: null,
    });
  });

  it("records no URL, so no provider key", async () => {
    const result = await passing();
    const text = stringify(result);
    for (const { url } of solanaEndpoints(3)) {
      expect(text).not.toContain(url);
    }
    expect(text).not.toContain("https:");
    expect(text).not.toContain("example");
  });

  it("records tipCheck degraded at a quorum of 1 (W-26a)", async () => {
    const { result } = await runSolanaScripted({
      scripts: { s1: { slot: TIP } },
      config: { ...solanaOnly(1), environment: "preview", minRpcQuorum: 1 },
    });
    expect(result.passed).toBe(true);
    expect(result.tipCheck).toBe("degraded");
  });

  it("fails another cluster in degraded mode too", async () => {
    const { result } = await runSolanaScripted({
      scripts: { s1: { genesisHash: TESTNET_GENESIS, slot: TIP } },
      config: { ...solanaOnly(1), environment: "preview", minRpcQuorum: 1 },
    });
    expect(result.failure).toBe("chain-id-mismatch");
    expect(result.tipCheck).toBe("degraded");
  });

  it("pins the cluster the configuration names: testnet's hash passes on cluster 102", async () => {
    const { result } = await runSolanaScripted({
      scripts: {
        s1: { genesisHash: TESTNET_GENESIS, slot: TIP },
        s2: { genesisHash: TESTNET_GENESIS, slot: TIP },
      },
      config: {
        ...solanaOnly(2),
        environment: "preview",
        entropyChainId: { solana: 102 },
      },
    });
    expect(result.passed).toBe(true);
    expect(result.chainId).toBe(102n);
    expect(result.genesisHash).toBe(TESTNET_GENESIS);
  });
});

describe("the Solana bind, in slots (W-26b)", () => {
  it("holds a tip bind N down to h_top minus the margin, and not one slot below", async () => {
    const result = await passing();
    const tip = (n: bigint) =>
      decideChain(result, { mode: "tip", blockNumber: n });
    expect(tip(TIP - SOLANA_MARGIN).verdict).toBe("pass");
    expect(tip(TIP).verdict).toBe("pass");
    expect(tip(TIP + 40n).verdict).toBe("pass");
    expect(tip(TIP - SOLANA_MARGIN - 1n)).toEqual({
      verdict: "fail",
      reason: "verification-failed",
      failure: "bind",
      record: result,
    });
  });

  it("holds a future bind N only above h_top", async () => {
    const result = await passing();
    const future = (n: bigint) =>
      decideChain(result, { mode: "future", blockNumber: n });
    expect(future(TIP).verdict).toBe("fail");
    expect(future(TIP + 1n).verdict).toBe("pass");
  });
});

describe("the Solana tip check's decision (W-26, W-48's labels unchanged)", () => {
  it.each([
    [
      "chain-id-mismatch",
      { genesisHash: TESTNET_GENESIS, slot: TIP },
      "verification-failed",
    ],
    ["lagging", { slot: TIP - SOLANA_MARGIN - 1n }, "verification-failed"],
    [
      "chain-id-unavailable",
      { genesisHash: "error", slot: TIP },
      "chain-unverified",
    ],
  ] as const)("decides %s as %s", async (failure, s3, reason) => {
    const { result } = await runSolanaScripted({
      scripts: { s1: { slot: TIP }, s2: { slot: TIP }, s3 },
    });
    expect(decideChain(result, { mode: "tip", blockNumber: TIP })).toEqual({
      verdict: "fail",
      reason,
      failure,
      record: result,
    });
  });

  it("decides too few answering as chain-unverified", async () => {
    const { result } = await runSolanaScripted({
      scripts: {
        s1: { slot: TIP },
        s2: { slot: "error" },
        s3: { slot: "error" },
      },
    });
    expect(
      decideChain(result, { mode: "tip", blockNumber: TIP }),
    ).toMatchObject({
      verdict: "fail",
      reason: "chain-unverified",
      failure: "too-few-answered",
    });
  });

  it("requires the cancel of a round keyed solana once T_0 is settled, as for any failed tip check", async () => {
    // The round signed for source `solana` on cluster 101; its endpoints `p1`
    // and `p2` are silent.
    const round = issueSolanaRound();
    const verification = createRoundVerification({
      config: round.config,
      roundId: ROUND_ID,
      request: ROUND_REQUEST,
    });
    expect(verification.observe(round.snapshot)).toEqual({ state: "checking" });
    const { result } = await runSolanaScripted({
      scripts: SILENT_ROUND_ENDPOINTS,
      validated: round.config,
    });
    expect(
      verification.observeTip(
        decideChain(result, { mode: "tip", blockNumber: TIP }),
      ),
    ).toMatchObject({
      failure: "tip-check",
      tipFailure: "too-few-answered",
      shown: "chain-unverified",
      cancel: true,
    });
  });
});

describe("an evm and a solana source in one configuration", () => {
  it("reads a solana round with Solana calls at the solana endpoints only", async () => {
    const { result, rpc } = await runSolanaScripted({
      scripts: { s1: { slot: TIP }, s2: { slot: TIP } },
      config: WITH_BOTH,
    });
    expect(result.passed).toBe(true);
    expect(new Set(rpc.calls().map(c => c.call.method))).toEqual(
      new Set(["getGenesisHash", "getSlot"]),
    );
    expect(new Set(rpc.calls().map(c => c.endpoint))).toEqual(
      new Set(solanaEndpoints(2)),
    );
  });

  it("reads an evm round with EVM calls at its own endpoints only", async () => {
    const { result, rpc } = await runScripted({
      scripts: { p1: { final: 100n }, p2: { final: 100n } },
      config: WITH_BOTH,
      source: SOURCE,
    });
    expect(result.passed).toBe(true);
    expect(result.kind).toBe("evm");
    expect(new Set(rpc.calls().map(c => c.call.method))).toEqual(
      new Set(["eth_chainId", "eth_getBlockByNumber"]),
    );
    expect(new Set(rpc.calls().map(c => c.endpoint))).toEqual(
      new Set(endpoints(2)),
    );
  });
});
