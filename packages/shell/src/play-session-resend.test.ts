// What the session shows after a read that led to a newer Snapshot of the
// round (W-16): the answer to the one resend of a lost move or cash-out, which
// the read caused, reaches the UI and the game, never the read's older
// Snapshot. A read that led to nothing newer is shown as it is, and a resend
// lost too is the round's `unconfirmed` state, which "check again" only reads.
// Scripted Play API, manual clock, fake locks.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import {
  createFakeGame,
  type FakeGame,
  HELLO,
  mountOf,
} from "./fixtures/fake-game.ts";
import { lost, ok, type Responder } from "./fixtures/fake-play.ts";
import {
  type Opened,
  open,
  sessionOf,
  settleMany,
} from "./fixtures/play-session.ts";
import { ROUND_REQUEST } from "./fixtures/round-auth.ts";
import { reread } from "./fixtures/round-edits.ts";
import { issued, issuedSteps } from "./fixtures/session-round.ts";
import { snapshot } from "./fixtures/vectors.ts";
import type { PlaySession } from "./session-types.ts";

const won = (): ValidSnapshot => snapshot("won");

/** The status and version of the last Snapshot the game was sent. */
const gameCopy = (
  game: FakeGame,
): { readonly status: unknown; readonly version: unknown } | undefined => {
  const last = game.posted
    .map(entry => entry.message as Record<string, unknown>)
    .findLast(message => message["type"] === "snapshot");
  const copy = last?.["snapshot"] as Record<string, unknown> | undefined;
  return copy === undefined
    ? undefined
    : { status: copy["status"], version: copy["version"] };
};

type Played = {
  readonly opened: Opened;
  readonly session: PlaySession;
  readonly game: FakeGame;
};

/** A started, ready round with the game mounted, whose move got `answer`. */
const moved = async (answer: Responder): Promise<Played> => {
  const opened = await open();
  const session = sessionOf(opened);
  opened.play.answer("startRound", ok(issued.snapshot));
  await session.start(ROUND_REQUEST.bet);
  const game = createFakeGame();
  expect(session.mountGame(mountOf(game)).ok).toBe(true);
  game.send(HELLO);
  opened.play.answer("continueRound", answer);
  game.send({
    schema: "se.controller/1",
    type: "action",
    id: "a1",
    verb: "pick",
    args: { step: 0, option: 1 },
  });
  await settleMany();
  expect(opened.play.sent("continueRound")).toHaveLength(1);
  return { opened, session, game };
};

describe("a read that led to a newer Snapshot of the round", () => {
  it("shows the answer to the resend of a lost move, to the UI and to the game", async () => {
    const { opened, session, game } = await moved(lost);
    expect(gameCopy(game)).toMatchObject({ status: "active" });
    // The read shows the move not applied; the resend's answer is the result.
    opened.play.answer("getSnapshot", ok(issued.snapshot));
    opened.play.answer("continueRound", ok(won()));
    const read = await session.read();
    expect(opened.play.sent("continueRound")).toHaveLength(2);
    expect(read).toEqual({ kind: "snapshot", snapshot: won() });
    expect(gameCopy(game)).toEqual({
      status: "won",
      version: won().version,
    });
    // The round is over: a new round may start.
    opened.play.answer("startRound", ok(issued.snapshot));
    await session.start(ROUND_REQUEST.bet);
    expect(opened.play.sent("startRound")).toHaveLength(2);
  });

  it("shows the read itself when it is the round's newest", async () => {
    const { opened, session, game } = await moved(lost);
    // The resend is lost too: the read is the round's newest Snapshot.
    opened.play.answer("getSnapshot", ok(issued.snapshot));
    opened.play.answer("continueRound", lost);
    expect(await session.read()).toEqual({
      kind: "snapshot",
      snapshot: issued.snapshot,
    });
    expect(gameCopy(game)).toMatchObject({ status: "active" });
    expect(opened.play.sent("continueRound")).toHaveLength(2);
  });
});

