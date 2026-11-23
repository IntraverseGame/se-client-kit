// T-40 (RFC-007 section 3): the Solana tip check reads every answer as
// untrusted data. A malformed genesis hash or slot, a JSON-RPC error, and a
// failed request are no answer; a well-formed genesis hash that differs from
// the pinned one is another cluster. Synthetic answers.

import { describe, expect, it } from "vitest";

import {
  agreeing,
  at,
  MAINNET_GENESIS,
  runSolanaScripted,
} from "./fixtures/fake-solana-rpc.ts";

describe("the Solana tip check's reading of untrusted answers", () => {
  it.each([
    ["a string", "1000"],
    ["a negative", -1],
    ["a fraction", 1000.5],
    ["above 2^53 - 1", 2 ** 53],
    ["not finite", Number.POSITIVE_INFINITY],
    ["NaN", Number.NaN],
    ["null", null],
    ["an object", { slot: 1000 }],
    ["a boolean", true],
  ])("treats a slot that is %s as no answer", async (_label, raw) => {
    const { result } = await runSolanaScripted({
      scripts: { ...agreeing(), s3: { slot: { raw } } },
    });
    expect(result.passed).toBe(true);
    expect(result.answers[2]?.finalSlot).toBeNull();
  });

  it("reads slot 0 and the largest safe integer", async () => {
    const zero = await runSolanaScripted({
      scripts: { s1: at(0n), s2: at(0n), s3: at(0n) },
    });
    expect(zero.result.passed).toBe(true);
    expect(zero.result.tip).toBe(0n);
    const largest = BigInt(Number.MAX_SAFE_INTEGER);
    const top = await runSolanaScripted({ scripts: agreeing(largest) });
    expect(top.result.tip).toBe(largest);
  });

  it.each([
    ["not a string", 42],
    ["null", null],
    ["31 characters", MAINNET_GENESIS.slice(0, 31)],
    ["45 characters", `${MAINNET_GENESIS}1`],
    ["empty", ""],
    ["with a 0", `0${MAINNET_GENESIS.slice(1)}`],
    ["with an O", `O${MAINNET_GENESIS.slice(1)}`],
    ["with an I", `I${MAINNET_GENESIS.slice(1)}`],
    ["with an l", `l${MAINNET_GENESIS.slice(1)}`],
    ["with a +", `+${MAINNET_GENESIS.slice(1)}`],
    ["with a /", `/${MAINNET_GENESIS.slice(1)}`],
    ["with a space", ` ${MAINNET_GENESIS.slice(1)}`],
    ["with a non-ASCII character", `é${MAINNET_GENESIS.slice(1)}`],
    ["hex", `0x${"ab".repeat(32)}`],
  ])(
    "treats a genesis hash that is %s as no answer, not another cluster",
    async (_label, raw) => {
      const { result } = await runSolanaScripted({
        scripts: { ...agreeing(), s3: { genesisHash: { raw }, slot: 1_000n } },
      });
      expect(result.failure).toBe("chain-id-unavailable");
      expect(result.answers[2]?.genesisHash).toBeNull();
    },
  );

  it("compares a genesis hash exactly, as a string", async () => {
    const otherCase = MAINNET_GENESIS.replace("e", "E");
    const { result } = await runSolanaScripted({
      scripts: { ...agreeing(), s3: { genesisHash: otherCase, slot: 1_000n } },
    });
    expect(result.failure).toBe("chain-id-mismatch");
    expect(result.answers[2]?.genesisHash).toBe(otherCase);
  });

  it.each(["error", "throw"] as const)(
    "treats a %s (a JSON-RPC error or a failed request) as no answer",
    async behavior => {
      const { result } = await runSolanaScripted({
        scripts: {
          ...agreeing(),
          s3: { genesisHash: behavior, slot: behavior },
        },
      });
      expect(result.passed).toBe(true);
      expect(result.answers[2]).toEqual({
        kind: "solana",
        provider: "s3",
        genesisHash: null,
        finalSlot: null,
      });
    },
  );
});
