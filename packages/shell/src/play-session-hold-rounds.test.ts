// T-26 (W-38, W-42, W-11): W-38's hold for the rounds the shell does not hold,
// at the game's mount, and at its `hello`. A `ROUND_ACTIVE` resume, a round an
// earlier page left open, and another round's `active` Snapshot are never
// given; at mount the rule is evaluated on the latest Snapshot against the
// verdict then; the `hello` is answered with the last copy given; a book round
// is unaffected. Scripted Play API, manual clock, fake locks, a gated RPC
// transport.

import { describe, expect, it } from "vitest";

import { bookSnapshot } from "./fixtures/book.ts";
import { createFakeGame, HELLO, mountOf } from "./fixtures/fake-game.ts";
import { ok } from "./fixtures/fake-play.ts";
import {
  open,
  problem409,
  sessionOf,
  settleMany,
} from "./fixtures/play-session.ts";
import { ROUND_REQUEST } from "./fixtures/round-auth.ts";
import {
  activeCopies,
  at,
  copies,
  gated,
  mounted,
  V,
} from "./fixtures/session-hold.ts";
import { agreeingRpc, issued, issuedOther } from "./fixtures/session-round.ts";
import { snapshot, vectorInput } from "./fixtures/vectors.ts";

describe("a round the shell does not hold is never given as active (T-26)", () => {
  it("a ROUND_ACTIVE resume (W-42)", async () => {
    const { session, game, play } = await mounted();
    const body = vectorInput("valid", "problem-round-active");
    play.answer("startRound", problem409(body));
    expect((await session.start(ROUND_REQUEST.bet)).kind).toBe("problem");
    expect(session.round()).toBeUndefined();
    expect(activeCopies(game)).toEqual([]);
  });

  it("a round an earlier page left open (W-11), read with no round held", async () => {
    const { session, game, play } = await mounted();
    play.answer("getSnapshot", ok(issued.snapshot));
    expect(await session.read()).toEqual({
      kind: "snapshot",
      snapshot: issued.snapshot,
    });
    expect(activeCopies(game)).toEqual([]);
  });

  it("an active Snapshot of another round than the one the session holds", async () => {
    const { session, game, play } = await mounted();
    play.answer("startRound", ok(issued.snapshot));
    await session.start(ROUND_REQUEST.bet);
    play.answer("getSnapshot", ok(at(1, issuedOther.snapshot)));
    await session.read();
    expect(activeCopies(game)).toEqual([{ status: "active", version: V }]);
  });
});

describe("mount and hello use the same rule (T-26)", () => {
  it("at mount, the latest Snapshot is given only when the verdict is ready then", async () => {
    const tip = gated(agreeingRpc);
    const opened = await open({ rpc: tip.rpc });
    const session = sessionOf(opened);
    opened.play.answer("startRound", ok(issued.snapshot));
    const started = session.start(ROUND_REQUEST.bet);
    await settleMany();
    // Mounted while the round is checked: its latest is held.
    const early = createFakeGame();
    expect(session.mountGame(mountOf(early)).ok).toBe(true);
    early.send(HELLO);
    expect(copies(early)).toEqual([]);
    tip.open();
    await started;
    expect(activeCopies(early)).toEqual([{ status: "active", version: V }]);
    // Mounted once the round is ready: its latest is given.
    const late = createFakeGame();
    expect(session.mountGame(mountOf(late)).ok).toBe(true);
    late.send(HELLO);
    expect(activeCopies(late)).toEqual([{ status: "active", version: V }]);
  });

  it("at mount, a round an earlier page left open is held", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    opened.play.answer("getSnapshot", ok(issued.snapshot));
    await session.read();
    const game = createFakeGame();
    expect(session.mountGame(mountOf(game)).ok).toBe(true);
    game.send(HELLO);
    expect(copies(game)).toEqual([]);
  });

  it("the hello is answered with the last copy given, never a held one", async () => {
    const tip = gated(agreeingRpc);
    const opened = await open({ rpc: tip.rpc });
    const session = sessionOf(opened);
    const game = createFakeGame();
    expect(session.mountGame(mountOf(game)).ok).toBe(true);
    opened.play.answer("getSnapshot", ok(snapshot("idle")));
    await session.read();
    opened.play.answer("startRound", ok(issued.snapshot));
    const started = session.start(ROUND_REQUEST.bet);
    await settleMany();
    // The game's first `hello` arrives while the round's active is held.
    game.send(HELLO);
    expect(copies(game).map(copy => copy.status)).toEqual(["idle"]);
    tip.open();
    await started;
    expect(copies(game).map(copy => copy.status)).toEqual(["idle", "active"]);
  });
});

describe("a book round is unaffected (T-26)", () => {
  it("its Snapshots reach the game as before", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    const game = createFakeGame();
    expect(session.mountGame(mountOf(game)).ok).toBe(true);
    game.send({ ...HELLO, presentations: ["steps", "playback"] });
    opened.play.answer("getSnapshot", ok(bookSnapshot("idle")));
    await session.read();
    opened.play.answer("startRound", ok(bookSnapshot("starting")));
    await session.start(ROUND_REQUEST.bet);
    opened.play.answer("getSnapshot", ok(bookSnapshot("won")));
    await session.read();
    expect(copies(game).map(copy => copy.status)).toEqual([
      "idle",
      "starting",
      "won",
    ]);
  });
});
