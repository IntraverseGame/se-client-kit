// The open session's use cases: it reads with the play token, starts a round
// with the key's address and shows it ready once checked, shows a
// `ROUND_ACTIVE` round it does not hold (also as the answer to the start's one
// resend, W-22), sends no resend once the session ended (W-22), mounts the game
// with its pick use case, ends on a session-ending answer, and prints no secret;
// and the one round-over check (W-35, W-39). Scripted Play API, manual clock,
// fake locks.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import { createFakeGame, HELLO, mountOf } from "./fixtures/fake-game.ts";
import { lost, ok, problem } from "./fixtures/fake-play.ts";
import {
  actionKeyOf,
  CODE,
  GAME,
  open,
  problem409,
  SE_ORIGIN,
  sessionOf,
  settleMany,
  TOKEN,
} from "./fixtures/play-session.ts";
import { ROUND_REQUEST } from "./fixtures/round-auth.ts";
import { issued, sessionAddress } from "./fixtures/session-round.ts";
import { snapshot, vectorInput } from "./fixtures/vectors.ts";
import { REDACTED } from "./redaction.ts";
import { isRoundOver } from "./snapshot-reading.ts";

const idle = (): ValidSnapshot => snapshot("idle");

describe("the open session", () => {
  it("reads the Snapshot with the play token, and holds the refresh", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    opened.play.answer("getSnapshot", ok(idle()));
    const read = await session.read();
    expect(read).toEqual({ kind: "snapshot", snapshot: idle() });
    const [sent] = opened.play.sent("getSnapshot");
    expect(sent?.authorization?.()).toBe(`Bearer ${TOKEN}`);
    expect(opened.clock.dueTimes()).toHaveLength(2);
  });

  it("starts a round with the key's address and the bet, and shows it ready once checked", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    opened.play.answer("startRound", ok(issued.snapshot));
    const read = await session.start(ROUND_REQUEST.bet);
    expect(read.kind).toBe("snapshot");
    const [start] = opened.play.sent("startRound");
    expect(start?.body).toMatchObject({
      actionKey: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/u),
      bet: { value: ROUND_REQUEST.bet.value, unit: ROUND_REQUEST.bet.unit },
    });
    expect(actionKeyOf(start)).toBe(sessionAddress());
    expect(session.round()).toEqual({
      roundId: issued.snapshot.roundId,
      verdict: "ready",
      outOfSync: false,
      // Coin Flip has one step: it never cashes out (W-24).
      cashOutOffered: false,
      cancel: "none",
    });
    expect(await session.cashOut()).toEqual({
      kind: "refused",
      reason: "not_legal",
    });
  });

  it("a ROUND_ACTIVE answer to the start shows the open round, which it does not hold", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    const body = vectorInput("valid", "problem-round-active");
    opened.play.answer("startRound", problem409(body));
    const read = await session.start(ROUND_REQUEST.bet);
    expect(read).toMatchObject({
      kind: "problem",
      problem: { code: "ROUND_ACTIVE" },
    });
    expect(session.round()).toBeUndefined();
  });

  it("a ROUND_ACTIVE answer to the start's one resend shows the open round, which it does not hold (W-22)", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    const game = createFakeGame({ gameOrigin: GAME, gameOrigins: [GAME] });
    expect(session.mountGame(mountOf(game)).ok).toBe(true);
    game.send(HELLO);
    const body = vectorInput("valid", "problem-round-active") as {
      readonly snapshot: { readonly roundId: string };
    };
    opened.play.answer("startRound", lost, problem409(body));
    const read = await session.start(ROUND_REQUEST.bet);
    expect(read).toMatchObject({
      kind: "problem",
      problem: { code: "ROUND_ACTIVE" },
    });
    const [start, resend] = opened.play.sent("startRound");
    expect(resend?.body).toEqual(start?.body);
    expect(opened.play.sent("startRound")).toHaveLength(2);
    expect(session.round()).toBeUndefined();
    expect(game.posted.at(-1)?.message).toMatchObject({
      type: "snapshot",
      snapshot: { roundId: body.snapshot.roundId },
    });
  });

  it("a session that ended before the start's one resend sends nothing more, and the start answers ended (W-22)", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    opened.play.answer(
      "startRound",
      request => {
        session.end();
        return lost(request);
      },
      ok(issued.snapshot),
    );
    expect(await session.start(ROUND_REQUEST.bet)).toEqual({
      kind: "session-ended",
    });
    expect(opened.play.sent("startRound")).toHaveLength(1);
    expect(session.round()).toBeUndefined();
  });

  it("mounts the game for D with its pick, which signs and reports the answer", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    opened.play.answer("startRound", ok(issued.snapshot));
    await session.start(ROUND_REQUEST.bet);
    const game = createFakeGame({ gameOrigin: GAME, gameOrigins: [GAME] });
    expect(session.mountGame(mountOf(game))).toEqual({
      ok: true,
      gameOrigin: GAME,
    });
    game.send(HELLO);
    expect(game.posted.at(-1)?.message).toMatchObject({ type: "snapshot" });
    const changes: string[] = [];
    session.onChange(read => {
      changes.push(read.kind);
    });
    opened.play.answer("continueRound", ok(snapshot("won")));
    game.send({
      schema: "se.controller/1",
      type: "action",
      id: "a1",
      verb: "pick",
      args: { step: 0, option: 1 },
    });
    await settleMany();
    expect(opened.play.sent("continueRound")).toHaveLength(1);
    expect(changes).toEqual(["snapshot"]);
  });

  it("mounts no game once the session ended (W-37)", async () => {
    const session = sessionOf(await open());
    session.end();
    expect(session.mountGame(mountOf(createFakeGame()))).toEqual({
      ok: false,
      refusal: "session-ended",
    });
  });

  it("checks D against the allow-list it was opened with, never one the UI gives (W-37)", async () => {
    const session = sessionOf(
      await open({ gameOrigins: ["https://other.example.net"] }),
    );
    const game = createFakeGame();
    // A caller that slips in its own list and origin past the type.
    const widened = {
      ...mountOf(game),
      gameOrigins: [GAME],
      ownOrigin: "https://elsewhere.example",
    } as ReturnType<typeof mountOf>;
    expect(session.mountGame(widened)).toEqual({
      ok: false,
      refusal: "origin-not-allowed",
    });
  });

  it("checks D against its own origin, fixed at open (W-37)", async () => {
    const session = sessionOf(
      await open({ gameOrigin: SE_ORIGIN, gameOrigins: [SE_ORIGIN] }),
    );
    expect(session.mountGame(mountOf(createFakeGame()))).toEqual({
      ok: false,
      refusal: "same-origin",
    });
  });

  it("applies W-37's registrable-domain rule with the configuration's environment (ADR-007)", async () => {
    const loopback = {
      gameOrigin: "http://localhost:5174",
      gameOrigins: ["http://localhost:5174"],
      ownOrigin: "http://localhost:5173",
    };
    const local = sessionOf(
      await open({
        ...loopback,
        config: { ...issued.config, environment: "local" },
      }),
    );
    expect(local.mountGame(mountOf(createFakeGame())).ok).toBe(true);
    const elsewhere = await Promise.all(
      (["preview", "production"] as const).map(async environment =>
        sessionOf(
          await open({
            ...loopback,
            config: { ...issued.config, environment },
          }),
        ),
      ),
    );
    // A caller that slips in another environment past the type.
    const widened = {
      ...mountOf(createFakeGame()),
      environment: "local",
    } as ReturnType<typeof mountOf>;
    for (const session of elsewhere) {
      expect(session.mountGame(widened)).toEqual({
        ok: false,
        refusal: "same-site",
      });
    }
  });

  it.each(["SESSION_EXPIRED", "SESSION_REVOKED", "UNAUTHENTICATED"])(
    "ends on %s: the key and the token are gone, and nothing more is sent",
    async code => {
      const opened = await open();
      const session = sessionOf(opened);
      let ends = 0;
      session.onEnd(() => {
        ends += 1;
      });
      opened.play.answer("getSnapshot", problem(401, code));
      expect(await session.read()).toEqual({ kind: "session-ended" });
      expect(session.ended()).toBe(true);
      expect(ends).toBe(1);
      const calls = opened.play.all().length;
      expect(await session.start(ROUND_REQUEST.bet)).toEqual({
        kind: "session-ended",
      });
      expect(await session.read()).toEqual({ kind: "session-ended" });
      expect(opened.play.all()).toHaveLength(calls);
      expect(opened.clock.dueTimes()).toEqual([]);
    },
  );

  it("prints [redacted], and nothing it returns holds the token or the code", async () => {
    const opened = await open();
    const session = sessionOf(opened);
    opened.play.answer("startRound", ok(issued.snapshot));
    const read = await session.start(ROUND_REQUEST.bet);
    expect(String(session)).toBe(REDACTED);
    expect(JSON.stringify(opened.opening)).toBe(
      `{"kind":"open","session":"${REDACTED}"}`,
    );
    const printed = JSON.stringify([read, session.round()]);
    expect(printed).not.toContain(TOKEN);
    expect(printed).not.toContain(CODE);
  });
});

describe("whether a round is over (W-35, W-39)", () => {
  it.each([
    ["won", true],
    ["lost", true],
    ["canceled", true],
    ["idle", false],
    ["starting", false],
    ["active", false],
    ["resolving", false],
  ])("%s: %s", (status, over) => {
    expect(isRoundOver({ status })).toBe(over);
  });
});
