// The recorded rounds the fake verify API serves (specs/verify-page.md, "The e2e
// fake of the verify API"): their shapes, what the configuration pins from them,
// their tampered copies, and the block hash the fake RPC endpoints give. The
// verify page itself is not loaded (its browser rows are
// verify-page-recorded.spec.ts).

import { rpcAnswer, blockHash } from "./harness/fake-rpc.ts";
import {
  recordedBlock,
  recordedPins,
  recordedRound,
  recordedRoundId,
  tamperedRecordedRound,
} from "./harness/recorded-rounds.ts";
import { expect, test } from "./harness/verify-page.ts";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The dotted paths whose leaf values differ between two JSON values. */
const changedPaths = (
  before: unknown,
  after: unknown,
  path = "",
): readonly string[] => {
  if (isObject(before) && isObject(after)) {
    return [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].flatMap(key =>
      changedPaths(
        before[key],
        after[key],
        path === "" ? key : `${path}.${key}`,
      ),
    );
  }
  return Object.is(before, after) ? [] : [path];
};

test.describe("the recorded rounds", () => {
  test("are the backend's won and lost rounds, each with its reveals", () => {
    expect(recordedRound("won")).toMatchObject({
      status: "won",
      kernel: { version: 1 },
      payout: { amount: "194" },
      recomputed: { kind: "won" },
    });
    expect(recordedRound("lost")).toMatchObject({
      status: "lost",
      kernel: { version: 1 },
      payout: { amount: "0" },
      recomputed: { kind: "lost" },
    });
    for (const kind of ["won", "lost"] as const) {
      expect(recordedRound(kind)["reveal"]).toHaveProperty("roundSecret");
      expect(recordedRound(kind)["reveal"]).toHaveProperty("seed");
      expect(recordedRoundId(kind)).toMatch(/^[0-9a-f-]{36}$/u);
    }
    expect(recordedRoundId("won")).not.toBe(recordedRoundId("lost"));
  });

  test("pin what the recordings carry, which both share", () => {
    const pins = recordedPins();
    for (const kind of ["won", "lost"] as const) {
      const round = recordedRound(kind) as {
        commitment: Record<string, unknown>;
        entropy: Record<string, unknown>;
      };
      expect(round.commitment["adminSigner"]).toBe(pins.signer);
      expect(round.commitment["registryAddress"]).toBe(
        pins.domain.verifyingContract,
      );
      expect(round.commitment["registryChainId"]).toBe(pins.domain.chainId);
      expect(round.entropy["source"]).toBe(pins.source);
      expect(round.entropy["chainId"]).toBe(pins.entropyChainId);
      expect(round.entropy["block"]).toBe(Number(recordedBlock().number));
      expect(round.entropy["value"]).toBe(recordedBlock().hash);
    }
  });

  test("a tampered copy changes one field of the recording", () => {
    for (const kind of ["won", "lost"] as const) {
      expect(
        changedPaths(
          recordedRound(kind),
          tamperedRecordedRound(kind, "roundSecret"),
        ),
      ).toEqual(["reveal.roundSecret"]);
      expect(
        changedPaths(recordedRound(kind), tamperedRecordedRound(kind, "loser")),
      ).toEqual(["recomputed.steps.0.losers.0"]);
    }
  });

  test("the fake RPC gives block N its recorded hash, and the other chain another", () => {
    const { number, hash } = recordedBlock();
    const chain = {
      chainId: BigInt(recordedPins().entropyChainId),
      blockNumber: number,
      blockNumberHash: hash,
    };
    const params = [`0x${number.toString(16)}`, false];
    expect(
      rpcAnswer("agree", "eth_getBlockByNumber", params, chain),
    ).toMatchObject({ result: { hash } });
    expect(
      rpcAnswer("other-hash", "eth_getBlockByNumber", params, chain),
    ).toMatchObject({ result: { hash: blockHash(number, "b") } });
  });
});
