// T-22 (#146, W-50 to W-54): a book round through the open session, on the
// scripted Play API. The start sends the bet and the key's address and nothing
// is signed after it; a pick, a cash-out, or a cancel is refused with no
// request; W-26's checks and the tip check never run; a changed round is
// failed verification; a book Snapshot at `active` is rejected; and a
// Snapshot that changes the session (W-53) is not read in, after which the
// session reads, starts, signs, and forwards nothing. Manual clock, fake
// locks, a recording RPC transport.

import type { PlayOperationId } from "@intraverse/se-client-play-client";
import { describe, expect, it } from "vitest";

import { bookInput, bookSnapshot, configOf, proofOf } from "./fixtures/book.ts";
import { createFakeGame, HELLO, mountOf } from "./fixtures/fake-game.ts";
import { ok } from "./fixtures/fake-play.ts";
import {
  actionKeyOf,
  GAME,
  open,
  problem409,
  sessionOf,
  settleMany,
} from "./fixtures/play-session.ts";
import { ROUND_REQUEST } from "./fixtures/round-auth.ts";
import { sessionAddress } from "./fixtures/session-round.ts";
import { snapshot, validated, vectorInput } from "./fixtures/vectors.ts";
import type { RpcTransport } from "./rpc-transport.ts";

/** The Play API calls that carry a signed action: never sent for a book round. */
const SIGNED: readonly PlayOperationId[] = [
  "continueRound",
  "cashOutRound",
  "cancelRound",
];

/** An RPC transport that records each call and answers none. */
const recordingRpc = (): { rpc: RpcTransport; calls: () => number } => {
  let calls = 0;
  return {
    rpc: () => {
      calls += 1;
      return Promise.reject(new Error("no RPC on a book round"));
    },
    calls: () => calls,
  };
};

const BOTH = { ...HELLO, presentations: ["steps", "playback"] };

/** A won book Snapshot of the round with its `blockNumber` changed. */
const wonOtherBlock = (): ReturnType<typeof validated> => {
  const input = bookInput("won");
  proofOf(input)["blockNumber"] = 21_000_124;
  return validated(input);
};

/** A session at a book `idle`, its round started (`starting`, bound). */
const startedBook = async () => {
  const recording = recordingRpc();
  const opened = await open({ rpc: recording.rpc });
  const session = sessionOf(opened);
  opened.play.answer("getSnapshot", ok(bookSnapshot("idle")));
  await session.read();
  opened.play.answer("startRound", ok(bookSnapshot("starting")));
  const started = await session.start(ROUND_REQUEST.bet);
  return { opened, session, started, recording };
};

const signedSent = (opened: Awaited<ReturnType<typeof open>>): number =>
  SIGNED.reduce((count, id) => count + opened.play.sent(id).length, 0);

describe("a book round's start (W-51)", () => {
  it("sends the bet and the key's address, and signs nothing after it", async () => {
    const { opened, session, started, recording } = await startedBook();
    expect(started).toEqual({
      kind: "snapshot",
      snapshot: bookSnapshot("starting"),
    });
    const [start] = opened.play.sent("startRound");
    expect(start?.body).toMatchObject({
      idempotencyKey: expect.any(String),
      bet: { value: ROUND_REQUEST.bet.value, unit: ROUND_REQUEST.bet.unit },
    });
    expect(actionKeyOf(start)).toBe(sessionAddress());
    // No W-26 verdict to wait for, no tip check, no RPC call (W-52).
    expect(session.round()).toEqual({
      roundId: bookSnapshot("starting").roundId,
      verdict: "ready",
      outOfSync: false,
      cashOutOffered: false,
      cancel: "none",
    });
    await settleMany();
    expect(recording.calls()).toBe(0);
    expect(signedSent(opened)).toBe(0);
  });

  it("refuses a cash-out and a game's pick with no request", async () => {
    const { opened, session } = await startedBook();
    expect(await session.cashOut()).toEqual({
      kind: "refused",
      reason: "not_legal",
    });
    const game = createFakeGame({ gameOrigin: GAME, gameOrigins: [GAME] });
    expect(session.mountGame(mountOf(game)).ok).toBe(true);
    game.send(BOTH);
    game.send({
      schema: "se.controller/1",
      type: "action",
      id: "p",
      verb: "pick",
      args: { step: 0, option: 0 },
    });
    await settleMany();
    expect(game.posted.map(p => p.message)).toContainEqual({
      schema: "se.controller/1",
      type: "reject",
      id: "p",
      reason: "not_legal",
    });
    expect(signedSent(opened)).toBe(0);
  });

  it("reads the round to its result in one step, and the next start is allowed", async () => {
    const { opened, session } = await startedBook();
    opened.play.answer("getSnapshot", ok(bookSnapshot("won")));
    expect(await session.read()).toEqual({
      kind: "snapshot",
      snapshot: bookSnapshot("won"),
    });
    expect(session.round()?.verdict).toBe("ready");
    const next = bookInput("starting");
    next["version"] = 4;
    next["roundId"] = "01927c5e-8b3a-7f21-9c4d-000000000002";
    opened.play.answer("startRound", ok(validated(next)));
    expect((await session.start(ROUND_REQUEST.bet)).kind).toBe("snapshot");
    expect(opened.play.sent("startRound")).toHaveLength(2);
    expect(signedSent(opened)).toBe(0);
  });

  it("forwards the playback copy to the game", async () => {
    const { opened, session } = await startedBook();
    const game = createFakeGame({ gameOrigin: GAME, gameOrigins: [GAME] });
    session.mountGame(mountOf(game));
    game.send(BOTH);
    opened.play.answer("getSnapshot", ok(bookSnapshot("won")));
    await session.read();
    expect(game.posted.map(p => p.message)).toMatchObject([
      {
        type: "snapshot",
        snapshot: { presentation: "playback", status: "starting" },
      },
      {
        type: "snapshot",
        snapshot: { status: "won", config: { draw: { index: 41 } } },
      },
    ]);
  });
});

describe("a changed round (W-52)", () => {
  it("is failed verification, and nothing is signed or canceled", async () => {
    const { opened, session } = await startedBook();
    opened.play.answer("getSnapshot", ok(wonOtherBlock()));
    const read = await session.read();
    expect(read).toEqual({ kind: "snapshot", snapshot: wonOtherBlock() });
    expect(session.round()).toMatchObject({
      verdict: "failed",
      shown: "verification-failed",
      cancel: "none",
    });
    expect(signedSent(opened)).toBe(0);
  });
});

describe("a book Snapshot at active, resolving, or canceled (W-54)", () => {
  it.each(["active", "resolving", "canceled"])(
    "is rejected at %s",
    async status => {
      const { opened, session } = await startedBook();
      opened.play.answer(
        "getSnapshot",
        ok({ ...bookInput("starting"), version: 3, status }),
      );
      expect(await session.read()).toEqual({ kind: "rejected" });
      expect(session.round()?.verdict).toBe("ready");
    },
  );
});

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

  it("a config round's move answer that changes the session is not read in", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    opened.play.answer("getSnapshot", ok(snapshot("idle")));
    await session.read();
    opened.play.answer("getSnapshot", ok(bookSnapshot("won")));
    expect(await session.read()).toEqual({ kind: "session-changed" });
    expect(session.round()).toBeUndefined();
  });
});
