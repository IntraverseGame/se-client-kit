// T-4b (W-20, W-24, W-26): the `PlayerCashOut` the shell signs through the
// round flow, on the vendored Cash or Crash round
// (`valid/cashorcrash-cash-out-active-step0`, `T_0` settled, the tip check
// passed) after its first pick survived (`valid/cashorcrash-cash-out-active-step1`),
// is the independent signer's `signed-action/cashorcrash-cash-out` vector: the
// same message, struct hash, digest, and typedData, and a signature that
// recovers to the session's own key. The pick before it carries
// `typed-data/cashorcrash-pick`. (The exact signature bytes with the vector's
// test key are `signing`'s replay of the same vector.)

import { recoverAddress } from "@intraverse/se-client-signing";
import { describe, expect, it } from "vitest";

import { createFakePlay, ok } from "./fixtures/fake-play.ts";
import { TIP_PASSED } from "./fixtures/flow-stand-ins.ts";
import { ROUND_REQUEST, roundConfig } from "./fixtures/round-auth.ts";
import { nth } from "./fixtures/round-flow.ts";
import { openTestSession } from "./fixtures/session.ts";
import { cashOrCrashCashOutVector } from "./fixtures/signed-action.ts";
import { typedDataVector, validated, vectorInput } from "./fixtures/vectors.ts";
import { createRoundFlow } from "./round-flow.ts";

type Body = Readonly<Record<string, unknown>>;

const STEP0 = "cashorcrash-cash-out-active-step0";
const STEP1 = "cashorcrash-cash-out-active-step1";
const WON = "cashorcrash-cash-out-won";

const round = (name: string): ReturnType<typeof validated> =>
  validated(vectorInput("valid", name));

/** The round's id, as the vector gives it. */
const roundIdOf = (name: string): string => {
  const { roundId } = round(name);
  if (roundId === undefined) throw new TypeError(`${name} has no roundId`);
  return roundId;
};

describe("the Cash or Crash cash-out (signed-action/cashorcrash-cash-out)", () => {
  it("is signed as the independent signer's vector, after the pick of typed-data/cashorcrash-pick", async () => {
    const vector = cashOrCrashCashOutVector();
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

    play.answer("continueRound", ok(round(STEP1)));
    expect(await flow.pick({ step: 0, option: 2 })).toEqual({
      accepted: true,
    });
    const pickBody = play.sent("continueRound")[0]?.body as Body;
    expect(pickBody["typedData"]).toBe(
      typedDataVector("cashorcrash-pick").base64,
    );

    play.answer("cashOutRound", ok(round(WON)));
    expect(await flow.cashOut()).toEqual({ accepted: true });
    const cashOut = nth(flow.evidence().signed, 1);
    expect(cashOut.kind).toBe("cash-out");
    expect(cashOut.message).toEqual({
      action: "cash out",
      path: [0],
      sequence: 2,
      round: vector.round,
      previous: vector.previous,
    });
    expect(cashOut.structHash).toBe(vector.structHash);
    expect(cashOut.digest).toBe(vector.digest);
    expect(recoverAddress(cashOut.digest, cashOut.signature)).toBe(
      session.address(),
    );
    const body = play.sent("cashOutRound")[0]?.body as Body;
    expect(body["typedData"]).toBe(vector.typedDataBase64);
    expect(body["typedData"]).toBe(
      typedDataVector("cashorcrash-cash-out").base64,
    );
    expect(body["signature"]).toBe(cashOut.signature);
    expect(flow.latest().status).toBe("won");
  });
});
