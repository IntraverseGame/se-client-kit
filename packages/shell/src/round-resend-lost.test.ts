// W-16's one resend of a lost move or cash-out (decided in human review,
// 2026-10-18): an action whose send had an unknown outcome (no response, or a
// 503) is sent again,
// once, with the same bytes and idempotency key, when a later read of the round
// shows it `active` at the step before the move, the move not applied. Never
// re-signed, never twice, and never once a read shows the move applied, the
// step moved on, or the round no longer `active`.

import { ProtocolError } from "@intraverse/se-client-play-client";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import {
  deferred,
  lost,
  ok,
  problem,
  type Responder,
} from "./fixtures/fake-play.ts";
import {
  ACCEPTED,
  BUSY,
  NOT_ACTIVE,
  bodyOf,
  type FlowSetup,
  nth,
  started,
  THREE_STEPS,
} from "./fixtures/round-flow.ts";

/** A round with three steps whose first move went out with `answers`. */
const lostMove = async (...answers: Responder[]) => {
  const { setup, flow } = await started({ steps: THREE_STEPS });
  setup.play.answer("continueRound", lost, ...answers);
  expect(await flow.pick({ step: 0, option: 1 })).toEqual(ACCEPTED);
  expect(flow.lastError()?.name).toBe("NetworkError");
  return { setup, flow };
};

