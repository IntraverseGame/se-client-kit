// T-8, the tip check (W-26a, W-26b): a scripted transport and a manual clock,
// no network and no real timers. The calls, the untrusted answers, and the
// timeouts are in tip-check-calls.test.ts.

import { describe, expect, it } from "vitest";

import {
  ENTROPY_CHAIN_ID,
  endpoints,
  SOURCE,
} from "./fixtures/chain-config.ts";
import {
  hashOf,
  type ProviderScript,
  runScripted,
} from "./fixtures/fake-rpc.ts";

const final = (height: bigint): ProviderScript => ({ final: height });
const CHAIN = BigInt(ENTROPY_CHAIN_ID);
const twoEndpoints = { rpcEndpoints: { [SOURCE]: endpoints(2) } };

describe("runTipCheck", () => {
  it("passes with exactly minRpcQuorum endpoints answering and agreeing", async () => {
    const { result } = await runScripted({
      scripts: { p1: final(100n), p2: final(100n), p3: { final: "silent" } },
    });
    expect(result.passed).toBe(true);
    expect(result.failure).toBeUndefined();
    expect(result.tipCheck).toBe("independent");
  });

  it("passes when every endpoint is within the lag margin of h_top", async () => {
    const { result } = await runScripted({
      scripts: { p1: final(100n), p2: final(98n), p3: final(99n) },
    });
    expect(result.passed).toBe(true);
    expect(result.tip).toBe(100n);
    expect(result.low).toBe(98n);
  });

  it("fails on one outlier among three, and does not drop it", async () => {
    const { result } = await runScripted({
      scripts: { p1: final(100n), p2: final(100n), p3: final(90n) },
    });
    expect(result.passed).toBe(false);
    expect(result.failure).toBe("lagging");
    expect(result.answers.map(a => a.finalBlock)).toEqual([100n, 100n, 90n]);
  });

  it("passes at the lag margin and fails just beyond it", async () => {
    const at = await runScripted({
      scripts: { p1: final(100n), p2: final(98n) },
      config: twoEndpoints,
    });
    const beyond = await runScripted({
      scripts: { p1: final(100n), p2: final(97n) },
      config: twoEndpoints,
    });
    expect(at.result.passed).toBe(true);
    expect(beyond.result.failure).toBe("lagging");
  });

  it("fails when too few endpoints answer", async () => {
    const { result } = await runScripted({
      scripts: {
        p1: final(100n),
        p2: { final: "silent" },
        p3: { final: "error" },
      },
    });
    expect(result.passed).toBe(false);
    expect(result.failure).toBe("too-few-answered");
    expect(result.answers).toEqual([
      {
        provider: "p1",
        chainId: CHAIN,
        finalBlock: 100n,
        hashAtLow: hashOf(100n),
      },
      { provider: "p2", chainId: CHAIN, finalBlock: null, hashAtLow: null },
      { provider: "p3", chainId: CHAIN, finalBlock: null, hashAtLow: null },
    ]);
  });

  it("fails when no endpoint answers, with no tip", async () => {
    const { result } = await runScripted({
      scripts: {
        p1: { final: "silent" },
        p2: { final: "error" },
        p3: { final: "throw" },
      },
    });
    expect(result.failure).toBe("too-few-answered");
    expect(result.tip).toBeNull();
    expect(result.low).toBeNull();
    expect(result.answers.map(a => a.finalBlock)).toEqual([null, null, null]);
  });

  it("fails on a block-hash mismatch at h_low and picks no side", async () => {
    const { result } = await runScripted({
      scripts: {
        p1: final(100n),
        p2: final(100n),
        p3: { final: 100n, atHeight: "b" },
      },
    });
    expect(result.passed).toBe(false);
    expect(result.failure).toBe("hash-mismatch");
    expect(result.answers.map(a => a.hashAtLow)).toEqual([
      hashOf(100n, "a"),
      hashOf(100n, "a"),
      hashOf(100n, "b"),
    ]);
  });

  it.each(["silent", "error", "throw", { raw: null }] as const)(
    "fails when an answering endpoint's h_low call is %j",
    async atHeight => {
      const { result } = await runScripted({
        scripts: {
          p1: final(100n),
          p2: final(100n),
          p3: { final: 100n, atHeight },
        },
      });
      expect(result.failure).toBe("hash-unavailable");
      expect(result.answers[2]?.hashAtLow).toBeNull();
    },
  );

  it("fails when an endpoint answers h_low with another block", async () => {
    const { result } = await runScripted({
      scripts: {
        p1: final(100n),
        p2: final(100n),
        p3: {
          final: 100n,
          atHeight: { raw: { number: "0x65", hash: hashOf(101n) } },
        },
      },
    });
    expect(result.failure).toBe("hash-unavailable");
  });

  it("reports h_top as the observed tip", async () => {
    const { result } = await runScripted({
      scripts: { p1: final(101n), p2: final(100n), p3: final(102n) },
    });
    expect(result.tip).toBe(102n);
    expect(result.low).toBe(100n);
  });

  it("records every endpoint's provider, final block, and hash at h_low", async () => {
    const { result } = await runScripted({
      scripts: { p1: final(101n), p2: final(100n), p3: final(102n) },
    });
    expect(result.answers).toEqual([
      {
        provider: "p1",
        chainId: CHAIN,
        finalBlock: 101n,
        hashAtLow: hashOf(100n),
      },
      {
        provider: "p2",
        chainId: CHAIN,
        finalBlock: 100n,
        hashAtLow: hashOf(100n),
      },
      {
        provider: "p3",
        chainId: CHAIN,
        finalBlock: 102n,
        hashAtLow: hashOf(100n),
      },
    ]);
    expect(result.source).toBe(SOURCE);
    expect(result.tipLagMargin).toBe(2n);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.answers)).toBe(true);
    expect(Object.isFrozen(result.answers[0])).toBe(true);
  });

  it("records the answers of a failed check too", async () => {
    const { result } = await runScripted({
      scripts: { p1: final(100n), p2: final(90n), p3: final(100n) },
    });
    expect(result.failure).toBe("lagging");
    expect(result.answers).toEqual([
      {
        provider: "p1",
        chainId: CHAIN,
        finalBlock: 100n,
        hashAtLow: hashOf(90n),
      },
      {
        provider: "p2",
        chainId: CHAIN,
        finalBlock: 90n,
        hashAtLow: hashOf(90n),
      },
      {
        provider: "p3",
        chainId: CHAIN,
        finalBlock: 100n,
        hashAtLow: hashOf(90n),
      },
    ]);
  });

  describe("degraded mode (W-26a)", () => {
    const local = {
      environment: "local",
      minRpcQuorum: 1,
      rpcEndpoints: {
        [SOURCE]: [{ provider: "anvil", url: "http://127.0.0.1:8545" }],
      },
    };

    it("passes with one endpoint and records tipCheck: degraded", async () => {
      const { result } = await runScripted({
        scripts: { anvil: final(7n) },
        config: local,
      });
      expect(result.passed).toBe(true);
      expect(result.tipCheck).toBe("degraded");
      expect(result.tip).toBe(7n);
    });

    it("still fails when the one endpoint does not answer", async () => {
      const { result } = await runScripted({
        scripts: { anvil: { final: "silent" } },
        config: local,
      });
      expect(result.failure).toBe("too-few-answered");
      expect(result.tipCheck).toBe("degraded");
    });
  });
});
