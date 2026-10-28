// T-22 (#146, W-53): a changed session through the open session, on the
// scripted Play API. A Snapshot whose `presentation`, `model`, `config.kind`,
// or `config.model` differs from the session's first, whether a read, a
// start's answer, a `ROUND_ACTIVE` problem's, or a config round's move answer,
// is not read in; from then on the session reads, starts, signs, and forwards
// nothing. A Snapshot that changes the round too is a changed session, not a
// changed round (W-53 before W-52).

import { describe, expect, it } from "vitest";

import { bookInput, bookSnapshot, configOf, proofOf } from "./fixtures/book.ts";
import { createFakeGame, HELLO, mountOf } from "./fixtures/fake-game.ts";
import { ok } from "./fixtures/fake-play.ts";
import {
  GAME,
  open,
  problem409,
  sessionOf,
  settleMany,
} from "./fixtures/play-session.ts";
import { ROUND_REQUEST } from "./fixtures/round-auth.ts";
import { issued } from "./fixtures/session-round.ts";
import { snapshot, validated, vectorInput } from "./fixtures/vectors.ts";

const BOTH = { ...HELLO, presentations: ["steps", "playback"] };

/** A session at a book `idle`, its round started (`starting`, bound). */
const startedBook = async () => {
  const opened = await open();
  const session = sessionOf(opened);
  opened.play.answer("getSnapshot", ok(bookSnapshot("idle")));
  await session.read();
  opened.play.answer("startRound", ok(bookSnapshot("starting")));
  await session.start(ROUND_REQUEST.bet);
  return { opened, session };
};

describe("a changed session (W-53)", () => {
  it("is not read in, and from then on nothing is read, started, or forwarded", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    const game = createFakeGame({ gameOrigin: GAME, gameOrigins: [GAME] });
    session.mountGame(mountOf(game));
    game.send(BOTH);
    opened.play.answer("getSnapshot", ok(snapshot("idle")));
    await session.read();
    const posted = game.posted.length;
    opened.play.answer("getSnapshot", ok(bookSnapshot("idle")));
    expect(await session.read()).toEqual({ kind: "session-changed" });
    // Not read in: the game got nothing of it, and nothing more is read.
    expect(game.posted).toHaveLength(posted);
    const reads = opened.play.sent("getSnapshot").length;
    expect(await session.read()).toEqual({ kind: "session-changed" });
    expect(await session.checkAgain()).toEqual({ kind: "session-changed" });
    expect(opened.play.sent("getSnapshot")).toHaveLength(reads);
    // Nothing is started or signed.
    expect(await session.start(ROUND_REQUEST.bet)).toEqual({
      kind: "session-changed",
    });
    expect(await session.cashOut()).toEqual({ kind: "session-changed" });
    expect(opened.play.sent("startRound")).toHaveLength(0);
    // The game's bridge is closed: nothing is forwarded or accepted.
    game.send({
      schema: "se.controller/1",
      type: "action",
      id: "p",
      verb: "pick",
      args: { step: 0, option: 0 },
    });
    expect(game.posted).toHaveLength(posted);
    expect(game.listening()).toBe(false);
  });

  it("a start whose answer changes the session holds nothing", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    opened.play.answer("getSnapshot", ok(snapshot("idle")));
    await session.read();
    opened.play.answer("startRound", ok(bookSnapshot("starting")));
    expect(await session.start(ROUND_REQUEST.bet)).toEqual({
      kind: "session-changed",
    });
    expect(session.round()).toBeUndefined();
  });

  it("a ROUND_ACTIVE answer whose Snapshot changes the session is a changed session", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    opened.play.answer("getSnapshot", ok(bookSnapshot("idle")));
    await session.read();
    opened.play.answer(
      "startRound",
      problem409(vectorInput("valid", "problem-round-active")),
    );
    expect(await session.start(ROUND_REQUEST.bet)).toEqual({
      kind: "session-changed",
    });
  });

  it("a change of the round and of config.model together is a changed session, not a changed round", async () => {
    const { opened, session } = await startedBook();
    const input = bookInput("won");
    proofOf(input)["blockNumber"] = 21_000_124;
    configOf(input)["model"] = "bonus";
    opened.play.answer("getSnapshot", ok(validated(input)));
    expect(await session.read()).toEqual({ kind: "session-changed" });
    // The Snapshot was not read into the round: it is no changed round.
    expect(session.round()?.verdict).toBe("ready");
  });

  it("a read of a book round in a steps session, with no round held, is a changed session", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    opened.play.answer("getSnapshot", ok(snapshot("idle")));
    await session.read();
    opened.play.answer("getSnapshot", ok(bookSnapshot("won")));
    expect(await session.read()).toEqual({ kind: "session-changed" });
    expect(session.round()).toBeUndefined();
  });

  it("a config round's move answer that changes the session is not read in", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    opened.play.answer("startRound", ok(issued.snapshot));
    await session.start(ROUND_REQUEST.bet);
    expect(session.round()?.verdict).toBe("ready");
    const game = createFakeGame({ gameOrigin: GAME, gameOrigins: [GAME] });
    session.mountGame(mountOf(game));
    game.send(HELLO);
    const posted = game.posted.length;
    const changes: string[] = [];
    session.onChange(read => {
      changes.push(read.kind);
    });
    // The move is signed and sent; its answer is a book round's Snapshot.
    opened.play.answer("continueRound", ok(bookSnapshot("won")));
    game.send({
      schema: "se.controller/1",
      type: "action",
      id: "a1",
      verb: "pick",
      args: { step: 0, option: 1 },
    });
    await settleMany();
    expect(opened.play.sent("continueRound")).toHaveLength(1);
    expect(changes).toEqual(["session-changed"]);
    // Not read into the round, and nothing reached the game.
    expect(session.round()?.roundId).toBe(issued.snapshot.roundId);
    expect(game.posted).toHaveLength(posted);
    expect(game.listening()).toBe(false);
    // Final: nothing more is read.
    const reads = opened.play.sent("getSnapshot").length;
    expect(await session.read()).toEqual({ kind: "session-changed" });
    expect(opened.play.sent("getSnapshot")).toHaveLength(reads);
  });
});
