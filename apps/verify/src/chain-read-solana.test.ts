// VT-14, the Solana chain read (RFC-007 section 4): the calls and their exact
// options, the configuration it refuses, the genesis hash, and the failure
// order, against a fake endpoint set. Synthetic answers until
// `entropy/solana/v1` is vendored (RFC-007 slice 6).

import { describe, expect, it } from "vitest";

import { readSolanaValueByQuorum } from "./chain-read-solana.ts";
import {
  answerOf,
  endpoints,
  OPTIONS,
  read,
  SOL_A,
  SOL_B,
  SOL_C,
  SOL_D,
  solanaConfig,
  URLS,
} from "./fixtures/solana-read.ts";
import {
  agreeing,
  MAINNET,
  NEXT,
  type Scripted,
  skipping,
  SLOT,
  solanaFake,
  type SolanaScript,
  TESTNET,
  VALUE_A,
  VALUE_B,
} from "./fixtures/solana-rpc.ts";

describe("readSolanaValueByQuorum: the calls", () => {
  it("asks each endpoint getGenesisHash and getBlock at N, at once, and nothing else", async () => {
    const f = solanaFake(endpoints(agreeing()));
    await read(f);
    expect(f.unexpected).toEqual([]);
    expect(f.requests.map(r => [r.url, r.method, r.params, r.at])).toEqual(
      URLS.flatMap(url => [
        [url, "getGenesisHash", [], 0],
        [url, "getBlock", [Number(SLOT), OPTIONS], 0],
      ]),
    );
  });

  it("asks a skipped N's next block with getBlocksWithLimit, then getBlock at M", async () => {
    const f = solanaFake(endpoints(skipping()));
    await read(f);
    expect(f.unexpected).toEqual([]);
    expect(
      f.requests.filter(r => r.url === SOL_A).map(r => [r.method, r.params]),
    ).toEqual([
      ["getGenesisHash", []],
      ["getBlock", [Number(SLOT), OPTIONS]],
      ["getBlocksWithLimit", [Number(SLOT), 1, { commitment: "finalized" }]],
      ["getBlock", [Number(NEXT), OPTIONS]],
    ]);
  });

  it.each([
    ["more endpoints than configured", { minRpcQuorum: 3 }],
    ["a quorum of 1 in production (W-26a)", { minRpcQuorum: 1 }],
    ["a quorum of 0", { minRpcQuorum: 0, environment: "preview" as const }],
    ["no genesis hash", { genesisHash: "" }],
    ["a negative cluster number", { entropyChainId: -1 }],
  ])("refuses %s, and asks nothing", async (_name, overrides) => {
    const f = solanaFake(endpoints(agreeing()));
    expect(await read(f, solanaConfig(URLS, overrides))).toEqual({
      ok: false,
      reason: "config",
      answers: [],
    });
    expect(f.requests).toEqual([]);
  });

  it.each([-1n, BigInt(Number.MAX_SAFE_INTEGER) + 1n])(
    "refuses slot %s, and asks nothing",
    async slot => {
      const f = solanaFake(endpoints(agreeing()));
      expect(
        await readSolanaValueByQuorum(f.deps, solanaConfig(), slot),
      ).toEqual({ ok: false, reason: "config", answers: [] });
      expect(f.requests).toEqual([]);
    },
  );
});

describe("readSolanaValueByQuorum: the genesis hash", () => {
  it.each<[string, Scripted, "pinned" | "other" | undefined]>([
    ["the pinned one", { result: MAINNET }, "pinned"],
    ["another cluster's", { result: TESTNET }, "other"],
    ["not base58", { result: `0x${"00".repeat(32)}` }, undefined],
    ["a number", { result: 101 }, undefined],
    ["an error", { error: -32_603 }, undefined],
  ])("reads %s", async (_name, genesis, expected) => {
    const { answer } = await answerOf({ ...agreeing(), genesis });
    expect(answer?.genesis).toBe(expected);
  });
});

const silentBlocks = { [SLOT.toString()]: { status: 503 } };
const silent: SolanaScript = { genesis: { status: 503 }, blocks: silentBlocks };
const gap: SolanaScript = {
  ...skipping(),
  next: { [SLOT.toString()]: { result: [Number(SLOT)] } },
};

