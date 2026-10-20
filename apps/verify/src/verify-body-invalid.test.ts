// VT-3: a body the verify API document's schema refuses is never partly used
// (V-10). The body is a vendored Snapshot vector's round written as the
// document's `RoundVerification` (`verifyBody`, test-only) with one field
// changed.

import { describe, expect, it } from "vitest";

import { withField, withoutField, wonBody } from "./fixtures/verify-body.ts";
import { parseEvidence } from "./verify-body.ts";

type Json = Record<string, unknown>;

const body = wonBody;
const ID = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d";

describe("a body that does not validate is an API error, never partly used", () => {
  const hash = `0x${"ab".repeat(32)}`;
  const newRoundHex = (): string =>
    ((body()["commitment"] as Json)["createRoundAuth"] as Json)[
      "newRound"
    ] as string;
  /** `newRound` with one word replaced (a 32-byte word index, 0 to 10). */
  const withWord = (index: number, replacement: string): string => {
    const hex = newRoundHex();
    return `${hex.slice(0, 2 + index * 64)}${replacement}${hex.slice(2 + (index + 1) * 64)}`;
  };
  it.each<[string, Json]>([
    ["not an object", [] as unknown as Json],
    [
      "a round id that is not canonical",
      withField("roundId", ID.toUpperCase()),
    ],
    ["an unknown status", withField("status", "paid")],
    ["no status", withoutField("status")],
    ["no closed flag", withoutField("closed")],
    ["a void reason as a number", withField("voidReason", 7)],
    ["a reject code as a number", withField("rejectCode", 7)],
    ["no kernel", withoutField("kernel")],
    ["a fractional kernel version", withField("kernel.version", 1.5)],
    ["a kernel version of zero", withField("kernel.version", 0)],
    ["a kernel version as text", withField("kernel.version", "1")],
    ["no game", withoutField("game")],
    ["no bet", withoutField("bet")],
    ["a bet amount as a number", withField("bet.amount", 100)],
    ["no actions", withoutField("actions")],
    ["no checks", withoutField("checks")],
    ["an unknown close reason", withField("closeReason", "tired")],
    [
      "a hash in upper case",
      withField("seedHash", hash.toUpperCase().replace("0X", "0x")),
    ],
    ["a short seed", withField("reveal.seed", "0xabcd")],
    ["a block as text", withField("entropy.block", "21000123")],
    ["an unsafe block", withField("entropy.block", 2 ** 53)],
    ["a payout amount as a number", withField("payout.amount", 194)],
    ["a payout amount with a sign", withField("payout.amount", "-194")],
    ["a payout amount with a leading zero", withField("payout.amount", "0194")],
    [
      "a payout amount of 79 digits",
      withField("payout.amount", "1".repeat(79)),
    ],
    ["decimals of 78", withField("payout.decimals", 78)],
    ["an empty payout currency", withField("payout.currency", "")],
    [
      "a malformed signature",
      withField("commitment.createRoundAuth.signature", "0x00"),
    ],
    ["a malformed admin signer", withField("commitment.adminSigner", "0x3c44")],
    [
      "a malformed registry address",
      withField("commitment.registryAddress", "0x5e"),
    ],
    [
      "a newRound of 351 bytes",
      withField(
        "commitment.createRoundAuth.newRound",
        newRoundHex().slice(0, -2),
      ),
    ],
    [
      "a newRound with odd hex",
      withField("commitment.createRoundAuth.newRound", `${newRoundHex()}0`),
    ],
    [
      "a newRound with a dirty address word",
      withField(
        "commitment.createRoundAuth.newRound",
        withWord(9, "ff".repeat(32)),
      ),
    ],
    [
      "a newRound with a dirty uint128 word",
      withField(
        "commitment.createRoundAuth.newRound",
        withWord(3, `${"ff".repeat(20)}${"00".repeat(12)}`),
      ),
    ],
    [
      "a newRound with a non-ASCII unit",
      withField(
        "commitment.createRoundAuth.newRound",
        withWord(2, `ff${"00".repeat(31)}`),
      ),
    ],
    [
      "an authorization without its registry chain",
      withoutField("commitment.registryChainId"),
    ],
    [
      "an authorization without its signer",
      withoutField("commitment.adminSigner"),
    ],
    [
      "an authorization without the entropy chain",
      withoutField("entropy.chainId"),
    ],
    ["terms without nodes", withoutField("game.terms.nodes")],
    [
      "a node with no options",
      withField("game.terms.nodes", [{ options: 0, losers: 0, next: [] }]),
    ],
    [
      "a node with 26 options",
      withField("game.terms.nodes", [{ options: 26, losers: 1, next: [] }]),
    ],
    [
      "a replay step on a node the terms lack",
      withField("recomputed.steps", [
        { node: 3, option: 1, losers: [0], survived: true },
      ]),
    ],
    [
      "a replay step with a negative pick",
      withField("recomputed.steps", [
        { node: 0, option: -1, losers: [0], survived: false },
      ]),
    ],
    ["a replay of an unknown kind", withField("recomputed.kind", "drawn")],
    [
      "an action with sequence 0",
      withField("actions", [
        {
          sequence: 0,
          kind: "action",
          action: "pick",
          path: [1],
          previous: hash,
          signature: `0x${"ab".repeat(65)}`,
        },
      ]),
    ],
    [
      "an action of an unknown kind",
      withField("actions", [
        {
          sequence: 1,
          kind: "tap",
          action: "pick",
          path: [1],
          previous: hash,
          signature: `0x${"ab".repeat(65)}`,
        },
      ]),
    ],
    [
      "a check with an unknown result",
      withField("checks", [{ name: "seed", result: "ok" }]),
    ],
    ["a shape entry of 26", withField("shape", [26])],
  ])("%s", (_, json) => {
    expect(parseEvidence(json)).toBeUndefined();
  });
});
