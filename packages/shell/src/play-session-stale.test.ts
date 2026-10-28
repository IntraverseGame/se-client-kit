// W-29 at the session (human decision, 2026-10-28, #146): a stale read of the
// round the session holds (a lower `version` than the round's latest) leaves
// the round as it was, so it neither reopens an ended round (`round-exists`)
// nor reaches the game's copy at the mount. Scripted Play API, manual clock,
// fake locks.

import { describe, expect, it } from "vitest";

import { createFakeGame, HELLO, mountOf } from "./fixtures/fake-game.ts";
import { ok } from "./fixtures/fake-play.ts";
import { GAME, open, sessionOf, settleMany } from "./fixtures/play-session.ts";
import { ROUND_REQUEST } from "./fixtures/round-auth.ts";
import { reread } from "./fixtures/round-edits.ts";
import { issued, issuedOther } from "./fixtures/session-round.ts";

const v = issued.snapshot.version;

const wonLater = reread(issued.snapshot, p => {
  p.input["version"] = v + 1;
  p.input["status"] = "won";
  p.randomnessProof["roundSecret"] = `0x${"44".repeat(32)}`;
  p.fairnessProof["seed"] = `0x${"55".repeat(32)}`;
});

/** A session holding the round, read to its result, then read stale. */
const afterStaleRead = async () => {
  const opened = await open();
  const session = sessionOf(opened);
  opened.play.answer("startRound", ok(issued.snapshot));
  await session.start(ROUND_REQUEST.bet);
  opened.play.answer("getSnapshot", ok(wonLater), ok(issued.snapshot));
  await session.read();
  await session.read();
  return { opened, session };
};

describe("a stale read of the round the session holds (W-29)", () => {
  it("keeps an ended round ended: the next start is sent, not refused round-exists", async () => {
    const { opened, session } = await afterStaleRead();
    const next = reread(issuedOther.snapshot, p => {
      p.input["version"] = v + 2;
    });
    opened.play.answer("startRound", ok(next));
    expect((await session.start(ROUND_REQUEST.bet)).kind).toBe("snapshot");
    expect(opened.play.sent("startRound")).toHaveLength(2);
  });

  it("the game's copy at the mount is the round's latest, not the stale read", async () => {
    const { session } = await afterStaleRead();
    const game = createFakeGame({ gameOrigin: GAME, gameOrigins: [GAME] });
    session.mountGame(mountOf(game));
    game.send(HELLO);
    expect(game.posted.at(-1)?.message).toMatchObject({
      type: "snapshot",
      snapshot: { status: "won", version: v + 1 },
    });
  });

  it("a move answered by a stale read hands the UI that read to drop, and the round keeps its latest", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    opened.play.answer("startRound", ok(issued.snapshot));
    await session.start(ROUND_REQUEST.bet);
    const game = createFakeGame({ gameOrigin: GAME, gameOrigins: [GAME] });
    session.mountGame(mountOf(game));
    game.send(HELLO);
    const posted = game.posted.length;
    const answers: unknown[] = [];
    session.onChange(read => {
      answers.push(read);
    });
    const staleResolving = reread(issued.snapshot, p => {
      p.input["version"] = v - 1;
      p.input["status"] = "resolving";
    });
    opened.play.answer("continueRound", ok(staleResolving));
    game.send({
      schema: "se.controller/1",
      type: "action",
      id: "a1",
      verb: "pick",
      args: { step: 0, option: 1 },
    });
    await settleMany();
    // The UI gets the stale answer, which it drops and reads again (W-35).
    expect(answers).toEqual([{ kind: "snapshot", snapshot: staleResolving }]);
    // The round did not read it in, and the game was not sent it.
    expect(session.round()?.verdict).toBe("ready");
    expect(game.posted).toHaveLength(posted);
    // The read that follows is taken.
    opened.play.answer("getSnapshot", ok(wonLater));
    expect(await session.read()).toEqual({
      kind: "snapshot",
      snapshot: wonLater,
    });
  });
});
