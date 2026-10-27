// T-4b (W-20, W-24, W-26): the vendored Cash or Crash round played through its
// last row (`valid/cashorcrash-last-row-active-step0`, `T_0` settled, the tip
// check passed). The shell signs its three picks with the bytes of
// `typed-data/cashorcrash-last-row-pick-row0` to `-row2`, each chained on the
// one before it, and the round ends `won` on the last pick's answer
// (`valid/cashorcrash-last-row-won`) with nothing signed after it: no cash-out
// is offered or sent. (`signing`'s replay of the same vectors proves the
// chain's hashes on their own.)

import { recoverAddress } from "@intraverse/se-client-signing";
import { describe, expect, it } from "vitest";

import { createFakePlay, ok } from "./fixtures/fake-play.ts";
import { TIP_PASSED } from "./fixtures/flow-stand-ins.ts";
import { ROUND_REQUEST, roundConfig } from "./fixtures/round-auth.ts";
import { NOT_ACTIVE } from "./fixtures/round-flow.ts";
import { openTestSession } from "./fixtures/session.ts";
import { typedDataVector, validated, vectorInput } from "./fixtures/vectors.ts";
import { createRoundFlow } from "./round-flow.ts";

type Body = Readonly<Record<string, unknown>>;

const STEP0 = "cashorcrash-last-row-active-step0";

/** Each pick, the Snapshot that answers it, and its `typed-data/` vector. */
const PICKS = [
  {
    pick: { step: 0, option: 0 },
    answer: "cashorcrash-last-row-active-step1",
    typedData: "cashorcrash-last-row-pick-row0",
  },
  {
    pick: { step: 1, option: 2 },
    answer: "cashorcrash-last-row-active-step2",
    typedData: "cashorcrash-last-row-pick-row1",
  },
  {
    pick: { step: 2, option: 1 },
    answer: "cashorcrash-last-row-won",
    typedData: "cashorcrash-last-row-pick-row2",
  },
] as const;

const round = (name: string): ReturnType<typeof validated> =>
  validated(vectorInput("valid", name));

/** The round's id, as the vector gives it. */
const roundIdOf = (name: string): string => {
  const { roundId } = round(name);
  if (roundId === undefined) throw new TypeError(`${name} has no roundId`);
  return roundId;
};

describe("the Cash or Crash round won on its last row (typed-data/cashorcrash-last-row-pick-*)", () => {
  it("signs the three picks as the vectors, chained, and nothing after the last", async () => {
    const play = createFakePlay();
    const session = await openTestSession();
    const first = round(STEP0);
    const flow = createRoundFlow(
      {
        session,
        transport: play.transport,
        authorization: (): string => "Bearer placeholder",
        config: roundConfig(),
        tipCheck: () => Promise.resolve(TIP_PASSED),
      },
      { roundId: roundIdOf(STEP0), request: ROUND_REQUEST },
      first,
    );
    await flow.observe(first);
    expect(flow.verdict().state).toBe("ready");

    for (const [index, { pick, answer, typedData }] of PICKS.entries()) {
      play.answer("continueRound", ok(round(answer)));
      // oxlint-disable-next-line no-await-in-loop -- each pick waits for the one before it
      expect(await flow.pick(pick)).toEqual({ accepted: true });
      const vector = typedDataVector(typedData);
      const body = play.sent("continueRound")[index]?.body as Body;
      expect(body["typedData"]).toBe(vector.base64);
      expect(body["roundId"]).toBe(roundIdOf(STEP0));
    }

    const signed = flow.evidence().signed;
    expect(signed).toHaveLength(PICKS.length);
    expect(signed.map(each => each.kind)).toEqual([
      "action",
      "action",
      "action",
    ]);
    expect(signed[0]?.message.previous).toBe(
      first.proofs?.fairnessProof?.readyHash,
    );
    for (const [index, each] of signed.entries()) {
      expect(each.message.sequence).toBe(index + 1);
      expect(recoverAddress(each.digest, each.signature)).toBe(
        session.address(),
      );
    }
    // Each later pick's `previous` is the struct hash of the one before it.
    expect(signed.slice(1).map(each => each.message.previous)).toEqual(
      signed.slice(0, -1).map(each => each.structHash),
    );

    // The round is over: won with the Snapshot's payout, nothing left to sign.
    expect(flow.latest().status).toBe("won");
    expect(flow.latest().payout?.value).toBe("289");
    expect(flow.cashOutOffered()).toBe(false);
    expect(await flow.cashOut()).toEqual(NOT_ACTIVE);
    expect(await flow.pick({ step: 2, option: 0 })).toEqual(NOT_ACTIVE);
    expect(flow.evidence().signed).toHaveLength(PICKS.length);
    expect(play.sent("continueRound")).toHaveLength(PICKS.length);
    expect(play.sent("cashOutRound")).toHaveLength(0);
  });
});