describe("the read after a lost move (W-16)", () => {
  it("sends the same bytes with the same key once when the move is not applied", async () => {
    const { setup, flow } = await lostMove();
    setup.play.answer("continueRound", ok(setup.at(1)));
    await flow.observe(setup.at(0));
    const [first, again] = setup.play.sent("continueRound");
    expect(setup.play.sent("continueRound")).toHaveLength(2);
    expect(JSON.stringify(bodyOf(again))).toBe(JSON.stringify(bodyOf(first)));
    expect(bodyOf(again)["idempotencyKey"]).toBe(
      nth(flow.evidence().signed, 0).idempotencyKey,
    );
    // Not re-signed: one signature, one encoding.
    expect(flow.evidence().signed).toHaveLength(1);
    expect(setup.encoder.calls()).toHaveLength(1);
    // The resend's answer shows the move applied: the round goes on.
    expect(flow.latest().step).toBe(1);
    expect(flow.phase()).toBe("open");
  });

  // W-42: `retryable` decides; a 503 with no problem body carries none.
  it.each<[string, Responder, number]>([
    ["retryable: true (resent)", problem(503, "UNAVAILABLE", true), 2],
    [
      "with no retryable, no problem body (resent)",
      request => {
        throw new ProtocolError(request, 503, "unexpected response");
      },
      2,
    ],
    [
      "retryable: false (final, not resent)",
      problem(503, "UNAVAILABLE", false),
      1,
    ],
  ])("a 503 %s", async (_, answer, sends) => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    setup.play.answer("continueRound", answer, ok(setup.at(1)));
    await flow.pick({ step: 0, option: 1 });
    await flow.observe(setup.at(0));
    expect(setup.play.sent("continueRound")).toHaveLength(sends);
  });

  it("refuses a manual resend after the automatic one: never a third send", async () => {
    const { setup, flow } = await lostMove(lost);
    await flow.observe(setup.at(0));
    expect(await flow.resend()).toEqual(NOT_ACTIVE);
    expect(setup.play.sent("continueRound")).toHaveLength(2);
  });

  it("counts a manual resend as the one resend: a later read sends nothing", async () => {
    const { setup, flow } = await lostMove(lost);
    expect(await flow.resend()).toEqual(ACCEPTED);
    await flow.observe(setup.at(0));
    expect(await flow.resend()).toEqual(NOT_ACTIVE);
    expect(setup.play.sent("continueRound")).toHaveLength(2);
  });

  // The backend recognises a repeat by its signed action (sequence and bytes)
  // in the round's action log; another action at an accepted sequence, or a wrong
  // sequence or `previous`, is a 409 (a 400 stays possible: a cancel, or an
  // engine refusal that is not stale, still answers 400). Either answer to the
  // resend is a refusal (W-19): no further send, and the read decides.
  it.each([
    [409, "STALE_ACTION"],
    [400, "INVALID_ARGUMENT"],
  ] as const)(
    "treats a %i %s to the resend as a refusal, with no further send",
    async (status, code) => {
      const { setup, flow } = await lostMove(problem(status, code));
      setup.play.answer("getSnapshot", ok(setup.at(0)));
      await flow.observe(setup.at(0));
      expect(setup.play.sent("continueRound")).toHaveLength(2);
      expect(flow.phase()).toBe("out-of-sync");
      await flow.observe(setup.at(0));
      expect(await flow.resend()).toEqual(NOT_ACTIVE);
      expect(setup.play.sent("continueRound")).toHaveLength(2);
      expect(flow.evidence().signed).toHaveLength(1);
    },
  );

  it("does not resend on a late, older read after a newer one", async () => {
    const { setup, flow } = await lostMove();
    const version = setup.at(0).version;
    // The newer read: the round `resolving` (the move may be being applied).
    await flow.observe(
      setup.read(p => {
        p.input["status"] = "resolving";
        p.input["step"] = 0;
        p.input["version"] = version + 2;
      }),
    );
    // A late read from before it shows `active` at step 0: it decides nothing.
    await flow.observe(setup.read(p => (p.input["version"] = version + 1)));
    expect(setup.play.sent("continueRound")).toHaveLength(1);
  });

  it("does not resend a move held after W-19 (stale)", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    setup.play.answer("continueRound", problem(400, "INVALID_ARGUMENT"));
    setup.play.answer("getSnapshot", lost);
    await flow.pick({ step: 0, option: 1 });
    expect(flow.phase()).toBe("stale");
    await flow.observe(setup.at(0));
    expect(setup.play.sent("continueRound")).toHaveLength(1);
  });

  it("does not resend after an answer that refused the move", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    setup.play.answer("continueRound", problem(422, "FAILED_PRECONDITION"));
    await flow.pick({ step: 0, option: 1 });
    await flow.observe(setup.at(0));
    expect(setup.play.sent("continueRound")).toHaveLength(1);
  });

  it("does not resend when the read shows the move applied", async () => {
    const { setup, flow } = await lostMove();
    await flow.observe(setup.at(1));
    expect(setup.play.sent("continueRound")).toHaveLength(1);
    expect(flow.phase()).toBe("open");
    expect(flow.latest().step).toBe(1);
  });

  it("does not resend when the read shows the step moved on", async () => {
    const { setup, flow } = await lostMove();
    await flow.observe(setup.at(2));
    expect(setup.play.sent("continueRound")).toHaveLength(1);
    expect(flow.phase()).toBe("out-of-sync");
  });

  it.each<[string, (setup: FlowSetup) => ValidSnapshot]>([
    [
      "resolving",
      setup =>
        setup.read(p => {
          p.input["status"] = "resolving";
          p.input["step"] = 0;
        }),
    ],
    ["lost", setup => setup.closed("lost", 0)],
    ["canceled", setup => setup.closed("canceled", 0)],
  ])(
    "does not resend when the read shows the round %s",
    async (status, read) => {
      const { setup, flow } = await lostMove();
      await flow.observe(read(setup));
      expect(setup.play.sent("continueRound")).toHaveLength(1);
      expect(flow.latest().status).toBe(status);
    },
  );

  it("does not resend once the session has ended (the move is no longer resendable)", async () => {
    const { setup, flow } = await lostMove();
    setup.session.end();
    await flow.observe(setup.at(0));
    expect(setup.play.sent("continueRound")).toHaveLength(1);
    expect(flow.phase()).toBe("ended");
  });

  it("sends no second resend when the resend fails too, and the move stays pending", async () => {
    const { setup, flow } = await lostMove(lost);
    await flow.observe(setup.at(0));
    expect(setup.play.sent("continueRound")).toHaveLength(2);
    expect(flow.lastError()?.name).toBe("NetworkError");
    await flow.observe(setup.at(0));
    await flow.observe(setup.at(0));
    expect(setup.play.sent("continueRound")).toHaveLength(2);
    // W-16: nothing new at that sequence; the game's next pick waits on it,
    // and the round ends by its expiry rule unless a read shows it applied.
    expect(await flow.pick({ step: 0, option: 2 })).toEqual(BUSY);
    expect(flow.evidence().signed).toHaveLength(1);
    await flow.observe(setup.closed("canceled", 0, "expired"));
    expect(flow.over()).toBe(true);
    expect(setup.play.sent("continueRound")).toHaveLength(2);
  });

  it("resends once however many reads come, during the resend and after it", async () => {
    const { setup, flow } = await lostMove();
    const held = deferred();
    setup.play.answer("continueRound", held.responder);
    const first = flow.observe(setup.at(0));
    // Reads while the resend is in flight send nothing more.
    await flow.observe(setup.at(0));
    await flow.observe(setup.at(0));
    held.release(lost);
    await first;
    await flow.observe(setup.at(0));
    await flow.observe(setup.at(0));
    expect(setup.play.sent("continueRound")).toHaveLength(2);
    expect(flow.evidence().signed).toHaveLength(1);
  });
});

