// T-4 and T-4b (W-15, W-16, W-20, W-23, W-24): a move and a cash-out are
// re-checked against the shell's own latest validated Snapshot, signed once
// per step with the canonical text and path, recorded with their bytes before
// they are sent, and resent with the same bytes and key.

import { recoverAddress } from "@intraverse/se-client-signing";
import { describe, expect, it } from "vitest";

import { deferred, lost, ok } from "./fixtures/fake-play.ts";
import {
  ACCEPTED,
  bodyOf,
  BUSY,
  NOT_ACTIVE,
  NOT_LEGAL,
  nth,
  setUpFlow,
  started,
  startFlow,
  THREE_STEPS,
} from "./fixtures/round-flow.ts";
import { ROUND_ID } from "./fixtures/vectors.ts";
import { createPickUseCase } from "./pick-use-case.ts";
import type { RoundFlow } from "./round-flow.ts";
import { canonicalTypedData, typedDataOf } from "./typed-data.ts";

describe("move (W-20, W-23)", () => {
  it("signs PlayerAction at sequence 1 from T_0, with the canonical text and path, and sends it", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    setup.play.answer("continueRound", ok(setup.at(1)));
    expect(await flow.pick({ step: 0, option: 2 })).toEqual(ACCEPTED);
    const action = nth(flow.evidence().signed, 0);
    expect(action.kind).toBe("action");
    expect(action.message).toEqual({
      action: "pick row 0 tile 2",
      path: [0],
      sequence: 1,
      round: action.message.round,
      previous: setup.issued.initial,
    });
    expect(recoverAddress(action.digest, action.signature)).toBe(
      setup.session.address(),
    );
    // The encoder got exactly the signed message, and its bytes were sent.
    const [encoded] = setup.encoder.calls();
    expect(encoded).toEqual({ kind: "action", message: action.message });
    const [sent] = setup.play.sent("continueRound");
    expect(bodyOf(sent)).toEqual({
      idempotencyKey: action.idempotencyKey,
      roundId: ROUND_ID,
      typedData: typedDataOf(canonicalTypedData, {
        kind: "action",
        message: action.message,
      }),
      signature: action.signature,
    });
    expect(flow.phase()).toBe("open");
  });

  it("builds the path from the steps survived, then the step played (r = len(path) - 1)", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    setup.play.answer("continueRound", ok(setup.at(1)), ok(setup.at(2)));
    await flow.pick({ step: 0, option: 0 });
    await flow.pick({ step: 1, option: 1 });
    const [first, second] = flow.evidence().signed;
    expect(second?.message).toMatchObject({
      action: "pick row 1 tile 1",
      path: [0, 1],
      sequence: 2,
      previous: first?.structHash,
    });
  });

  it.each([
    ["another step", { step: 1, option: 0 }],
    ["an option out of range", { step: 0, option: 3 }],
  ])("refuses %s and signs nothing", async (_, pick) => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    expect(await flow.pick(pick)).toEqual(NOT_LEGAL);
    expect(flow.evidence().signed).toEqual([]);
    expect(setup.encoder.calls()).toEqual([]);
  });

  it.each([
    null,
    { step: -1, option: 0 },
    { step: 0, option: 1.5 },
    { step: "0" },
  ])("refuses the malformed pick %j as invalid", async pick => {
    const { flow } = await started();
    expect(await flow.pick(pick as never)).toEqual({
      accepted: false,
      reason: "invalid",
    });
    expect(flow.evidence().signed).toEqual([]);
  });

  it("signs nothing when the encoder throws", async () => {
    const setup = await setUpFlow();
    const flow = await startFlow({
      ...setup,
      options: {
        ...setup.options,
        encodeTypedData: () => {
          throw new Error("encoder failed");
        },
      },
    });
    await expect(flow.pick({ step: 0, option: 1 })).rejects.toThrow(
      "encoder failed",
    );
    expect(flow.evidence().signed).toEqual([]);
    expect(setup.play.sent("continueRound")).toEqual([]);
  });

  it("closes Coin Flip on the move that survives its one step, with no cash-out", async () => {
    const { setup, flow } = await started();
    expect(await flow.cashOut()).toEqual(NOT_LEGAL);
    setup.play.answer("continueRound", ok(setup.closed("won", 1)));
    expect(await flow.pick({ step: 0, option: 1 })).toEqual(ACCEPTED);
    expect(flow.phase()).toBe("closed");
    expect(await flow.cashOut()).toEqual(NOT_ACTIVE);
    expect(await flow.pick({ step: 0, option: 1 })).toEqual(NOT_ACTIVE);
    expect(flow.evidence().signed).toHaveLength(1);
  });
});

