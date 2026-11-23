// T-40 (RFC-007 section 3): the tip check of a `solana` source against a
// scripted Solana transport and a manual clock: its calls, its reading of
// untrusted answers, and W-26b's rule in slots. The answers are synthetic.

import { describe, expect, it } from "vitest";

import { chainConfig } from "./fixtures/chain-config.ts";
import { flush } from "./fixtures/fake-locks.ts";
import { createManualClock } from "./fixtures/fake-rpc.ts";
import {
  agreeing,
  at,
  createFakeSolanaRpc,
  runSolanaScripted,
  SOLANA,
  SOLANA_MARGIN,
  solanaEndpoints,
  solanaOnly,
  TESTNET_GENESIS,
} from "./fixtures/fake-solana-rpc.ts";
import { runTipCheck } from "./tip-check.ts";

describe("the Solana tip check's calls", () => {
  it("asks every endpoint getGenesisHash [] and getSlot at finalized, at once, and nothing else", async () => {
    const rpc = createFakeSolanaRpc({
      s1: { slot: "silent" },
      s2: { slot: "silent" },
      s3: { slot: "silent" },
    });
    const clock = createManualClock();
    const pending = runTipCheck({
      config: chainConfig(solanaOnly()),
      source: SOLANA,
      transport: rpc.transport,
      clock,
    });
    await flush();
    // Every call is out before any answer or timeout: one round of calls.
    const genesis = { method: "getGenesisHash", params: [] };
    const slot = { method: "getSlot", params: [{ commitment: "finalized" }] };
    expect(rpc.calls().map(c => c.call)).toEqual([
      genesis,
      genesis,
      genesis,
      slot,
      slot,
      slot,
    ]);
    expect(rpc.calls().map(c => c.endpoint)).toEqual([
      ...solanaEndpoints(3),
      ...solanaEndpoints(3),
    ]);
    expect(rpc.calls().every(c => Object.isFrozen(c.call.params))).toBe(true);
    clock.fireAll();
    await pending;
    expect(rpc.calls()).toHaveLength(6);
  });

  it("makes no second pass at h_low", async () => {
    const { rpc } = await runSolanaScripted({
      scripts: { s1: at(1_000n), s2: at(990n), s3: at(1_010n) },
    });
    expect(new Set(rpc.calls().map(c => c.call.method))).toEqual(
      new Set(["getGenesisHash", "getSlot"]),
    );
    expect(rpc.calls()).toHaveLength(6);
  });
});

