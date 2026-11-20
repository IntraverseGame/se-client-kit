// VT-14, check 6 of a Solana round as the page runs it (RFC-007 section 4):
// the reader picked by the source's kind, the display, `entropy.value`, and a
// round not ended. Synthetic answers and rounds until `entropy/solana/v1` and
// the Solana round vectors are vendored (RFC-007 slice 6).

import { describe, expect, it } from "vitest";

import { checkBlock } from "./block-check.ts";
import type { Detail } from "./check-result.ts";
import type { VerifyConfig } from "./environment-config.ts";
import { BOOK_ROUND_ID, checkOf } from "./fixtures/book-run.ts";
import { SOL_A, SOL_B } from "./fixtures/solana-read.ts";
import {
  both,
  mixedConfig,
  solanaBook,
  solanaEvidence,
} from "./fixtures/solana-round.ts";
import {
  agreeing,
  NEXT,
  skipping,
  SLOT,
  type SolanaScript,
  solanaFake,
  TESTNET,
  VALUE_A,
  VALUE_B,
} from "./fixtures/solana-rpc.ts";
import { waitsForEnd } from "./round-report.ts";
import { verifyRound } from "./verify-round.ts";

const gap: SolanaScript = {
  ...skipping(),
  next: { [SLOT.toString()]: { result: [0] } },
};

// One endpoint may give a value alone, so `no-block` can show (W-26a).
const quorumOfOne: VerifyConfig = {
  ...mixedConfig,
  environment: "preview",
  minRpcQuorum: 1,
};

