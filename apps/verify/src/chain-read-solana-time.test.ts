// VT-14, time and abort in the Solana chain read (RFC-007 section 4): each call
// of the skipped-slot path has its own 15 s timeout on the injected clock, a
// timeout ends that endpoint's answer, the worst case is 45 s, and the caller's
// abort ends every request, the skip path's too, with an `AbortError`.

import { describe, expect, it, vi } from "vitest";

import {
  readSolanaValueByQuorum,
  type SolanaReadConfig,
} from "./chain-read-solana.ts";
import { RPC_TIMEOUT_MS } from "./chain-read.ts";
import {
  agreeing,
  MAINNET,
  NEXT,
  type Scripted,
  skipping,
  SLOT,
  type SolanaFake,
  solanaFake,
  type SolanaScript,
} from "./fixtures/solana-rpc.ts";

const A = "https://sol-a.example/";
const B = "https://sol-b.example/";

const config: SolanaReadConfig = {
  endpoints: [
    { provider: "p0", url: A },
    { provider: "p1", url: B },
  ],
  entropyChainId: 101,
  genesisHash: MAINNET,
  minRpcQuorum: 2,
  environment: "production",
};

const N = SLOT.toString();
const M = NEXT.toString();

/** `skipping()` with `change` applied to its getBlock and getBlocksWithLimit. */
const skipWith = (change: {
  readonly atN?: Scripted;
  readonly list?: Scripted;
  readonly atM?: Scripted;
}): SolanaScript => {
  const base = skipping();
  const blocks = base.blocks ?? {};
  const listed = base.next?.[N];
  return {
    blocks: {
      [N]: change.atN ?? blocks[N] ?? "hang",
      [M]: change.atM ?? blocks[M] ?? "hang",
    },
    next: { [N]: change.list ?? listed ?? "hang" },
  };
};

const methodsTo = (f: SolanaFake, url: string): string[] =>
  f.requests.filter(r => r.url === url).map(r => r.method);

/** Whether `promise` has settled, without waiting for it. */
const tracked = <T>(promise: Promise<T>) => {
  let settled = false;
  const done = promise.then(
    value => {
      settled = true;
      return value;
    },
    (error: unknown) => {
      settled = true;
      throw error;
    },
  );
  return { done, settled: () => settled };
};

describe("readSolanaValueByQuorum: a timeout at each call of the skip path", () => {
  it.each<[string, SolanaScript, readonly string[]]>([
    [
      "getBlock at N",
      skipWith({ atN: "hang" }),
      ["getGenesisHash", "getBlock"],
    ],
    [
      "getBlocksWithLimit",
      skipWith({ list: "hang" }),
      ["getGenesisHash", "getBlock", "getBlocksWithLimit"],
    ],
    [
      "getBlock at M",
      skipWith({ atM: "hang" }),
      ["getGenesisHash", "getBlock", "getBlocksWithLimit", "getBlock"],
    ],
  ])(
    "ends the endpoint's answer at %s, and no later call starts",
    async (_name, script, methods) => {
      const f = solanaFake({ [A]: agreeing(), [B]: script });
      const read = tracked(readSolanaValueByQuorum(f.deps, config, SLOT));
      await f.clock.advance(RPC_TIMEOUT_MS - 1);
      expect(read.settled()).toBe(false);
      await f.clock.advance(1);
      const result = await read.done;
      expect(result).toMatchObject({ ok: false, reason: "too-few" });
      expect(result.answers[1]).toMatchObject({
        genesis: "pinned",
        blockHash: undefined,
        missing: "no-answer",
      });
      expect(methodsTo(f, B)).toEqual(methods);
      expect(f.unexpected).toEqual([]);
    },
  );

  it("takes 45 s at worst: two calls answering just before their deadlines, the third timing out", async () => {
    const late = RPC_TIMEOUT_MS - 1;
    const script = skipWith({
      atN: { after: late, reply: { error: -32_007 } },
      list: { after: late, reply: { result: [Number(NEXT)] } },
      atM: "hang",
    });
    const f = solanaFake({ [A]: script, [B]: script });
    const read = tracked(readSolanaValueByQuorum(f.deps, config, SLOT));
    await f.clock.advance(2 * late + RPC_TIMEOUT_MS - 1);
    expect(read.settled()).toBe(false);
    await f.clock.advance(1);
    const result = await read.done;
    expect(f.clock.now()).toBe(44_998);
    expect(result).toMatchObject({ ok: false, reason: "too-few" });
    expect(
      f.requests.filter(r => r.url === A).map(r => [r.method, r.at]),
    ).toEqual([
      ["getGenesisHash", 0],
      ["getBlock", 0],
      ["getBlocksWithLimit", late],
      ["getBlock", 2 * late],
    ]);
  });

  it("gives each call its own 15 s timer and aborts only the one that timed out", async () => {
    const f = solanaFake({
      [A]: agreeing(),
      [B]: { ...agreeing(), genesis: "hang" },
    });
    const read = readSolanaValueByQuorum(f.deps, config, SLOT);
    await f.clock.advance(RPC_TIMEOUT_MS);
    expect(await read).toMatchObject({ ok: false, reason: "no-chain-id" });
    expect(f.clock.delays.every(ms => ms === RPC_TIMEOUT_MS)).toBe(true);
    expect(f.clock.delays).toHaveLength(4);
    const signals = f.requests
      .filter(r => r.url === B)
      .map(r => [r.method, r.init?.signal?.aborted]);
    expect(signals).toEqual([
      ["getGenesisHash", true],
      ["getBlock", false],
    ]);
  });
});