describe("the Solana tip check's rule (W-26b, in slots)", () => {
  it("passes a quorum that agrees, with h_top and h_low", async () => {
    const { result } = await runSolanaScripted({
      scripts: { s1: at(1_000n), s2: at(990n), s3: at(1_010n) },
    });
    expect(result.passed).toBe(true);
    expect(result.failure).toBeUndefined();
    expect(result.tip).toBe(1_010n);
    expect(result.low).toBe(990n);
  });

  it("passes exactly the quorum, the others silent", async () => {
    const { result } = await runSolanaScripted({
      scripts: { s1: at(1_000n), s2: at(1_000n), s3: { slot: "silent" } },
    });
    expect(result.passed).toBe(true);
  });

  it("fails another cluster's genesis hash from an endpoint that gave a slot", async () => {
    const { result } = await runSolanaScripted({
      scripts: {
        ...agreeing(),
        s3: { genesisHash: TESTNET_GENESIS, slot: 1_000n },
      },
    });
    expect(result.failure).toBe("chain-id-mismatch");
  });

  it("fails another cluster's genesis hash from an endpoint that gave no slot", async () => {
    const { result } = await runSolanaScripted({
      scripts: {
        ...agreeing(),
        s3: { genesisHash: TESTNET_GENESIS, slot: "silent" },
      },
    });
    expect(result.failure).toBe("chain-id-mismatch");
  });

  it("fails another cluster even when no endpoint gave a slot", async () => {
    const { result } = await runSolanaScripted({
      scripts: {
        s1: { slot: "error" },
        s2: { slot: "error" },
        s3: { genesisHash: TESTNET_GENESIS, slot: "error" },
      },
    });
    expect(result.failure).toBe("chain-id-mismatch");
    expect(result.tip).toBeNull();
    expect(result.low).toBeNull();
  });

  it("fails too few answering", async () => {
    const { result } = await runSolanaScripted({
      scripts: {
        s1: at(1_000n),
        s2: { slot: "silent" },
        s3: { slot: "error" },
      },
    });
    expect(result.failure).toBe("too-few-answered");
  });

  it("fails too few when none answers, with no tip", async () => {
    const { result } = await runSolanaScripted({
      scripts: {
        s1: { slot: "silent" },
        s2: { slot: "silent" },
        s3: { slot: "silent" },
      },
    });
    expect(result.failure).toBe("too-few-answered");
    expect(result.tip).toBeNull();
  });

  it.each(["silent", "error", "throw"] as const)(
    "fails an answering endpoint whose genesis hash call is %s",
    async behavior => {
      const { result } = await runSolanaScripted({
        scripts: {
          ...agreeing(),
          s3: { genesisHash: behavior, slot: 1_000n },
        },
      });
      expect(result.failure).toBe("chain-id-unavailable");
      expect(result.answers[2]?.genesisHash).toBeNull();
    },
  );

  it("lets a silent endpoint give no genesis hash when it gave no slot", async () => {
    const { result } = await runSolanaScripted({
      scripts: {
        ...agreeing(),
        s3: { genesisHash: "silent", slot: "silent" },
      },
    });
    expect(result.passed).toBe(true);
  });

  it("passes an endpoint behind h_top by exactly the margin", async () => {
    const { result } = await runSolanaScripted({
      scripts: { ...agreeing(), s3: at(1_000n - SOLANA_MARGIN) },
    });
    expect(result.passed).toBe(true);
    expect(result.low).toBe(1_000n - SOLANA_MARGIN);
  });

  it("fails an endpoint behind h_top by the margin and one slot", async () => {
    const { result } = await runSolanaScripted({
      scripts: { ...agreeing(), s3: at(1_000n - SOLANA_MARGIN - 1n) },
    });
    expect(result.failure).toBe("lagging");
  });

  it("judges another cluster before too few, too few before no hash, and no hash before lag", async () => {
    const mismatchAndFew = await runSolanaScripted({
      scripts: {
        s1: { genesisHash: TESTNET_GENESIS, slot: "silent" },
        s2: { slot: "silent" },
        s3: { slot: "silent" },
      },
    });
    expect(mismatchAndFew.result.failure).toBe("chain-id-mismatch");
    const fewAndNoHash = await runSolanaScripted({
      scripts: {
        s1: { genesisHash: "error", slot: 1_000n },
        s2: { slot: "silent" },
        s3: { slot: "silent" },
      },
    });
    expect(fewAndNoHash.result.failure).toBe("too-few-answered");
    const noHashAndLag = await runSolanaScripted({
      scripts: {
        s1: at(1_000n),
        s2: { genesisHash: "error", slot: 1_000n },
        s3: at(1n),
      },
    });
    expect(noHashAndLag.result.failure).toBe("chain-id-unavailable");
  });

  it("never drops an outlier: one far ahead makes the others lag", async () => {
    const { result } = await runSolanaScripted({
      scripts: { ...agreeing(), s3: at(1_000_000n) },
    });
    expect(result.failure).toBe("lagging");
    expect(result.tip).toBe(1_000_000n);
  });
});

describe("the Solana tip check's timeout (W-43)", () => {
  it("times each call out on the injected clock, 15 s by default", async () => {
    const { clock } = await runSolanaScripted({ scripts: agreeing() });
    expect(clock.delays()).toEqual(Array.from({ length: 6 }, () => 15_000));
    expect(clock.pending()).toBe(0);
  });

  it("aborts the signal of the call that timed out, and of no other", async () => {
    const { result, rpc, clock } = await runSolanaScripted({
      scripts: { ...agreeing(), s3: { slot: "silent" } },
      timeoutMs: 2_000,
    });
    expect(clock.delays()).toEqual(Array.from({ length: 6 }, () => 2_000));
    expect(result.passed).toBe(true);
    const aborted = rpc
      .calls()
      .filter(c => c.signal?.aborted === true)
      .map(c => `${c.endpoint.provider} ${c.call.method}`);
    expect(aborted).toEqual(["s3 getSlot"]);
  });

  it("ignores an answer that comes after its call timed out", async () => {
    const rpc = createFakeSolanaRpc({
      ...agreeing(),
      s3: { slot: "deferred" },
    });
    const clock = createManualClock();
    const pending = runTipCheck({
      config: chainConfig(solanaOnly()),
      source: SOLANA,
      transport: rpc.transport,
      clock,
    });
    await flush();
    clock.fireAll();
    rpc.answer("s3", "getSlot", 1_000);
    const result = await pending;
    expect(result.answers[2]).toMatchObject({ finalSlot: null });
  });
});
