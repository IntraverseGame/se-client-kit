// W-26b: every endpoint that answers the tip check reports the entropy
// source's pinned chain id (`eth_chainId`), or the check fails closed; an
// endpoint that reports another chain fails it whether or not it answered. A
// scripted transport and a manual clock, no network and no real timers.

import { describe, expect, it } from "vitest";

import { decideChain } from "./chain-decision.ts";
import {
  ENTROPY_CHAIN_ID,
  endpoints,
  SOURCE,
} from "./fixtures/chain-config.ts";
import { type ProviderScript, runScripted } from "./fixtures/fake-rpc.ts";

const CHAIN = BigInt(ENTROPY_CHAIN_ID);
const final = (height: bigint): ProviderScript => ({ final: height });

describe("runTipCheck and the source's chain id", () => {
  it("records the pinned chain id and each endpoint's report", async () => {
    const { result } = await runScripted({
      scripts: { p1: final(100n), p2: final(100n), p3: final(100n) },
    });
    expect(result.passed).toBe(true);
    expect(result.chainId).toBe(CHAIN);
    expect(result.answers.map(a => a.chainId)).toEqual([CHAIN, CHAIN, CHAIN]);
  });

  it("fails when an answering endpoint reports another chain", async () => {
    const { result } = await runScripted({
      scripts: {
        p1: final(100n),
        p2: final(100n),
        p3: { chainId: 1n, final: 100n },
      },
    });
    expect(result.passed).toBe(false);
    expect(result.failure).toBe("chain-id-mismatch");
    expect(result.answers[2]?.chainId).toBe(1n);
  });

  it("fails on another chain even with one endpoint (degraded mode)", async () => {
    const { result } = await runScripted({
      scripts: { anvil: { chainId: 1n, final: 100n } },
      config: {
        environment: "local",
        minRpcQuorum: 1,
        rpcEndpoints: {
          [SOURCE]: [{ provider: "anvil", url: "http://localhost:8545" }],
        },
      },
    });
    expect(result.tipCheck).toBe("degraded");
    expect(result.failure).toBe("chain-id-mismatch");
  });

  it.each([
    ["is silent", "silent"],
    ["rejects", "error"],
    ["throws", "throw"],
    ["answers a number", { raw: ENTROPY_CHAIN_ID }],
    ["answers an uppercase quantity", { raw: "0X2105" }],
    ["answers a leading zero", { raw: "0x02105" }],
    ["answers beyond uint64", { raw: `0x1${"0".repeat(16)}` }],
    ["answers null", { raw: null }],
  ] as const)(
    "fails closed when an answering endpoint %s for its chain id",
    async (_label, chainId) => {
      const { result } = await runScripted({
        scripts: {
          p1: final(100n),
          p2: final(100n),
          p3: { chainId, final: 100n },
        },
      });
      expect(result.passed).toBe(false);
      expect(result.failure).toBe("chain-id-unavailable");
      expect(result.answers[2]?.chainId).toBeNull();
    },
  );

  it("fails on another chain even from an endpoint that gave no final block", async () => {
    const { result } = await runScripted({
      scripts: {
        p1: final(100n),
        p2: final(100n),
        p3: { chainId: 1n, final: "silent" },
      },
    });
    expect(result.passed).toBe(false);
    expect(result.failure).toBe("chain-id-mismatch");
  });

  it("reports another chain before too few answering", async () => {
    const { result } = await runScripted({
      scripts: {
        p1: { chainId: 1n, final: "silent" },
        p2: { final: "silent" },
        p3: { final: "error" },
      },
    });
    expect(result.tip).toBeNull();
    expect(result.failure).toBe("chain-id-mismatch");
  });

  it("does not judge a silent chain id of an endpoint that gave no final block", async () => {
    const { result } = await runScripted({
      scripts: {
        p1: final(100n),
        p2: final(100n),
        p3: { chainId: "silent", final: "silent" },
      },
    });
    expect(result.passed).toBe(true);
  });

  it("checks the chain before the lag", async () => {
    const { result } = await runScripted({
      scripts: {
        p1: final(100n),
        p2: { chainId: 1n, final: 100n },
        p3: final(10n),
      },
    });
    expect(result.failure).toBe("chain-id-mismatch");
  });

  it("checks each source against its own chain", async () => {
    const { result } = await runScripted({
      scripts: { p1: final(100n), p2: final(100n) },
      source: "other",
      config: {
        rpcEndpoints: { [SOURCE]: endpoints(2), other: endpoints(2) },
        entropyChainId: { [SOURCE]: ENTROPY_CHAIN_ID, other: 1 },
        tipLagMargin: { [SOURCE]: 2, other: 2 },
      },
    });
    expect(result.chainId).toBe(1n);
    expect(result.failure).toBe("chain-id-mismatch");
  });

  it("decides a wrong chain as failed verification, a silent one as unverified", async () => {
    const wrong = await runScripted({
      scripts: { p1: final(100n), p2: { chainId: 1n, final: 100n } },
      config: { rpcEndpoints: { [SOURCE]: endpoints(2) } },
    });
    const silent = await runScripted({
      scripts: { p1: final(100n), p2: { chainId: "silent", final: 100n } },
      config: { rpcEndpoints: { [SOURCE]: endpoints(2) } },
    });
    const bind = { mode: "future", blockNumber: 101n } as const;
    expect(decideChain(wrong.result, bind)).toMatchObject({
      verdict: "fail",
      reason: "verification-failed",
      failure: "chain-id-mismatch",
    });
    expect(decideChain(silent.result, bind)).toMatchObject({
      verdict: "fail",
      reason: "chain-unverified",
      failure: "chain-id-unavailable",
    });
  });

  it("reports too few answering before an answering endpoint's missing chain id", async () => {
    const { result } = await runScripted({
      scripts: {
        p1: { chainId: "silent", final: 100n },
        p2: { final: "silent" },
        p3: { final: "error" },
      },
    });
    expect(result.failure).toBe("too-few-answered");
  });

  it("reports a missing chain id before a lagging endpoint", async () => {
    const { result } = await runScripted({
      scripts: {
        p1: final(100n),
        p2: { chainId: "error", final: 100n },
        p3: final(10n),
      },
    });
    expect(result.failure).toBe("chain-id-unavailable");
  });

  it("fails closed on a missing chain id in degraded mode", async () => {
    const { result } = await runScripted({
      scripts: { anvil: { chainId: "silent", final: 100n } },
      config: {
        environment: "local",
        minRpcQuorum: 1,
        rpcEndpoints: {
          [SOURCE]: [{ provider: "anvil", url: "http://localhost:8545" }],
        },
      },
    });
    expect(result.tipCheck).toBe("degraded");
    expect(result.failure).toBe("chain-id-unavailable");
  });
});