describe("one signature per step (W-15, the pick use case)", () => {
  it("refuses a second pick for a step it has already signed", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    setup.play.answer("continueRound", lost);
    expect(await flow.pick({ step: 0, option: 1 })).toEqual(ACCEPTED);
    expect(await flow.pick({ step: 0, option: 2 })).toEqual(BUSY);
    expect(await flow.pick({ step: 0, option: 1 })).toEqual(BUSY);
    expect(flow.evidence().signed).toHaveLength(1);
  });

  it("refuses a step it signed when an older Snapshot arrives after it was applied", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    setup.play.answer("continueRound", ok(setup.at(1)));
    await flow.pick({ step: 0, option: 1 });
    await flow.observe(setup.at(0));
    expect(await flow.pick({ step: 0, option: 2 })).toEqual(NOT_LEGAL);
    expect(flow.evidence().signed).toHaveLength(1);
  });

  it("answers busy while a pick is in flight", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    const held = deferred();
    setup.play.answer("continueRound", held.responder);
    const first = flow.pick({ step: 0, option: 1 });
    expect(await flow.pick({ step: 0, option: 1 })).toEqual(BUSY);
    expect(await flow.cashOut()).toEqual(BUSY);
    held.release(ok(setup.at(1)));
    expect(await first).toEqual(ACCEPTED);
    expect(flow.evidence().signed).toHaveLength(1);
  });

  it("the pick use case answers not_active with no round, and otherwise asks the flow", async () => {
    const { setup, flow } = await started();
    const current: { flow?: RoundFlow } = {};
    const pick = createPickUseCase(() => current.flow);
    expect(await pick({ step: 0, option: 1 })).toEqual(NOT_ACTIVE);
    current.flow = flow;
    setup.play.answer("continueRound", ok(setup.at(1)));
    expect(await pick({ step: 0, option: 1 })).toEqual(ACCEPTED);
    expect(await pick({ step: 0, option: 1 })).toEqual(NOT_LEGAL);
  });
});

describe("cash-out (W-24)", () => {
  it("signs PlayerCashOut over the steps survived, only after one, and sends it on its route", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    expect(await flow.cashOut()).toEqual(NOT_LEGAL);
    setup.play.answer("continueRound", ok(setup.at(1)));
    await flow.pick({ step: 0, option: 1 });
    setup.play.answer("cashOutRound", ok(setup.closed("won", 1)));
    expect(await flow.cashOut()).toEqual(ACCEPTED);
    const [move, cashOut] = flow.evidence().signed;
    expect(cashOut?.kind).toBe("cash-out");
    expect(cashOut?.message).toMatchObject({
      action: "cash out",
      path: [0],
      sequence: 2,
      previous: move?.structHash,
    });
    expect(bodyOf(setup.play.sent("cashOutRound")[0])["signature"]).toBe(
      cashOut?.signature,
    );
    expect(flow.phase()).toBe("closed");
  });
});

describe("resend (W-16)", () => {
  it("sends the same bytes with the same key, and builds nothing new", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    setup.play.answer("continueRound", lost, ok(setup.at(1)));
    await flow.pick({ step: 0, option: 1 });
    expect(flow.lastError()?.name).toBe("NetworkError");
    expect(await flow.resend()).toEqual(ACCEPTED);
    const [first, again] = setup.play.sent("continueRound");
    expect(bodyOf(again)).toEqual(bodyOf(first));
    expect(flow.evidence().signed).toHaveLength(1);
    expect(setup.encoder.calls()).toHaveLength(1);
    expect(await flow.resend()).toEqual(NOT_ACTIVE);
  });
});