/**
 * A round whose move at step 0 was applied and whose cash-out went out with
 * `answers`.
 */
const lostCashOut = async (...answers: Responder[]) => {
  const { setup, flow } = await started({ steps: THREE_STEPS });
  setup.play.answer("continueRound", ok(setup.at(1)));
  await flow.pick({ step: 0, option: 1 });
  setup.play.answer("cashOutRound", lost, ...answers);
  expect(await flow.cashOut()).toEqual(ACCEPTED);
  expect(flow.lastError()?.name).toBe("NetworkError");
  return { setup, flow };
};

describe("the read after a lost cash-out (W-16)", () => {
  it("sends the same bytes with the same key once when the cash-out is not applied", async () => {
    const { setup, flow } = await lostCashOut();
    setup.play.answer("cashOutRound", ok(setup.closed("won", 1)));
    await flow.observe(setup.at(1));
    const [first, again] = setup.play.sent("cashOutRound");
    expect(setup.play.sent("cashOutRound")).toHaveLength(2);
    expect(JSON.stringify(bodyOf(again))).toBe(JSON.stringify(bodyOf(first)));
    expect(bodyOf(again)["idempotencyKey"]).toBe(
      nth(flow.evidence().signed, 1).idempotencyKey,
    );
    expect(flow.evidence().signed).toHaveLength(2);
    expect(setup.encoder.calls()).toHaveLength(2);
    expect(flow.phase()).toBe("closed");
    expect(flow.latest().status).toBe("won");
  });

  it.each<[string, (setup: FlowSetup) => ValidSnapshot]>([
    ["applied (the round won)", setup => setup.closed("won", 1)],
    ["moved on (another step)", setup => setup.at(2)],
    [
      "not active (resolving)",
      setup =>
        setup.read(p => {
          p.input["status"] = "resolving";
          p.input["step"] = 1;
        }),
    ],
    ["not active (canceled)", setup => setup.closed("canceled", 1)],
  ])("does not resend when the read shows the round %s", async (_, read) => {
    const { setup, flow } = await lostCashOut();
    await flow.observe(read(setup));
    expect(setup.play.sent("cashOutRound")).toHaveLength(1);
  });

  it("resends once however many reads come, the resend failing too", async () => {
    const { setup, flow } = await lostCashOut(lost);
    await flow.observe(setup.at(1));
    await flow.observe(setup.at(1));
    await flow.observe(setup.at(1));
    expect(setup.play.sent("cashOutRound")).toHaveLength(2);
    expect(flow.evidence().signed).toHaveLength(2);
    expect(await flow.cashOut()).toEqual(BUSY);
  });
});