describe("check 6 of a solana source", () => {
  it("passes on the quorum's value, showing each endpoint's cluster and value", async () => {
    const f = solanaFake(both(agreeing()));
    const { result, agreed } = await checkBlock(
      f.deps,
      mixedConfig,
      await solanaEvidence("won"),
    );
    expect(f.unexpected).toEqual([]);
    expect(agreed).toBe(VALUE_A.hex);
    expect(result).toMatchObject({ id: 6, status: "matches", degraded: false });
    expect(result.details).toEqual([
      { label: "s0: genesis hash", value: "this cluster" },
      { label: "s0: block value", value: VALUE_A.hex },
      { label: "s1: genesis hash", value: "this cluster" },
      { label: "s1: block value", value: VALUE_A.hex },
    ]);
  });

  it("shows that N was skipped and the slot the value came from", async () => {
    const f = solanaFake(both(skipping(VALUE_B.base58)));
    const { result, agreed } = await checkBlock(
      f.deps,
      mixedConfig,
      await solanaEvidence("won"),
    );
    expect(agreed).toBe(VALUE_B.hex);
    expect(result.details).toContainEqual({
      label: "s0: skipped slot",
      value: `slot ${SLOT.toString()} was skipped; the value is the block at slot ${NEXT.toString()}`,
    });
  });

  it("is could not be verified, with 'this provider does not serve slot N', for an ended round past the history", async () => {
    const f = solanaFake(
      both({ blocks: { [SLOT.toString()]: { error: -32_001 } } }),
    );
    const evidence = await solanaEvidence("won");
    const { result, agreed } = await checkBlock(f.deps, mixedConfig, evidence);
    expect(agreed).toBeUndefined();
    expect(result).toMatchObject({
      status: "unverified",
      note: "Too few endpoints answered.",
      chainFailure: "too-few",
    });
    expect(result.details).toContainEqual({
      label: "s0: block value",
      value: `this provider does not serve slot ${SLOT.toString()}`,
    });
    // Fails closed (Q14): V-7's chain wording, and check 7 is not checked.
    const report = await verifyRound(
      f.deps,
      mixedConfig,
      await solanaBook(VALUE_A.hex),
      BOOK_ROUND_ID,
    );
    expect(checkOf(report, 6).status).toBe("unverified");
    expect(checkOf(report, 7).status).toBe("not-checked");
    expect(report.verdict).toEqual({ kind: "chain-unverified" });
  });

  it.each<
    [string, SolanaScript, SolanaScript, VerifyConfig, string, string, Detail]
  >([
    [
      "another cluster",
      { ...agreeing(), genesis: { result: TESTNET } },
      agreeing(),
      mixedConfig,
      "other-chain",
      "An endpoint reports another cluster's genesis hash.",
      { label: "s0: genesis hash", value: "another cluster" },
    ],
    [
      "a ledger gap",
      gap,
      gap,
      mixedConfig,
      "ledger-gap",
      "An endpoint's ledger has a gap at slot N.",
      {
        label: "s0: block value",
        value: `its ledger has a gap at slot ${SLOT.toString()}`,
      },
    ],
    [
      "a value without the genesis hash",
      { ...agreeing(), genesis: { status: 503 } },
      agreeing(),
      mixedConfig,
      "no-chain-id",
      "An endpoint gave a block but no genesis hash.",
      { label: "s0: genesis hash", value: "no answer" },
    ],
    [
      "the genesis hash without a value",
      agreeing(),
      { blocks: { [SLOT.toString()]: { error: -32_004 } } },
      quorumOfOne,
      "no-block",
      "An endpoint gave the genesis hash but no valid block for slot N.",
      {
        label: "s1: block value",
        value: `this provider does not serve slot ${SLOT.toString()}`,
      },
    ],
    [
      "two values",
      agreeing(),
      agreeing(VALUE_B.base58),
      mixedConfig,
      "hash-mismatch",
      "The endpoints returned different block values for slot N.",
      { label: "s1: block value", value: VALUE_B.hex },
    ],
  ])(
    "names %s in Solana's words",
    async (_name, a, b, config, reason, note, detail) => {
      const f = solanaFake({ [SOL_A]: a, [SOL_B]: b });
      const { result } = await checkBlock(
        f.deps,
        config,
        await solanaEvidence("won"),
      );
      expect(result).toMatchObject({
        status: "unverified",
        chainFailure: reason,
        note,
      });
      expect(result.details).toContainEqual(detail);
    },
  );

  it.each([
    ["equal", VALUE_A.hex, "matches"],
    ["different", VALUE_B.hex, "mismatch"],
  ])(
    "compares entropy.value, %s, with the quorum's",
    async (_name, value, status) => {
      const f = solanaFake(both(agreeing()));
      const { result, agreed } = await checkBlock(
        f.deps,
        mixedConfig,
        await solanaEvidence("won", value),
      );
      expect(agreed).toBe(VALUE_A.hex);
      expect(result.status).toBe(status);
    },
  );

  it("uses the quorum's value when entropy.value is absent", async () => {
    const f = solanaFake(both(agreeing()));
    const { result } = await checkBlock(
      f.deps,
      mixedConfig,
      await solanaEvidence("won"),
    );
    expect(result.note).toBe(
      "The evidence carries no block value; the chain's is used.",
    );
    expect(result.comparisons).toEqual([
      expect.objectContaining({
        name: "block value (chain)",
        recomputed: VALUE_A.hex,
        matches: true,
      }),
    ]);
  });
});

describe("check 6 of a solana round not ended", () => {
  it("waits for the end when too few endpoints have the slot yet", async () => {
    const f = solanaFake(
      both({ blocks: { [SLOT.toString()]: { error: -32_004 } } }),
    );
    const { result } = await checkBlock(
      f.deps,
      mixedConfig,
      await solanaEvidence("active"),
    );
    expect(waitsForEnd(result).status).toBe("not-checked");
  });

  it("surfaces a ledger gap", async () => {
    const f = solanaFake(
      both({ ...skipping(), next: { [SLOT.toString()]: { result: [0] } } }),
    );
    const { result } = await checkBlock(
      f.deps,
      mixedConfig,
      await solanaEvidence("active"),
    );
    expect(result).toMatchObject({
      status: "unverified",
      chainFailure: "ledger-gap",
    });
    expect(waitsForEnd(result)).toEqual(result);
  });
});
