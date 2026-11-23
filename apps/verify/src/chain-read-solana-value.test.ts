// VT-14, an endpoint's value for slot N in the Solana chain read (RFC-007
// section 4): a block at N, a skipped N with `getBlocksWithLimit` and
// `getBlock(M)`, the ledger gaps, the readers' refusals, and the not-found
// codes. Synthetic answers; the vendored `entropy/v1/solana` reads (a produced
// slot, -32007, -32009, and a ledger gap) replay in
// chain-read-solana-vectors.test.ts. The non-32-byte and -32004 cases have no
// vendored read.

import { describe, expect, it } from "vitest";

import { answerOf, endpoints, read, SOL_A } from "./fixtures/solana-read.ts";
import {
  agreeing,
  blockAt,
  BYTES_31,
  BYTES_33,
  NEXT,
  type Scripted,
  skipping,
  SLOT,
  solanaFake,
  type SolanaScript,
  VALUE_A,
  VALUE_B,
} from "./fixtures/solana-rpc.ts";

const N = SLOT.toString();
const M = NEXT.toString();

/** N skipped, with `atM` for `getBlock(M)`. */
const skippedTo = (atM: Scripted): SolanaScript => ({
  ...skipping(),
  blocks: { ...skipping().blocks, [M]: atM },
});

/** N skipped, with `listed` for `getBlocksWithLimit(N, 1)`. */
const listing = (listed: Scripted): SolanaScript => ({
  ...skipping(),
  next: { [N]: listed },
});

describe("readSolanaValueByQuorum: an endpoint's value", () => {
  it("is a block at N's blockhash, as 0x and lowercase hex", async () => {
    const { result, answer } = await answerOf(agreeing());
    expect(result).toMatchObject({ ok: true, blockHash: VALUE_A.hex });
    expect(answer).toEqual({
      provider: "p0",
      genesis: "pinned",
      blockHash: VALUE_A.hex,
      fromSlot: undefined,
      missing: undefined,
    });
  });

  it.each([-32_007, -32_009])(
    "is the next block's when N was skipped (%i), noting the slot",
    async code => {
      const { result, answer } = await answerOf(skipping(VALUE_B.base58, code));
      expect(result).toMatchObject({ ok: true, blockHash: VALUE_B.hex });
      expect(answer).toMatchObject({ blockHash: VALUE_B.hex, fromSlot: NEXT });
    },
  );

  it("is the next block's when its parent is before N", async () => {
    const { answer } = await answerOf(
      skippedTo({ result: blockAt(NEXT, VALUE_A.base58, { parentSlot: 0 }) }),
    );
    expect(answer).toMatchObject({ blockHash: VALUE_A.hex, fromSlot: NEXT });
  });

  it.each<[string, SolanaScript]>([
    [
      "M's parent at N",
      skippedTo({
        result: blockAt(NEXT, VALUE_A.base58, { parentSlot: Number(SLOT) }),
      }),
    ],
    [
      "M's parent after N",
      skippedTo({
        result: blockAt(NEXT, VALUE_A.base58, { parentSlot: Number(SLOT) + 1 }),
      }),
    ],
    ["M equal to N", listing({ result: [Number(SLOT)] })],
    ["M before N", listing({ result: [Number(SLOT) - 1] })],
    ["-32007 from getBlock at M", skippedTo({ error: -32_007 })],
    ["-32009 from getBlock at M", skippedTo({ error: -32_009 })],
  ])("is a ledger gap: %s", async (_name, script) => {
    const { result, answer } = await answerOf(script);
    expect(answer).toMatchObject({
      genesis: "pinned",
      blockHash: undefined,
      fromSlot: undefined,
      missing: "ledger-gap",
    });
    expect(result).toMatchObject({ ok: false, reason: "ledger-gap" });
  });

  it("asks no getBlock at M when M equals N: the skip is contradicted", async () => {
    const f = solanaFake(endpoints(listing({ result: [Number(SLOT)] })));
    expect(await read(f)).toMatchObject({ ok: false, reason: "ledger-gap" });
    expect(f.requests.filter(r => r.url === SOL_A).map(r => r.method)).toEqual([
      "getGenesisHash",
      "getBlock",
      "getBlocksWithLimit",
    ]);
  });

  it.each<[string, SolanaScript]>([
    ["an empty getBlocksWithLimit", listing({ result: [] })],
    [
      "a getBlocksWithLimit of two slots",
      listing({ result: [Number(NEXT), Number(NEXT) + 1] }),
    ],
    [
      "a getBlocksWithLimit slot that is a string",
      listing({ result: [String(NEXT)] }),
    ],
    ["an error from getBlocksWithLimit", listing({ error: -32_004 })],
    [
      "M's parent at M",
      skippedTo({
        result: blockAt(NEXT, VALUE_A.base58, { parentSlot: Number(NEXT) }),
      }),
    ],
    ["a null block at M", skippedTo({ result: null })],
  ])("is no answer: %s", async (_name, script) => {
    const { answer } = await answerOf(script);
    expect(answer).toMatchObject({
      blockHash: undefined,
      missing: "no-answer",
    });
  });

  it.each([-32_001, -32_004, -32_014, -32_019])(
    "is not available on %i from getBlock at N",
    async code => {
      const { answer } = await answerOf({ blocks: { [N]: { error: code } } });
      expect(answer).toMatchObject({
        blockHash: undefined,
        missing: "not-available",
      });
    },
  );

  it.each([-32_001, -32_004, -32_014, -32_019])(
    "is not available on %i from getBlock at M",
    async code => {
      const { answer } = await answerOf(skippedTo({ error: code }));
      expect(answer).toMatchObject({
        blockHash: undefined,
        missing: "not-available",
      });
    },
  );

  it.each<[string, Readonly<Record<string, unknown>>]>([
    ["a blockhash of 31 bytes", { blockhash: BYTES_31 }],
    ["a blockhash of 33 bytes", { blockhash: BYTES_33 }],
    ["a blockhash in hex", { blockhash: VALUE_A.hex }],
    ["a previousBlockhash of 33 bytes", { previousBlockhash: BYTES_33 }],
    ["a previousBlockhash missing", { previousBlockhash: undefined }],
    ["a null blockTime", { blockTime: null }],
    ["a missing blockTime", { blockTime: undefined }],
    ["a fractional blockTime", { blockTime: 1.5 }],
    ["a parentSlot at N", { parentSlot: Number(SLOT) }],
    ["a negative parentSlot", { parentSlot: -1 }],
    ["a parentSlot that is a string", { parentSlot: String(SLOT - 1n) }],
  ])("is no answer for a block at N with %s", async (_name, change) => {
    const { answer } = await answerOf({
      blocks: { [N]: { result: blockAt(SLOT, VALUE_A.base58, change) } },
    });
    expect(answer).toMatchObject({
      blockHash: undefined,
      missing: "no-answer",
    });
  });

  it.each<[string, Scripted]>([
    ["a null result", { result: null }],
    ["another error", { error: -32_602 }],
    ["a status other than 200", { status: 500 }],
    [
      "a body that is not JSON-RPC 2.0",
      { body: { result: blockAt(SLOT, VALUE_A.base58) } },
    ],
  ])("is no answer for %s", async (_name, reply) => {
    const { answer } = await answerOf({ blocks: { [N]: reply } });
    expect(answer).toMatchObject({
      blockHash: undefined,
      missing: "no-answer",
    });
  });
});
