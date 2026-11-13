// Autoplay through the open session (RFC-005, W-61, T-31): the run's starts
// are W-22's starts on the scripted Play API, each with a fresh
// `idempotencyKey` and the bet copied from the latest Snapshot; the next goes
// only once the result was read and the interval passed on the session's
// clock; its answers reach the UI through `onChange`; the player's own start
// is refused `busy` while it runs; a changed round (W-52), the session's end,
// and a game that cannot show the rounds stop it. And `RoundState.failure`:
// which check refused a round, as a machine code the Wrapper labels.

import { describe, expect, it } from "vitest";

import { bookInput, bookSnapshot, proofOf } from "./fixtures/book.ts";
import { createFakeGame, HELLO, mountOf } from "./fixtures/fake-game.ts";
import { ok } from "./fixtures/fake-play.ts";
import { open, sessionOf, settleMany } from "./fixtures/play-session.ts";
import { ROUND_REQUEST } from "./fixtures/round-auth.ts";
import { failedRound } from "./fixtures/session-cancel.ts";
import { issued } from "./fixtures/session-round.ts";
import { validated } from "./fixtures/vectors.ts";

const BOTH = { ...HELLO, presentations: ["steps", "playback"] };

const REQUEST = { count: 2, bet: ROUND_REQUEST.bet, minIntervalMs: 2500 };

/** The book round's `won` at `version`. */
const wonAt = (version: number): ReturnType<typeof validated> =>
  validated({ ...bookInput("won"), version });

const startingAt = (version: number): ReturnType<typeof validated> =>
  validated({ ...bookInput("starting"), version });

/** A session at a book `idle`, with the game mounted. */
const atIdle = async () => {
  const opened = await open();
  const session = sessionOf(opened);
  const game = createFakeGame();
  session.mountGame(mountOf(game));
  game.send(BOTH);
  opened.play.answer("getSnapshot", ok(bookSnapshot("idle")));
  await session.read();
  const changes: string[] = [];
  const sources: string[] = [];
  session.onChange((read, source) => {
    changes.push(read.kind === "snapshot" ? read.snapshot.status : read.kind);
    sources.push(source);
  });
  return { opened, session, game, changes, sources };
};

describe("autoplay through the session (RFC-005, W-61)", () => {
  it("sends W-22's starts, the next only after the result and the interval", async () => {
    const { opened, session, changes, sources } = await atIdle();
    opened.play.answer("startRound", ok(startingAt(2)));
    expect(session.autoplay(REQUEST)).toEqual({ ok: true });
    await settleMany();
    expect(changes).toEqual(["starting"]);
    // Marked as the run's, so the UI moves no focus for it (W-61).
    expect(sources).toEqual(["autoplay"]);
    expect(session.autoplayState()).toEqual({
      kind: "running",
      count: 2,
      left: 1,
    });
    // The player's own start is refused while the run goes; nothing is sent.
    expect(await session.start(ROUND_REQUEST.bet)).toEqual({
      kind: "refused",
      reason: "busy",
    });
    opened.play.answer("getSnapshot", ok(wonAt(3)));
    await session.read();
    opened.play.answer("startRound", ok(startingAt(4)));
    opened.clock.advance(2499);
    await settleMany();
    expect(opened.play.sent("startRound")).toHaveLength(1);
    opened.clock.advance(1);
    await settleMany();
    const starts = opened.play.sent("startRound");
    expect(starts).toHaveLength(2);
    const keys = starts.map(
      start =>
        (start.body as { readonly idempotencyKey: string }).idempotencyKey,
    );
    expect(new Set(keys).size).toBe(2);
    expect(starts[1]?.body).toMatchObject({
      bet: { value: ROUND_REQUEST.bet.value, unit: ROUND_REQUEST.bet.unit },
    });
    opened.play.answer("getSnapshot", ok(wonAt(5)));
    await session.read();
    expect(session.autoplayState()).toEqual({
      kind: "stopped",
      reason: "count",
      started: 2,
    });
  });

  it("stops on a changed round, read on its result (W-52)", async () => {
    const { opened, session } = await atIdle();
    opened.play.answer("startRound", ok(startingAt(2)));
    session.autoplay(REQUEST);
    await settleMany();
    const changed = bookInput("won");
    proofOf(changed)["blockNumber"] = 21_000_124;
    opened.play.answer(
      "getSnapshot",
      ok(validated({ ...changed, version: 3 })),
    );
    await session.read();
    expect(session.round()?.failure).toBe("changed");
    expect(session.autoplayState()).toMatchObject({
      kind: "stopped",
      reason: "changed-round",
    });
    opened.clock.advance(10_000);
    await settleMany();
    expect(opened.play.sent("startRound")).toHaveLength(1);
  });

  it("stops when the session ends", async () => {
    const { opened, session } = await atIdle();
    opened.play.answer("startRound", ok(startingAt(2)));
    session.autoplay(REQUEST);
    await settleMany();
    session.end();
    expect(session.autoplayState()).toMatchObject({
      kind: "stopped",
      reason: "session-ended",
    });
  });

  it("refuses a run on a session of config rounds", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    opened.play.answer("getSnapshot", ok(issued.snapshot));
    await session.read();
    expect(session.autoplay(REQUEST)).toEqual({
      ok: false,
      refusal: "not-book",
    });
    expect(opened.play.sent("startRound")).toHaveLength(0);
  });

  it("stops on the player's stop, and the page hidden", async () => {
    const { opened, session } = await atIdle();
    opened.play.answer("startRound", ok(startingAt(2)));
    session.autoplay(REQUEST);
    await settleMany();
    session.stopAutoplay("hidden");
    opened.play.answer("getSnapshot", ok(wonAt(3)));
    await session.read();
    opened.clock.advance(10_000);
    await settleMany();
    expect(opened.play.sent("startRound")).toHaveLength(1);
    expect(session.autoplayState()).toMatchObject({ reason: "hidden" });
  });
});

describe("RoundState.failure (RFC-005, W-48's labels)", () => {
  it("names the tip check's failure, and why", async () => {
    const { session } = await failedRound(issued.snapshot);
    expect(session.round()).toMatchObject({
      verdict: "failed",
      failure: "tip-check",
      tipFailure: expect.any(String),
    });
  });
});
