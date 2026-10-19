// The "move not confirmed" state (W-16; decided in human review, 2026-10-19):
// a move or a cash-out whose one resend was lost too, while the round is still
// `active` and the action neither applied nor refused. Only a lost resend gives
// it, never a first lost send, a resend in flight, a resend refused (a 400 or a
// 409, W-19), or a resend answered with a 503 marked `retryable: false`; any
// read that settles the round clears it, and a read that does not sends nothing
// more.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import {
  deferred,
  lost,
  ok,
  problem,
  type Responder,
} from "./fixtures/fake-play.ts";
import { settleMany } from "./fixtures/play-session.ts";
import {
  ACCEPTED,
  type FlowSetup,
  started,
  THREE_STEPS,
} from "./fixtures/round-flow.ts";

/** A round with three steps whose first move went out with `answers`. */
const lostMove = async (...answers: Responder[]) => {
  const { setup, flow } = await started({ steps: THREE_STEPS });
  setup.play.answer("continueRound", lost, ...answers);
  expect(await flow.pick({ step: 0, option: 1 })).toEqual(ACCEPTED);
  return { setup, flow };
};

/** As `lostMove`, with the move's one resend lost too. */
const unconfirmedMove = async () => {
  const played = await lostMove(lost);
  await played.flow.observe(played.setup.at(0));
  expect(played.setup.play.sent("continueRound")).toHaveLength(2);
  return played;
};

describe("a move not confirmed (W-16)", () => {
  it("is set once the move's one resend is lost too", async () => {
    const { setup, flow } = await unconfirmedMove();
    expect(flow.unconfirmed()).toBe("move");
    // A read that shows the move still not applied sends nothing and keeps it.
    await flow.observe(setup.at(0));
    expect(setup.play.sent("continueRound")).toHaveLength(2);
    expect(flow.unconfirmed()).toBe("move");
  });

  it("is not set after a first lost send, before any read", async () => {
    const { flow } = await lostMove();
    expect(flow.unconfirmed()).toBeUndefined();
  });

  it("is not set while the resend is in flight", async () => {
    const { setup, flow } = await lostMove();
    const held = deferred();
    setup.play.answer("continueRound", held.responder);
    const reading = flow.observe(setup.at(0));
    await settleMany();
    // The resend is out and unanswered.
    expect(setup.play.sent("continueRound")).toHaveLength(2);
    expect(flow.unconfirmed()).toBeUndefined();
    held.release(lost);
    await reading;
    expect(flow.unconfirmed()).toBe("move");
  });

  it("is not set when the resend is answered", async () => {
    const { setup, flow } = await lostMove();
    setup.play.answer("continueRound", ok(setup.at(1)));
    await flow.observe(setup.at(0));
    expect(flow.unconfirmed()).toBeUndefined();
  });

  it("is not set when the resend is answered with a 503 marked retryable: false", async () => {
    const { setup, flow } = await lostMove(problem(503, "UNAVAILABLE", false));
    await flow.observe(setup.at(0));
    expect(setup.play.sent("continueRound")).toHaveLength(2);
    expect(flow.unconfirmed()).toBeUndefined();
  });

  // W-19: a refusal of the resend is an answer, not a lost send.
  it.each([
    [400, "INVALID_ARGUMENT"],
    [409, "STALE_ACTION"],
  ] as const)(
    "is not set when the resend is refused with a %i %s",
    async (status, code) => {
      const { setup, flow } = await lostMove(problem(status, code));
      setup.play.answer("getSnapshot", ok(setup.at(0)));
      await flow.observe(setup.at(0));
      expect(setup.play.sent("continueRound")).toHaveLength(2);
      expect(flow.unconfirmed()).toBeUndefined();
      await flow.observe(setup.at(0));
      expect(flow.unconfirmed()).toBeUndefined();
      expect(setup.play.sent("continueRound")).toHaveLength(2);
    },
  );

  it.each<[string, (setup: FlowSetup) => ValidSnapshot]>([
    ["the move applied", setup => setup.at(1)],
    ["the step moved on", setup => setup.at(2)],
    [
      "the round resolving",
      setup =>
        setup.read(p => {
          p.input["status"] = "resolving";
          p.input["step"] = 0;
        }),
    ],
    ["the round lost", setup => setup.closed("lost", 0)],
    [
      "the round canceled by its time limit",
      setup => setup.closed("canceled", 0, "expired"),
    ],
  ])("clears on a read that shows %s", async (_, read) => {
    const { setup, flow } = await unconfirmedMove();
    await flow.observe(read(setup));
    expect(flow.unconfirmed()).toBeUndefined();
    expect(setup.play.sent("continueRound")).toHaveLength(2);
  });

  it("clears once the session has ended", async () => {
    const { setup, flow } = await unconfirmedMove();
    setup.session.end();
    expect(flow.unconfirmed()).toBeUndefined();
  });

  it("is never left by a resend: the player's resend sends nothing", async () => {
    const { setup, flow } = await unconfirmedMove();
    expect(await flow.resend()).toEqual({
      accepted: false,
      reason: "not_active",
    });
    expect(setup.play.sent("continueRound")).toHaveLength(2);
    expect(flow.evidence().signed).toHaveLength(1);
  });
});

describe("a cash-out not confirmed (W-16)", () => {
  it("is set once the cash-out's one resend is lost too, and clears on its result", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    setup.play.answer("continueRound", ok(setup.at(1)));
    await flow.pick({ step: 0, option: 1 });
    setup.play.answer("cashOutRound", lost, lost);
    expect(await flow.cashOut()).toEqual(ACCEPTED);
    expect(flow.unconfirmed()).toBeUndefined();
    await flow.observe(setup.at(1));
    expect(setup.play.sent("cashOutRound")).toHaveLength(2);
    expect(flow.unconfirmed()).toBe("cash-out");
    await flow.observe(setup.closed("won", 1));
    expect(flow.unconfirmed()).toBeUndefined();
    expect(setup.play.sent("cashOutRound")).toHaveLength(2);
  });
});
