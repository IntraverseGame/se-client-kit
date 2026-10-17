// The tip check's calls (W-26b), its reading of untrusted answers, and the
// request timeout of T-8a (W-43).

import { DEFAULT_REQUEST_TIMEOUT_MS } from "@intraverse/se-client-play-client";
import { describe, expect, it } from "vitest";

import { ShellError } from "./errors.ts";
import {
  chainConfig,
  ENTROPY_CHAIN_ID,
  endpoints,
  SOURCE,
} from "./fixtures/chain-config.ts";
import {
  createFakeRpc,
  createManualClock,
  type FakeRpc,
  hashOf,
  type ProviderScript,
  runScripted,
} from "./fixtures/fake-rpc.ts";
import { runTipCheck } from "./tip-check.ts";

const final = (height: bigint): ProviderScript => ({ final: height });

/** Calls per check with three endpoints: chain id, final block, `h_low`. */
const CALLS = 9;

type Call = ReturnType<FakeRpc["calls"]>[number];

const isFinalized = (c: Call): boolean =>
  c.call.method === "eth_getBlockByNumber" && c.call.params[0] === "finalized";

const isAtLow = (c: Call): boolean =>
  c.call.method === "eth_getBlockByNumber" && c.call.params[0] !== "finalized";

const hostile = {
  get number(): string {
    throw new Error("boom");
  },
};

describe("runTipCheck calls", () => {
  it("sends eth_chainId and eth_getBlockByNumber with finalized, then h_low, without bodies", async () => {
    const { rpc } = await runScripted({
      scripts: { p1: final(255n), p2: final(256n), p3: final(255n) },
    });
    const chainId = { method: "eth_chainId", params: [] };
    const finalized = {
      method: "eth_getBlockByNumber",
      params: ["finalized", false],
    };
    const atLow = { method: "eth_getBlockByNumber", params: ["0xff", false] };
    expect(rpc.calls().map(c => c.call)).toEqual([
      chainId,
      chainId,
      chainId,
      finalized,
      finalized,
      finalized,
      atLow,
      atLow,
      atLow,
    ]);
    expect(rpc.calls().map(c => c.endpoint)).toEqual([
      ...endpoints(3),
      ...endpoints(3),
      ...endpoints(3),
    ]);
  });

  it("does not ask an endpoint that gave no final block for h_low", async () => {
    const { rpc } = await runScripted({
      scripts: { p1: final(100n), p2: final(100n), p3: { final: "error" } },
    });
    const asked = rpc
      .calls()
      .filter(c => isAtLow(c))
      .map(c => c.endpoint.provider);
    expect(asked).toEqual(["p1", "p2"]);
  });

  it.each([
    ["not an object", "0x64"],
    ["a null block", null],
    ["an uppercase quantity", { number: "0X64", hash: hashOf(100n) }],
    ["a leading zero", { number: "0x064", hash: hashOf(100n) }],
    [
      "a quantity beyond uint64",
      { number: `0x1${"0".repeat(16)}`, hash: hashOf(1n) },
    ],
    ["a short hash", { number: "0x64", hash: "0x1234" }],
    ["a decimal number", { number: 100, hash: hashOf(100n) }],
    ["a throwing getter", hostile],
  ])("treats %s as no answer", async (_label, raw) => {
    const { result } = await runScripted({
      scripts: { p1: final(100n), p2: final(100n), p3: { final: { raw } } },
    });
    expect(result.passed).toBe(true);
    expect(result.answers[2]).toEqual({
      provider: "p3",
      chainId: BigInt(ENTROPY_CHAIN_ID),
      finalBlock: null,
      hashAtLow: null,
    });
  });

  it("reads a hash in any case and records it lowercase", async () => {
    // A height with hex letters, so the hash has letters to change case.
    const height = 0xabcn;
    const upper = `0x${hashOf(height).slice(2).toUpperCase()}`;
    expect(upper).not.toBe(hashOf(height));
    const { result } = await runScripted({
      scripts: {
        p1: final(height),
        p2: final(height),
        p3: {
          final: height,
          atHeight: { raw: { number: "0xabc", hash: upper } },
        },
      },
    });
    expect(result.passed).toBe(true);
    expect(result.answers[2]?.hashAtLow).toBe(hashOf(height));
    expect(result.answers[2]?.hashAtLow).toBe(result.answers[0]?.hashAtLow);
  });

  it("times out each call on the injected clock (15 s by default, W-43)", async () => {
    const { clock } = await runScripted({
      scripts: { p1: final(100n), p2: final(100n), p3: final(100n) },
    });
    expect(clock.delays()).toEqual(
      Array.from({ length: CALLS }, () => DEFAULT_REQUEST_TIMEOUT_MS),
    );
    expect(clock.pending()).toBe(0);
  });

  it("clears the timer of each call answered in time", async () => {
    const rpc = createFakeRpc({
      p1: final(100n),
      p2: final(100n),
      p3: final(100n),
    });
    const clock = createManualClock();
    const result = await runTipCheck({
      config: chainConfig(),
      source: SOURCE,
      transport: rpc.transport,
      clock,
    });
    expect(result.passed).toBe(true);
    // No timer was fired: only clearTimeout can have removed them.
    expect(clock.delays()).toHaveLength(CALLS);
    expect(clock.pending()).toBe(0);
    expect(rpc.calls().map(c => c.signal?.aborted)).toEqual(
      Array.from({ length: CALLS }, () => false),
    );
  });

  it("aborts the signal of a call that times out, and only that one", async () => {
    const { result, rpc } = await runScripted({
      scripts: { p1: final(100n), p2: final(100n), p3: { final: "silent" } },
    });
    expect(result.passed).toBe(true);
    const finalized = rpc.calls().filter(c => isFinalized(c));
    expect(finalized.map(c => c.signal?.aborted)).toEqual([false, false, true]);
  });

  it("takes a configured timeout and ignores an answer after it", async () => {
    const { result, clock, rpc } = await runScripted({
      scripts: { p1: final(100n), p2: final(100n), p3: { final: "deferred" } },
      timeoutMs: 2000,
      between: fake => {
        fake.answer("p3", { number: "0x1", hash: hashOf(1n) });
      },
    });
    expect(clock.delays()[0]).toBe(2000);
    // The fake transport ignores the aborted signal and answers late anyway.
    expect(rpc.calls().filter(c => isFinalized(c))[2]?.signal?.aborted).toBe(
      true,
    );
    expect(result.answers[2]?.finalBlock).toBeNull();
    expect(result.low).toBe(100n);
    expect(result.passed).toBe(true);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a timeout of %d",
    async timeoutMs => {
      await expect(
        runTipCheck({
          config: chainConfig(),
          source: SOURCE,
          clock: createManualClock(),
          transport: createFakeRpc({}).transport,
          timeoutMs,
        }),
      ).rejects.toEqual(new ShellError("invalid-input"));
    },
  );

  it("fails for a source the configuration does not list, asking no one", async () => {
    const { result, rpc } = await runScripted({
      scripts: { p1: final(100n) },
      source: "unlisted",
    });
    expect(result.failure).toBe("unknown-source");
    expect(result.answers).toEqual([]);
    expect(rpc.calls()).toEqual([]);
  });

  it("does not read an inherited property as a source", async () => {
    const { result } = await runScripted({ scripts: {}, source: "toString" });
    expect(result.failure).toBe("unknown-source");
  });
});
