// The caller's abort signal reaches the chain read (V-5): it ends the requests
// in flight and rejects with an `AbortError`, never an endpoint's answer, so it
// is not a failure of the read and not a disagreement. A timeout stays "no
// answer".

import { describe, expect, it, vi } from "vitest";

import { BLOCK, CHAIN, fake, HASH_A, HASH_B } from "./chain-read-fake.ts";
import {
  type ChainReadConfig,
  RPC_TIMEOUT_MS,
  readBlockHashByQuorum,
} from "./chain-read.ts";

const URLS = ["https://rpc0.example/", "https://rpc1.example/"];

const config: ChainReadConfig = {
  endpoints: URLS.map((url, i) => ({ provider: `p${i}`, url })),
  entropyChainId: CHAIN,
  minRpcQuorum: 2,
  environment: "production",
};

const [A, B] = URLS as [string, string];

describe("readBlockHashByQuorum with an abort signal", () => {
  it("ends the requests in flight and rejects with an AbortError", async () => {
    const f = fake({ [A]: { park: true }, [B]: { park: true } });
    const controller = new AbortController();
    const read = readBlockHashByQuorum(
      f.deps,
      config,
      BLOCK,
      controller.signal,
    );
    expect(f.requests).toHaveLength(4);
    expect(f.signals.every(s => s?.aborted === false)).toBe(true);
    controller.abort();
    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    expect(f.signals.every(s => s?.aborted === true)).toBe(true);
  });

  it("is not counted as a disagreement or as too few answers", async () => {
    // One endpoint answered another hash; the other was cut off by the abort.
    // Without the abort this would be "hash-mismatch" or "too-few".
    const f = fake({ [A]: { hash: HASH_B }, [B]: { park: true } });
    const controller = new AbortController();
    const read = readBlockHashByQuorum(
      f.deps,
      config,
      BLOCK,
      controller.signal,
    );
    controller.abort();
    await expect(read).rejects.toMatchObject({ name: "AbortError" });
  });

  it("sends nothing when the signal is already aborted", async () => {
    const f = fake({});
    const controller = new AbortController();
    controller.abort();
    await expect(
      readBlockHashByQuorum(f.deps, config, BLOCK, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(f.requests).toHaveLength(0);
  });

  it("changes nothing for a signal that does not abort", async () => {
    const f = fake({});
    const controller = new AbortController();
    const result = await readBlockHashByQuorum(
      f.deps,
      config,
      BLOCK,
      controller.signal,
    );
    expect(result).toMatchObject({ ok: true, blockHash: HASH_A });
    expect(controller.signal.aborted).toBe(false);
  });

  it("keeps a timeout as no answer, apart from the caller's signal", async () => {
    const f = fake({ [B]: { hang: true } });
    const controller = new AbortController();
    const result = await readBlockHashByQuorum(
      f.deps,
      config,
      BLOCK,
      controller.signal,
    );
    expect(result).toMatchObject({ ok: false, reason: "too-few" });
    expect(f.delays.every(ms => ms === RPC_TIMEOUT_MS)).toBe(true);
    expect(controller.signal.aborted).toBe(false);
  });

  it.each([
    ["a resolved call", {}],
    ["a failed call", { status: 500 }],
    ["a timed-out call", { hang: true }],
  ])("leaves no listener on the caller's signal after %s", async (_name, b) => {
    const f = fake({ [A]: b, [B]: b });
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await readBlockHashByQuorum(f.deps, config, BLOCK, controller.signal);
    expect(add).toHaveBeenCalledTimes(4);
    expect(remove).toHaveBeenCalledTimes(add.mock.calls.length);
  });

  it("leaves no listener on the caller's signal after an abort", async () => {
    const f = fake({ [A]: { park: true }, [B]: { park: true } });
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const read = readBlockHashByQuorum(
      f.deps,
      config,
      BLOCK,
      controller.signal,
    );
    controller.abort();
    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    expect(remove).toHaveBeenCalledTimes(add.mock.calls.length);
  });
});
