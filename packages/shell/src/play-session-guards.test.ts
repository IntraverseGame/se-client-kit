// The session's one start or cash-out at a time (W-15, W-22, W-24, W-36): a
// second start while one is in flight is refused `busy` and sends nothing, a
// start while the held round is not over is refused `round-exists` and sends
// nothing, and a second cash-out while one is in flight is refused `busy`, so
// one cash-out is signed and sent. Scripted Play API, manual clock, fake locks.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import { createFakeGame, HELLO, mountOf } from "./fixtures/fake-game.ts";
import { deferred, ok } from "./fixtures/fake-play.ts";
import { open, sessionOf, settleMany } from "./fixtures/play-session.ts";
import { ROUND_REQUEST } from "./fixtures/round-auth.ts";
import { issued, issuedSteps, stepsAt } from "./fixtures/session-round.ts";
import { snapshot } from "./fixtures/vectors.ts";

const BUSY = { kind: "refused", reason: "busy" } as const;
const roundId = issued.snapshot.roundId ?? "";

describe("one start at a time (W-22, W-36)", () => {
  it("two starts at once send one startRound: the second is refused busy", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    const held = deferred();
    opened.play.answer("startRound", held.responder);
    const first = session.start(ROUND_REQUEST.bet);
    const second = session.start(ROUND_REQUEST.bet);
    expect(await second).toEqual(BUSY);
    held.release(ok(issued.snapshot));
    expect((await first).kind).toBe("snapshot");
    expect(opened.play.sent("startRound")).toHaveLength(1);
    expect(session.round()?.roundId).toBe(issued.snapshot.roundId);
  });

  it("a start while the held round is not over is refused round-exists, and sends nothing", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    opened.play.answer("startRound", ok(issued.snapshot));
    await session.start(ROUND_REQUEST.bet);
    const calls = opened.play.all().length;
    expect(await session.start(ROUND_REQUEST.bet)).toEqual({
      kind: "refused",
      reason: "round-exists",
    });
    expect(opened.play.all()).toHaveLength(calls);
  });

  it.each([
    ["the held round over", (): ValidSnapshot => snapshot("won", { roundId })],
    ["no round (idle)", (): ValidSnapshot => snapshot("idle")],
  ])("starts again once a read shows %s", async (_what, shown) => {
    const opened = await open();
    const session = sessionOf(opened);
    opened.play.answer("startRound", ok(issued.snapshot));
    await session.start(ROUND_REQUEST.bet);
    opened.play.answer("getSnapshot", ok(shown()));
    await session.read();
    opened.play.answer("startRound", ok(issued.snapshot));
    await session.start(ROUND_REQUEST.bet);
    expect(opened.play.sent("startRound")).toHaveLength(2);
  });
});

describe("one cash-out at a time (W-24)", () => {
  it("two cash-outs at once sign and send one: the second is refused busy", async () => {
    const opened = await open({
      config: issuedSteps.config,
    });
    const session = sessionOf(opened);
    opened.play.answer("startRound", ok(issuedSteps.snapshot));
    await session.start(ROUND_REQUEST.bet);
    const game = createFakeGame();
    expect(session.mountGame(mountOf(game)).ok).toBe(true);
    game.send(HELLO);
    opened.play.answer("continueRound", ok(stepsAt(1)));
    game.send({
      schema: "se.controller/1",
      type: "action",
      id: "a1",
      verb: "pick",
      args: { step: 0, option: 1 },
    });
    await settleMany();
    expect(session.round()?.cashOutOffered).toBe(true);
    const held = deferred();
    opened.play.answer("cashOutRound", held.responder);
    const first = session.cashOut();
    const second = session.cashOut();
    expect(await second).toEqual(BUSY);
    held.release(ok(stepsAt(1)));
    expect((await first).kind).toBe("snapshot");
    expect(opened.play.sent("cashOutRound")).toHaveLength(1);
  });
});
