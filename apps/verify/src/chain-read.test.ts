import { describe, expect, it } from "vitest";

import {
  BLOCK,
  CHAIN,
  type Fake,
  fake,
  HASH_A,
  HASH_B,
} from "./chain-read-fake.ts";
import {
  type ChainReadConfig,
  RPC_TIMEOUT_MS,
  readBlockHashByQuorum,
  resolveBlockValue,
} from "./chain-read.ts";

const urls = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `https://rpc${i}.example/`);

const config = (
  endpointUrls: readonly string[],
  overrides: Partial<ChainReadConfig> = {},
): ChainReadConfig => ({
  endpoints: endpointUrls.map((url, i) => ({ provider: `p${i}`, url })),
  entropyChainId: CHAIN,
  minRpcQuorum: 2,
  environment: "production",
  ...overrides,
});

const run = (f: Fake, c: ChainReadConfig) =>
  readBlockHashByQuorum(f.deps, c, BLOCK);

describe("readBlockHashByQuorum", () => {
  it("passes when a quorum agrees, and asks as W-26b says", async () => {
    const u = urls(3);
    const f = fake({});
    const result = await run(f, config(u));
    expect(result).toMatchObject({
      ok: true,
      blockHash: HASH_A,
      degraded: false,
    });
    expect(result.answers).toHaveLength(3);
    const blockCalls = f.requests.filter(
      r => r.method === "eth_getBlockByNumber",
    );
    expect(blockCalls).toHaveLength(3);
    expect(blockCalls[0]?.params).toEqual(["0x1e240", false]);
    expect(f.requests.filter(r => r.method === "eth_chainId")).toHaveLength(3);
    expect(f.delays).toHaveLength(f.requests.length);
    expect(f.delays.every(ms => ms === RPC_TIMEOUT_MS)).toBe(true);
  });

  it("passes with exactly minRpcQuorum answering and none disagreeing", async () => {
    const u = urls(3);
    const f = fake({ [u[2] as string]: { hang: true } });
    const result = await run(f, config(u));
    expect(result).toMatchObject({ ok: true, blockHash: HASH_A });
  });

  it("fails when an endpoint reports another chain id, answering or not", async () => {
    const u = urls(3);
    const answering = await run(
      fake({ [u[1] as string]: { chainId: 1 } }),
      config(u),
    );
    expect(answering).toMatchObject({ ok: false, reason: "other-chain" });
    const noBlock = await run(
      fake({ [u[1] as string]: { chainId: 1, hash: "missing" } }),
      config(u),
    );
    expect(noBlock).toMatchObject({ ok: false, reason: "other-chain" });
  });

  it("fails when too few answer, also after a timeout", async () => {
    const u = urls(3);
    const f = fake({
      [u[1] as string]: { hang: true },
      [u[2] as string]: { hang: true },
    });
    const result = await run(f, config(u));
    expect(result).toMatchObject({ ok: false, reason: "too-few" });
    expect(result.answers[1]).toMatchObject({
      chainId: undefined,
      blockHash: undefined,
    });
  });

  it("treats errors, non-blocks, and the wrong block as no answer", async () => {
    const u = urls(3);
    const result = await run(
      fake({
        [u[0] as string]: { status: 500 },
        [u[1] as string]: { hash: "0x1234" },
        [u[2] as string]: { hash: "wrong-block" },
      }),
      config(u),
    );
    expect(result).toMatchObject({ ok: false, reason: "too-few" });
  });

  it("fails when an answering endpoint gave a block but no chain id", async () => {
    const u = urls(3);
    const missing = await run(
      fake({ [u[2] as string]: { chainId: "missing" } }),
      config(u),
    );
    expect(missing).toMatchObject({ ok: false, reason: "no-chain-id" });
    const garbage = await run(
      fake({ [u[2] as string]: { chainId: "garbage" } }),
      config(u),
    );
    expect(garbage).toMatchObject({ ok: false, reason: "no-chain-id" });
  });

  it("fails on two hashes, without dropping an outlier", async () => {
    const u = urls(3);
    const result = await run(
      fake({ [u[2] as string]: { hash: HASH_B } }),
      config(u),
    );
    expect(result).toMatchObject({ ok: false, reason: "hash-mismatch" });
    expect(result.answers.map(a => a.blockHash)).toEqual([
      HASH_A,
      HASH_A,
      HASH_B,
    ]);
  });

  it("reports the first failure in W-26b's order", async () => {
    const u = urls(3);
    // another chain, too few answering, and a hash mismatch at once
    const f = fake({
      [u[0] as string]: { chainId: 1 },
      [u[1] as string]: { hang: true },
      [u[2] as string]: { hash: HASH_B },
    });
    expect(await run(f, config(u))).toMatchObject({ reason: "other-chain" });
    // too few answering and a missing chain id
    const g = fake({
      [u[0] as string]: { chainId: "missing" },
      [u[1] as string]: { hang: true },
      [u[2] as string]: { hang: true },
    });
    expect(await run(g, config(u))).toMatchObject({ reason: "too-few" });
    // a missing chain id and a hash mismatch
    const h = fake({
      [u[0] as string]: { chainId: "missing" },
      [u[1] as string]: { hash: HASH_B },
    });
    expect(await run(h, config(u.slice(0, 3)))).toMatchObject({
      reason: "no-chain-id",
    });
  });

  it("compares hashes without case, and returns them lowercase", async () => {
    const u = urls(2);
    const result = await run(
      fake({
        [u[0] as string]: { hash: HASH_A.toUpperCase().replace("0X", "0x") },
      }),
      config(u),
    );
    expect(result).toMatchObject({ ok: true, blockHash: HASH_A });
  });

  it("marks the one-endpoint development exception as degraded", async () => {
    const result = await run(
      fake({}),
      config(urls(1), { minRpcQuorum: 1, environment: "local" }),
    );
    expect(result).toMatchObject({ ok: true, degraded: true });
  });

  it("refuses configurations the Wrapper refuses at boot", async () => {
    const u = urls(2);
    const f = fake({});
    expect(await run(f, config(u, { minRpcQuorum: 1 }))).toMatchObject({
      ok: false,
      reason: "config",
    });
    expect(await run(f, config(u, { minRpcQuorum: 3 }))).toMatchObject({
      reason: "config",
    });
    expect(await run(f, config(u, { minRpcQuorum: 0 }))).toMatchObject({
      reason: "config",
    });
    expect(f.requests).toHaveLength(0);
  });

  it("compares the evidence's blockValue with the agreed hash", () => {
    expect(resolveBlockValue(HASH_A, HASH_A)).toEqual({
      blockValue: HASH_A,
      evidence: "equal",
    });
    expect(resolveBlockValue(HASH_A, HASH_B).evidence).toBe("different");
    expect(resolveBlockValue(HASH_A)).toEqual({
      blockValue: HASH_A,
      evidence: "absent",
    });
  });

  it("fails when an endpoint gave a chain id but no valid block", async () => {
    const u = urls(3);
    const f = fake({ [u[2] as string]: { hash: "missing" } });
    expect(await run(f, config(u))).toMatchObject({
      ok: false,
      reason: "no-block",
    });
    // before a hash mismatch, after a missing chain id
    const g = fake({
      [u[0] as string]: { hash: HASH_B },
      [u[2] as string]: { hash: "missing" },
    });
    expect(await run(g, config(u))).toMatchObject({ reason: "no-block" });
    const h = fake({
      [u[1] as string]: { chainId: "missing" },
      [u[2] as string]: { hash: "missing" },
    });
    expect(await run(h, config(u))).toMatchObject({ reason: "no-chain-id" });
  });

  it("fails a lone endpoint without a block, as too few, with quorum 1", async () => {
    const result = await run(
      fake({ "https://rpc0.example/": { hash: "missing" } }),
      config(urls(1), { minRpcQuorum: 1, environment: "local" }),
    );
    expect(result).toMatchObject({ ok: false, reason: "too-few" });
  });

  it("calls fetch unbound", async () => {
    const result = await run(fake({}), config(urls(2)));
    expect(result.ok).toBe(true);
  });

  it("refuses a bad quorum, chain id, or block before any request", async () => {
    const f = fake({});
    const bad = [
      config(urls(2), { minRpcQuorum: Number.NaN }),
      config(urls(2), { minRpcQuorum: 1.5 }),
      config(urls(2), { entropyChainId: -1 }),
      config(urls(2), { entropyChainId: 1.5 }),
      config(urls(2), { entropyChainId: Number.NaN }),
    ];
    const results = await Promise.all(bad.map(c => run(f, c)));
    for (const r of results) expect(r).toMatchObject({ reason: "config" });
    expect(
      await readBlockHashByQuorum(f.deps, config(urls(2)), -1n),
    ).toMatchObject({ reason: "config" });
    expect(f.requests).toHaveLength(0);
  });
});
