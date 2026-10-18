// The round harness's own tests: the fake Play API's checks of what the
// Wrapper sends (round-play.ts) accept the vendored bytes and refuse anything
// else, and the fake RPC endpoints (fake-rpc.ts) answer as each behavior says,
// so a round test that passes means the Wrapper sent the vectors' bytes and
// the tip check saw what the test scripted. The checks and answers are pure
// functions; no Wrapper session is opened (the round fixtures still set up
// their page, clock, and routes).

import { blockHash, rpcAnswer } from "./harness/fake-rpc.ts";
import { expect, test } from "./harness/round-play.ts";
import {
  cancelCheck,
  pickCheck,
  ROUND,
  ROUND_PINS,
  startCheck,
} from "./harness/round-vector.ts";
import { signedActionSignature, typedDataBase64 } from "./harness/vectors.ts";

const ANOTHER_SIGNATURE = `0x${"12".repeat(65)}`;

const move = (fields: Readonly<Record<string, unknown>> = {}): unknown => ({
  idempotencyKey: "0192e4b0-0000-7000-8000-000000000001",
  roundId: ROUND.roundId,
  typedData: typedDataBase64("coinflip-pick"),
  signature: ANOTHER_SIGNATURE,
  ...fields,
});

const cancel = (fields: Readonly<Record<string, unknown>> = {}): unknown =>
  move({
    typedData: typedDataBase64("coinflip-cancel"),
    signature: signedActionSignature("coinflip-cancel"),
    ...fields,
  });

/**
 * `text` with its next-to-last character changed (the last may be base64
 * padding).
 */
const changed = (text: string): string =>
  `${text.slice(0, -2)}${text.at(-2) === "A" ? "B" : "A"}${text.at(-1) ?? ""}`;

test.describe("the round harness: body checks", () => {
  test("the start is for the round's action key only", () => {
    expect(startCheck({ actionKey: ROUND.actionKey })).toBeUndefined();
    expect(
      startCheck({
        actionKey: ROUND.actionKey.toUpperCase().replace("0X", "0x"),
      }),
    ).toBeUndefined();
    expect(startCheck({ actionKey: `0x${"ab".repeat(20)}` })).toBeDefined();
    expect(startCheck({})).toBeDefined();
  });

  test("the move is the vendored pick of this round, with a 65-byte signature", () => {
    expect(pickCheck(move())).toBeUndefined();
    expect(
      pickCheck(move({ typedData: changed(typedDataBase64("coinflip-pick")) })),
    ).toBeDefined();
    expect(
      pickCheck(move({ typedData: typedDataBase64("coinflip-cancel") })),
    ).toBeDefined();
    expect(
      pickCheck(move({ roundId: "01927c5e-8b3a-7f21-9c4d-000000000001" })),
    ).toBeDefined();
    expect(pickCheck(move({ signature: "0x1234" }))).toBeDefined();
    expect(pickCheck(move({ idempotencyKey: undefined }))).toBeDefined();
  });

  test("the cancel is the vendored cancel, with the independent signer's signature", () => {
    expect(cancelCheck(cancel())).toBeUndefined();
    expect(cancelCheck(cancel({ signature: ANOTHER_SIGNATURE }))).toBeDefined();
    expect(
      cancelCheck(
        cancel({ typedData: changed(typedDataBase64("coinflip-cancel")) }),
      ),
    ).toBeDefined();
    expect(cancelCheck(move())).toBeDefined();
  });
});

test.describe("the round harness: fake RPC answers", () => {
  const chain = {
    chainId: BigInt(ROUND_PINS.entropyChainId),
    blockNumber: ROUND.blockNumber,
  };
  const n = `0x${ROUND.blockNumber.toString(16)}`;

  test("agree: the pinned chain id, and N final with the agreeing hash", () => {
    expect(rpcAnswer("agree", "eth_chainId", [], chain)).toEqual({
      result: `0x${chain.chainId.toString(16)}`,
    });
    expect(
      rpcAnswer("agree", "eth_getBlockByNumber", ["finalized", false], chain),
    ).toEqual({
      result: {
        number: n,
        hash: blockHash(ROUND.blockNumber, "a"),
        parentHash: blockHash(ROUND.blockNumber - 1n, "a"),
      },
    });
    expect(
      rpcAnswer("agree", "eth_getBlockByNumber", [n, false], chain),
    ).toEqual(
      rpcAnswer("agree", "eth_getBlockByNumber", ["finalized", false], chain),
    );
  });

  test("other-hash: another hash at every height; other-chain: another chain id", () => {
    const agreeing = rpcAnswer(
      "agree",
      "eth_getBlockByNumber",
      [n, false],
      chain,
    );
    const other = rpcAnswer(
      "other-hash",
      "eth_getBlockByNumber",
      [n, false],
      chain,
    );
    expect(other).not.toEqual(agreeing);
    expect(other).toMatchObject({ result: { number: n } });
    expect(rpcAnswer("other-chain", "eth_chainId", [], chain)).toEqual({
      result: `0x${(chain.chainId + 1n).toString(16)}`,
    });
  });

  test("error: no result for any call; an unknown call is not answered", () => {
    expect(rpcAnswer("error", "eth_chainId", [], chain)).toHaveProperty(
      "error",
    );
    expect(
      rpcAnswer("error", "eth_getBlockByNumber", [n, false], chain),
    ).toHaveProperty("error");
    expect(
      rpcAnswer("agree", "eth_sendRawTransaction", [], chain),
    ).toBeUndefined();
    expect(
      rpcAnswer("agree", "eth_getBlockByNumber", [n, true], chain),
    ).toBeUndefined();
  });
});