describe("readSolanaValueByQuorum with an abort signal", () => {
  it("ends every request during the skip path and rejects with an AbortError", async () => {
    const script = skipWith({ list: "hang" });
    const f = solanaFake({ [A]: script, [B]: script });
    const controller = new AbortController();
    const read = tracked(
      readSolanaValueByQuorum(f.deps, config, SLOT, controller.signal),
    );
    await f.clock.advance(0);
    expect(methodsTo(f, A)).toEqual([
      "getGenesisHash",
      "getBlock",
      "getBlocksWithLimit",
    ]);
    controller.abort();
    await expect(read.done).rejects.toMatchObject({ name: "AbortError" });
    const listing = f.requests.filter(r => r.method === "getBlocksWithLimit");
    expect(listing.every(r => r.init?.signal?.aborted === true)).toBe(true);
    // Nothing is sent after the abort: getBlock at M never starts.
    await f.clock.advance(RPC_TIMEOUT_MS);
    expect(f.requests).toHaveLength(6);
  });

  it("sends nothing when the signal is already aborted", async () => {
    const f = solanaFake({ [A]: agreeing(), [B]: agreeing() });
    const controller = new AbortController();
    controller.abort();
    await expect(
      readSolanaValueByQuorum(f.deps, config, SLOT, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(f.requests).toHaveLength(0);
  });

  it("keeps a timeout as no answer, apart from the caller's signal", async () => {
    const f = solanaFake({ [A]: agreeing(), [B]: skipWith({ atM: "hang" }) });
    const controller = new AbortController();
    const read = readSolanaValueByQuorum(
      f.deps,
      config,
      SLOT,
      controller.signal,
    );
    await f.clock.advance(RPC_TIMEOUT_MS);
    expect(await read).toMatchObject({ ok: false, reason: "too-few" });
    expect(controller.signal.aborted).toBe(false);
  });

  it.each<[string, SolanaScript]>([
    ["an agreeing read", agreeing()],
    ["a skipped N", skipping()],
    ["a timed-out skip path", skipWith({ atM: "hang" })],
  ])("leaves no listener on the caller's signal after %s", async (_name, s) => {
    const f = solanaFake({ [A]: s, [B]: s });
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const read = readSolanaValueByQuorum(
      f.deps,
      config,
      SLOT,
      controller.signal,
    );
    await f.clock.advance(RPC_TIMEOUT_MS);
    await read;
    expect(add.mock.calls.length).toBeGreaterThan(0);
    expect(remove).toHaveBeenCalledTimes(add.mock.calls.length);
  });
});
