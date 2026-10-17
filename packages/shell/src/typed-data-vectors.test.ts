// The typedData the shell sends is the canonical encoding, byte for byte: a
// move, a cash-out, and a cancel built by the shell (through the round flow,
// or its request builder) carry exactly the vendored `typed-data/` vectors'
// base64. The Coin Flip pick and cancel are tied to the vendored round
// `valid/coinflip-active-ready-hash` (`previous` is its `readyHash`); the
// multi-path pick and the cash-out to the worked round of `signing.json`
// (`previous` is its T_2 and T_3). The cancel is signed with the test's
// stand-in `PlayerCancel` hash (#41): its typedData does not depend on it.

import { describe, expect, it } from "vitest";

import { createFakePlay, ok } from "./fixtures/fake-play.ts";
import { TIP_FAILED, TIP_PASSED } from "./fixtures/flow-stand-ins.ts";
import {
  ROUND_REQUEST,
  roundConfig,
  vendoredRound,
} from "./fixtures/round-auth.ts";
import { openTestSession, openWorkedRound } from "./fixtures/session.ts";
import { ROUND_ID, snapshot, typedDataVector } from "./fixtures/vectors.ts";
import { cashOut, playMoves, requestOf } from "./fixtures/worked-round.ts";
import { createRoundDelivery } from "./round-delivery.ts";
import { createRoundFlow } from "./round-flow.ts";
import { legalMove } from "./round-legality.ts";

type Body = Readonly<Record<string, unknown>>;

const AUTHORIZATION = (): string => "Bearer placeholder";

/** The hex of a base64 text, to compare with a vector's `hex`. */
const hexOf = (base64: string): string =>
  `0x${Buffer.from(base64, "base64").toString("hex")}`;

/**
 * The vendored Coin Flip round's flow as the shell would hold it after its
 * start, with no typedData encoder passed: the production default.
 */
const coinFlip = async (
  tip: typeof TIP_PASSED,
): Promise<{
  readonly flow: ReturnType<typeof createRoundFlow>;
  readonly play: ReturnType<typeof createFakePlay>;
}> => {
  const play = createFakePlay();
  const flow = createRoundFlow(
    {
      session: await openTestSession(),
      transport: play.transport,
      authorization: AUTHORIZATION,
      config: roundConfig(),
      tipCheck: () => Promise.resolve(tip),
    },
    { roundId: ROUND_ID, request: ROUND_REQUEST },
    vendoredRound(),
  );
  return { flow, play };
};

describe("through the round flow, with the production encoder", () => {
  it("the first Coin Flip move carries the coinflip-pick vector", async () => {
    const { flow, play } = await coinFlip(TIP_PASSED);
    await flow.observe(vendoredRound());
    expect(flow.verdict().state).toBe("ready");
    play.answer("continueRound", ok(vendoredRound()));
    expect(await flow.pick({ step: 0, option: 1 })).toEqual({ accepted: true });
    const body = play.sent("continueRound")[0]?.body as Body;
    const vector = typedDataVector("coinflip-pick");
    expect(body["typedData"]).toBe(vector.base64);
    expect(hexOf(vector.base64)).toBe(vector.hex);
  });

  it("the required Coin Flip cancel carries the coinflip-cancel vector", async () => {
    const { flow, play } = await coinFlip(TIP_FAILED);
    play.answer("cancelRound", ok(vendoredRound()));
    await flow.observe(vendoredRound());
    expect(flow.cancel()).toBe("sent");
    const body = play.sent("cancelRound")[0]?.body as Body;
    expect(body["typedData"]).toBe(typedDataVector("coinflip-cancel").base64);
  });
});

/** The request of a legal move, or a thrown error. */
const moveRequest = (
  ...args: Parameters<typeof legalMove>
): Parameters<ReturnType<typeof createRoundDelivery>["sign"]>[1] => {
  const legality = legalMove(...args);
  if (!legality.legal) throw new TypeError("fixture: the move is not legal");
  return legality.request;
};

/** The request builder over the worked round's transcript state. */
const builder = (
  round: ReturnType<typeof openWorkedRound>,
): ReturnType<typeof createRoundDelivery> =>
  createRoundDelivery(
    { transport: createFakePlay().transport, authorization: AUTHORIZATION },
    {
      roundId: ROUND_ID,
      observe: () => Promise.resolve(),
      signer: () => round,
    },
  );

describe("through the request builder, on the worked round", () => {
  it("the third move (path [0, 1, 2]) carries the pick-multi-path vector", async () => {
    const round = openWorkedRound(await openTestSession());
    playMoves(round, 2);
    const request = moveRequest(snapshot("active", { step: 2 }), 2, {
      step: 2,
      option: 2,
    });
    const sent = builder(round).sign(round, request);
    expect(sent.body.typedData).toBe(typedDataVector("pick-multi-path").base64);
  });

  it("the cash-out after three moves carries the cash-out vector", async () => {
    const round = openWorkedRound(await openTestSession());
    playMoves(round, 3);
    const sent = builder(round).sign(round, requestOf(cashOut));
    expect(sent.body.typedData).toBe(typedDataVector("cash-out").base64);
  });
});
