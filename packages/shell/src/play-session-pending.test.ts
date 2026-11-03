// T-28, the shell's half (W-16, W-19, W-41): `RoundState.pending`, read only
// and derived: the round signer's pending move or cash-out, never a cancel,
// while the signer's phase is `open` or `adopted`, and absent otherwise. It is
// a word, never a signature, key, or bytes. The Wrapper's half ("Waiting for
// your move to be confirmed.") is the Wrapper's own test. Scripted Play API,
// manual clock, fake locks.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import {
  action,
  createFakeGame,
  type FakeGame,
  HELLO,
  mountOf,
} from "./fixtures/fake-game.ts";
import {
  deferred,
  lost,
  ok,
  problem,
  type Responder,
} from "./fixtures/fake-play.ts";
import {
  type Opened,
  open,
  sessionOf,
  settleMany,
} from "./fixtures/play-session.ts";
import { ROUND_REQUEST } from "./fixtures/round-auth.ts";
import { reread } from "./fixtures/round-edits.ts";
import {
  disagreeingRpc,
  issued,
  issuedSteps,
} from "./fixtures/session-round.ts";
import type { PlaySession } from "./session-types.ts";

/**
 * The three-step round at `step`, `later` versions after its start, `active` or
 * with its result `won`.
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

/** The three-step round re-issued (a later `CreateRoundAuth`, W-26). */
const reissuedAt = (step: number, later: number): ValidSnapshot =>
  reread(stepsRead(step, later), p => {
    p.auth["expiry"] = "1800000601";
  });

type Played = Opened & {
  readonly session: PlaySession;
  readonly game: FakeGame;
};

/** The three-step round started and ready, with the game mounted. */
const ready = async (): Promise<Played> => {
  const opened = await open({ config: issuedSteps.config });
  const session = sessionOf(opened);
  opened.play.answer("startRound", ok(issuedSteps.snapshot));
  await session.start(ROUND_REQUEST.bet);
  const game = createFakeGame();
  expect(session.mountGame(mountOf(game)).ok).toBe(true);
  game.send(HELLO);
  expect(session.round()?.verdict).toBe("ready");
  return { ...opened, session, game };
};

/** The ready round's first move, answered with `answer`. */
const moved = async (answer: Responder): Promise<Played> => {
  const played = await ready();
  played.play.answer("continueRound", answer);
  played.game.send(action("a1", 0, 1));
  await settleMany();
  expect(played.play.sent("continueRound")).toHaveLength(1);
  return played;
};

describe("RoundState.pending (T-28)", () => {
  it("is absent before any action", async () => {
    const { session } = await ready();
    expect(session.round()).not.toHaveProperty("pending");
  });

  it("is move from the signature, before the send's answer, and absent once a Snapshot shows it applied", async () => {
    const { session, play, game } = await ready();
    const held = deferred();
    play.answer("continueRound", held.responder);
    game.send(action("a1", 0, 1));
    await settleMany();
    expect(play.sent("continueRound")).toHaveLength(1);
    expect(session.round()?.pending).toBe("move");
    held.release(ok(stepsRead(1, 1)));
    await settleMany();
    // Applied: the signer is still `open`, with nothing pending.
    expect(session.round()).toMatchObject({ verdict: "ready" });
    expect(session.round()).not.toHaveProperty("pending");
  });

  it("is cash-out while the cash-out is in flight, and absent once the result shows it", async () => {
    const { session, play } = await moved(ok(stepsRead(1, 1)));
    const held = deferred();
    play.answer("cashOutRound", held.responder);
    const cashing = session.cashOut();
    await settleMany();
    expect(session.round()?.pending).toBe("cash-out");
    held.release(ok(stepsRead(1, 2, "won")));
    await cashing;
    expect(session.round()).not.toHaveProperty("pending");
  });

  it("stays set while a lost move waits for a read, and beside unconfirmed after the lost resend", async () => {
    const { session, play } = await moved(lost);
    expect(session.round()?.pending).toBe("move");
    expect(session.round()).not.toHaveProperty("unconfirmed");
    play.answer("getSnapshot", ok(stepsRead(0, 1)));
    play.answer("continueRound", lost);
    await session.read();
    expect(session.round()).toMatchObject({
      unconfirmed: "move",
      pending: "move",
    });
  });

  it.each([
    ["400 INVALID_ARGUMENT", problem(400, "INVALID_ARGUMENT")],
    ["409 STALE_ACTION", problem(409, "STALE_ACTION")],
  ])(
    "is absent once a %s holds signing, and after a read shows the move applied (adopted)",
    async (_, answer) => {
      const { session, play } = await moved(answer);
      expect(session.round()).not.toHaveProperty("pending");
      expect(session.round()?.outOfSync).toBe(false);
      play.answer("getSnapshot", ok(stepsRead(1, 1)));
      await session.read();
      expect(session.round()?.outOfSync).toBe(false);
      expect(session.round()).not.toHaveProperty("pending");
    },
  );

  it("is absent once a 409 holds signing and a read shows the move not applied (out of sync)", async () => {
    const { session, play } = await moved(problem(409, "STALE_ACTION"));
    play.answer("getSnapshot", ok(stepsRead(0, 1)));
    await session.read();
    expect(session.round()?.outOfSync).toBe(true);
    expect(session.round()).not.toHaveProperty("pending");
  });

  it("is absent once the round is re-issued, with the move still pending", async () => {
    const { session, play } = await moved(lost);
    play.answer("getSnapshot", ok(reissuedAt(0, 1)));
    // The re-issue still lets the one W-16 resend go out (W-26).
    play.answer("continueRound", lost);
    await session.read();
    expect(session.round()?.verdict).toBe("failed");
    expect(session.round()).not.toHaveProperty("pending");
  });

  it("is absent once the round is closed", async () => {
    const { session, play } = await moved(lost);
    play.answer("getSnapshot", ok(stepsRead(1, 1, "won")));
    await session.read();
    expect(session.round()).not.toHaveProperty("pending");
  });

  it("is absent once the session has ended, with the move still pending", async () => {
    const { session } = await moved(lost);
    expect(session.round()?.pending).toBe("move");
    session.end();
    expect(session.round()).not.toHaveProperty("pending");
  });

  it("is never set for the required cancel, even while it is in flight", async () => {
    const opened = await open({ rpc: disagreeingRpc });
    const session = sessionOf(opened);
    const held = deferred();
    opened.play.answer("startRound", ok(issued.snapshot));
    opened.play.answer("cancelRound", held.responder);
    const started = session.start(ROUND_REQUEST.bet);
    await settleMany();
    expect(opened.play.sent("cancelRound")).toHaveLength(1);
    expect(session.round()?.cancel).toBe("in-flight");
    expect(session.round()).not.toHaveProperty("pending");
    held.release(lost);
    await started;
    expect(session.round()).not.toHaveProperty("pending");
  });

  it("is a word, never a signature, key, or bytes", async () => {
    const { session } = await moved(lost);
    const state = session.round();
    expect(state?.pending).toBe("move");
    const text = JSON.stringify(state);
    expect(text).not.toMatch(/0x[0-9a-f]{16,}/iu);
  });
});