describe("a move not confirmed, through the session (W-16)", () => {
  it("is the round's state once the resend is lost too; check again only reads, and a result clears it", async () => {
    const { opened, session, game } = await moved(lost);
    expect(session.round()?.unconfirmed).toBeUndefined();
    opened.play.answer("getSnapshot", ok(issued.snapshot));
    opened.play.answer("continueRound", lost);
    await session.read();
    expect(session.round()).toMatchObject({
      verdict: "ready",
      outOfSync: false,
      unconfirmed: "move",
    });
    // "Check again" reads the round once and sends nothing.
    opened.play.answer("getSnapshot", ok(issued.snapshot));
    expect(await session.checkAgain()).toEqual({
      kind: "snapshot",
      snapshot: issued.snapshot,
    });
    expect(opened.play.sent("getSnapshot")).toHaveLength(2);
    expect(opened.play.sent("continueRound")).toHaveLength(2);
    expect(session.round()?.unconfirmed).toBe("move");
    // The game stays waiting: it was sent nothing newer.
    expect(gameCopy(game)).toMatchObject({ status: "active" });
    // A read that shows the move applied settles it.
    opened.play.answer("getSnapshot", ok(won()));
    expect(await session.checkAgain()).toEqual({
      kind: "snapshot",
      snapshot: won(),
    });
    expect(session.round()?.unconfirmed).toBeUndefined();
    expect(gameCopy(game)).toMatchObject({ status: "won" });
    expect(opened.play.sent("continueRound")).toHaveLength(2);
  });
});

/**
 * The three-step round (`issuedSteps`) at `step`, `later` versions after its
 * start, `active` or with its result `won` (the round's secret and seed
 * shown).
 */
const stepsRead = (
  step: number,
  later: number,
  status: "active" | "won" = "active",
): ValidSnapshot =>
  reread(issuedSteps.snapshot, p => {
    p.input["step"] = step;
    p.input["version"] = issuedSteps.snapshot.version + later;
    if (status === "won") {
      p.input["status"] = "won";
      p.randomnessProof["roundSecret"] = `0x${"44".repeat(32)}`;
      p.fairnessProof["seed"] = `0x${"55".repeat(32)}`;
    }
  });

/**
 * The three-step round, its first move applied, and its cash-out sent with
 * `answer`: the game is mounted, so its copy can be read.
 */
const cashedOut = async (answer: Responder): Promise<Played> => {
  const opened = await open({ config: issuedSteps.config });
  const session = sessionOf(opened);
  opened.play.answer("startRound", ok(issuedSteps.snapshot));
  await session.start(ROUND_REQUEST.bet);
  const game = createFakeGame();
  expect(session.mountGame(mountOf(game)).ok).toBe(true);
  game.send(HELLO);
  opened.play.answer("continueRound", ok(stepsRead(1, 1)));
  game.send({
    schema: "se.controller/1",
    type: "action",
    id: "a1",
    verb: "pick",
    args: { step: 0, option: 1 },
  });
  await settleMany();
  expect(session.round()?.cashOutOffered).toBe(true);
  opened.play.answer("cashOutRound", answer);
  await session.cashOut();
  expect(opened.play.sent("cashOutRound")).toHaveLength(1);
  return { opened, session, game };
};

describe("a lost cash-out, through the session (W-16)", () => {
  it("shows the answer to its resend, to the UI and to the game", async () => {
    const { opened, session, game } = await cashedOut(lost);
    expect(gameCopy(game)).toMatchObject({ status: "active" });
    opened.play.answer("getSnapshot", ok(stepsRead(1, 1)));
    opened.play.answer("cashOutRound", ok(stepsRead(1, 2, "won")));
    const read = await session.read();
    expect(opened.play.sent("cashOutRound")).toHaveLength(2);
    expect(read).toEqual({
      kind: "snapshot",
      snapshot: stepsRead(1, 2, "won"),
    });
    expect(gameCopy(game)).toEqual({
      status: "won",
      version: issuedSteps.snapshot.version + 2,
    });
    expect(session.round()?.unconfirmed).toBeUndefined();
  });

  it("is not confirmed once its resend is lost too, and check again sends nothing", async () => {
    const { opened, session, game } = await cashedOut(lost);
    opened.play.answer("getSnapshot", ok(stepsRead(1, 1)));
    opened.play.answer("cashOutRound", lost);
    await session.read();
    expect(session.round()?.unconfirmed).toBe("cash-out");
    opened.play.answer("getSnapshot", ok(stepsRead(1, 1)));
    await session.checkAgain();
    expect(opened.play.sent("cashOutRound")).toHaveLength(2);
    expect(session.round()?.unconfirmed).toBe("cash-out");
    expect(gameCopy(game)).toMatchObject({
      status: "active",
      version: issuedSteps.snapshot.version + 1,
    });
  });
});