describe("readSolanaValueByQuorum: the quorum, in order", () => {
  it.each<[string, SolanaScript, SolanaScript, string]>([
    [
      "another genesis hash, from an endpoint with no value",
      agreeing(),
      { genesis: { result: TESTNET }, blocks: silentBlocks },
      "other-chain",
    ],
    [
      "another genesis hash before a ledger gap",
      { ...gap, genesis: { result: TESTNET } },
      gap,
      "other-chain",
    ],
    [
      "a ledger gap on one endpoint, even with too few",
      gap,
      silent,
      "ledger-gap",
    ],
    ["one endpoint silent", agreeing(), silent, "too-few"],
    [
      // `too-few` comes before `no-chain-id` in the order.
      "a value without the genesis hash, the other endpoint silent",
      { ...agreeing(), genesis: { status: 503 } },
      silent,
      "too-few",
    ],
    [
      "a value without the genesis hash",
      agreeing(),
      { ...agreeing(), genesis: { status: 503 } },
      "no-chain-id",
    ],
    [
      "the genesis hash without a value, below the quorum",
      agreeing(),
      { blocks: { [SLOT.toString()]: { error: -32_001 } } },
      "too-few",
    ],
    ["two values", agreeing(), agreeing(VALUE_B.base58), "hash-mismatch"],
    [
      // N's block on one, the next block's on the other: two values.
      "two endpoints that disagree on the skip",
      agreeing(VALUE_A.base58),
      skipping(VALUE_B.base58),
      "hash-mismatch",
    ],
    [
      "a ledger gap on an endpoint without the genesis hash, as no value",
      agreeing(),
      { ...gap, genesis: { status: 503 } },
      "too-few",
    ],
  ])("fails on %s", async (_name, a, b, reason) => {
    const f = solanaFake(endpoints(a, b));
    expect(await read(f)).toMatchObject({ ok: false, reason });
  });

  it("fails as no-block when an endpoint has the genesis hash but no value", async () => {
    const f = solanaFake({
      [SOL_A]: agreeing(),
      [SOL_B]: agreeing(),
      [SOL_C]: { blocks: { [SLOT.toString()]: { error: -32_004 } } },
    });
    expect(await read(f, solanaConfig([SOL_A, SOL_B, SOL_C]))).toMatchObject({
      ok: false,
      reason: "no-block",
    });
  });

  // `no-block` counts only an endpoint that gave the pinned genesis hash: one
  // that said nothing at all only counts toward `too-few`, as in the EVM read.
  it("passes with a quorum when a third endpoint is fully silent", async () => {
    const f = solanaFake({
      [SOL_A]: agreeing(),
      [SOL_B]: agreeing(),
      [SOL_C]: silent,
    });
    expect(await read(f, solanaConfig([SOL_A, SOL_B, SOL_C]))).toMatchObject({
      ok: true,
      blockHash: VALUE_A.hex,
    });
  });

  it("passes with a quorum when a third endpoint saw a ledger gap but gave no genesis hash", async () => {
    const f = solanaFake({
      [SOL_A]: agreeing(),
      [SOL_B]: agreeing(),
      [SOL_C]: { ...gap, genesis: { status: 503 } },
    });
    expect(await read(f, solanaConfig([SOL_A, SOL_B, SOL_C]))).toMatchObject({
      ok: true,
      blockHash: VALUE_A.hex,
    });
  });

  it("fails as no-chain-id when a third endpoint gives a value but no genesis hash", async () => {
    const f = solanaFake({
      [SOL_A]: agreeing(),
      [SOL_B]: agreeing(),
      [SOL_C]: { ...agreeing(), genesis: { status: 503 } },
    });
    expect(await read(f, solanaConfig([SOL_A, SOL_B, SOL_C]))).toMatchObject({
      ok: false,
      reason: "no-chain-id",
    });
  });

  // `no-chain-id` comes before `no-block` in the order.
  it("fails as no-chain-id before no-block, with both present", async () => {
    const f = solanaFake({
      [SOL_A]: agreeing(),
      [SOL_B]: agreeing(),
      [SOL_C]: { ...agreeing(), genesis: { status: 503 } },
      [SOL_D]: { blocks: { [SLOT.toString()]: { error: -32_004 } } },
    });
    expect(
      await read(f, solanaConfig([SOL_A, SOL_B, SOL_C, SOL_D])),
    ).toMatchObject({ ok: false, reason: "no-chain-id" });
  });

  it("passes when the endpoints agree, with each one's answer", async () => {
    const f = solanaFake(endpoints(agreeing()));
    expect(await read(f)).toEqual({
      ok: true,
      blockHash: VALUE_A.hex,
      degraded: false,
      answers: URLS.map((_, i) => ({
        provider: `p${String(i)}`,
        genesis: "pinned",
        blockHash: VALUE_A.hex,
        fromSlot: undefined,
        missing: undefined,
      })),
    });
  });

  it("passes when the endpoints agree on a skipped N", async () => {
    const f = solanaFake(endpoints(skipping(VALUE_B.base58)));
    expect(await read(f)).toMatchObject({ ok: true, blockHash: VALUE_B.hex });
  });

  it("is degraded with one endpoint and a quorum of 1 (W-26a)", async () => {
    const f = solanaFake(endpoints(agreeing()));
    const result = await read(
      f,
      solanaConfig([SOL_B], { minRpcQuorum: 1, environment: "preview" }),
    );
    expect(result).toMatchObject({ ok: true, degraded: true });
    expect(f.requests.every(r => r.url === SOL_B)).toBe(true);
  });
});
