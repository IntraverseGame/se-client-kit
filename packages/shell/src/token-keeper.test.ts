// T-7 (W-5 to W-8): the play token's schedule. The refresh point comes from the
// fixture's `tokenExpiresAt` and the redeem's clock offset; one refresh is in
// flight; the new token replaces the old one only once its answer arrived; a
// lost answer is retried with backoff while the old token is valid; the
// session-ending codes and the deadline end the session; nothing is sent only
// to keep the session alive. The clock is manual.

import {
  DEFAULT_REFRESH_CONFIG,
  type PlayRequest,
  type PlayResponse,
  parseDeadline,
} from "@intraverse/se-client-play-client";
import { describe, expect, it } from "vitest";

import {
  createFakePlay,
  deferred,
  type FakePlay,
  lost,
  problem,
  type Responder,
} from "./fixtures/fake-play.ts";
import { createWallClock, type WallClock } from "./fixtures/wall-clock.ts";
import { REDACTED, sealSecret } from "./redaction.ts";
import { createTokenKeeper, type TokenKeeper } from "./token-keeper.ts";

// Fixture values: the server's time of the redeem and the first deadline.
const ISSUED_AT = "2026-10-16T12:00:00.000Z";
const FIRST_EXPIRES = "2026-10-16T12:15:00.000Z";
const SECOND_EXPIRES = "2026-10-16T12:30:00.000Z";

const ms = (text: string): number => {
  const value = parseDeadline(text);
  if (value === undefined) throw new TypeError("fixture: not a deadline");
  return value;
};

/** W-6: the lead is the larger of the fraction of the lifetime and the margin. */
const refreshPoint = (issuedAt: string, expiresAt: string): number => {
  const lifetime = ms(expiresAt) - ms(issuedAt);
  const lead = Math.max(
    DEFAULT_REFRESH_CONFIG.fraction * lifetime,
    DEFAULT_REFRESH_CONFIG.marginMs,
  );
  return Math.floor(ms(expiresAt) - lead);
};

const refreshed =
  (clock: WallClock, token: string, expiresAt: string): Responder =>
  (): PlayResponse => ({
    status: 200,
    body: { playToken: token, tokenExpiresAt: expiresAt },
    receivedAtMs: clock.now(),
    clockOffsetMs: undefined,
  });

type Kept = {
  readonly keeper: TokenKeeper;
  readonly play: FakePlay;
  readonly clock: WallClock;
  readonly ends: () => number;
};

const keep = (offsetMs = 0): Kept => {
  // The local clock is the server's minus the offset (server = local + offset).
  const clock = createWallClock(ms(ISSUED_AT) - offsetMs);
  const play = createFakePlay();
  let ends = 0;
  const keeper = createTokenKeeper(
    {
      transport: play.transport,
      clock,
      onEnd: () => {
        ends += 1;
      },
    },
    {
      playToken: sealSecret("play-token", "pt_first"),
      tokenExpiresAt: FIRST_EXPIRES,
      receivedAtMs: clock.now(),
      clockOffsetMs: offsetMs,
    },
  );
  return { keeper, play, clock, ends: () => ends };
};

const authorizationOf = (request: PlayRequest | undefined): string =>
  request?.authorization?.() ?? "none";

/** The first pending timer's due time. */
const firstDue = (clock: WallClock): number =>
  clock.dueTimes()[0] ?? Number.NaN;

/** Lets the keeper's promise callbacks run. */
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 10; turn += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each turn is one more microtask
    await Promise.resolve();
  }
};

describe("the refresh point (W-5, W-6)", () => {
  it("comes from tokenExpiresAt, and nothing is sent before it (W-8)", () => {
    const { clock, play } = keep();
    const point = refreshPoint(ISSUED_AT, FIRST_EXPIRES);
    expect(clock.dueTimes()).toEqual([point, ms(FIRST_EXPIRES)]);
    clock.advance(point - clock.now() - 1);
    expect(play.all()).toEqual([]);
  });

  it("is corrected by the redeem's clock offset", () => {
    const offset = 90_000;
    const { clock } = keep(offset);
    expect(clock.dueTimes()).toEqual([
      refreshPoint(ISSUED_AT, FIRST_EXPIRES) - offset,
      ms(FIRST_EXPIRES) - offset,
    ]);
  });
});

describe("the refresh (W-6)", () => {
  it("presents the old token, which stays in use until the answer arrives", async () => {
    const { keeper, play, clock } = keep();
    const answer = deferred();
    play.answer("refreshPlayToken", answer.responder);
    clock.advance(refreshPoint(ISSUED_AT, FIRST_EXPIRES) - clock.now());
    const [sent] = play.sent("refreshPlayToken");
    expect(authorizationOf(sent)).toBe("Bearer pt_first");
    expect(keeper.authorization()).toBe("Bearer pt_first");
    answer.release(refreshed(clock, "pt_second", SECOND_EXPIRES));
    await settle();
    expect(keeper.authorization()).toBe("Bearer pt_second");
  });

  it("keeps one refresh in flight", async () => {
    const { play, clock } = keep();
    const answer = deferred();
    play.answer("refreshPlayToken", answer.responder);
    clock.advance(ms(FIRST_EXPIRES) - clock.now() - 1);
    await settle();
    expect(play.sent("refreshPlayToken")).toHaveLength(1);
  });

  it("schedules the next refresh from the new deadline", async () => {
    const { play, clock } = keep();
    play.answer(
      "refreshPlayToken",
      refreshed(clock, "pt_second", SECOND_EXPIRES),
    );
    clock.advance(refreshPoint(ISSUED_AT, FIRST_EXPIRES) - clock.now());
    await settle();
    const receivedAt = new Date(clock.now()).toISOString();
    expect(clock.dueTimes()).toEqual([
      refreshPoint(receivedAt, SECOND_EXPIRES),
      ms(SECOND_EXPIRES),
    ]);
  });
});

describe("a failed refresh (W-7)", () => {
  it("is retried after a lost answer, with the same old token, with backoff", async () => {
    const { keeper, play, clock } = keep();
    // The token each attempt presented, read when it was sent.
    const presented: string[] = [];
    const presenting =
      (responder: Responder): Responder =>
      request => {
        presented.push(authorizationOf(request));
        return responder(request);
      };
    play.answer(
      "refreshPlayToken",
      presenting(lost),
      presenting(refreshed(clock, "pt_second", SECOND_EXPIRES)),
    );
    clock.advance(refreshPoint(ISSUED_AT, FIRST_EXPIRES) - clock.now());
    await settle();
    expect(play.sent("refreshPlayToken")).toHaveLength(1);
    const retryAt = firstDue(clock);
    expect(retryAt).toBeGreaterThan(clock.now());
    clock.advance(retryAt - clock.now());
    await settle();
    expect(presented).toEqual(["Bearer pt_first", "Bearer pt_first"]);
    expect(keeper.authorization()).toBe("Bearer pt_second");
  });

  it.each(["SESSION_EXPIRED", "SESSION_REVOKED", "UNAUTHENTICATED"])(
    "%s ends the session: the token is gone",
    async code => {
      const { keeper, play, clock, ends } = keep();
      play.answer("refreshPlayToken", problem(401, code));
      clock.advance(refreshPoint(ISSUED_AT, FIRST_EXPIRES) - clock.now());
      await settle();
      expect(keeper.ended()).toBe(true);
      expect(ends()).toBe(1);
      expect(() => keeper.authorization()).toThrow(
        expect.objectContaining({ code: "session-ended" }),
      );
      expect(clock.dueTimes()).toEqual([]);
    },
  );

  it("is not retried past the deadline, which ends the session", async () => {
    const { keeper, play, clock, ends } = keep();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      play.answer("refreshPlayToken", lost);
    }
    clock.advance(ms(FIRST_EXPIRES) - clock.now() - 1);
    await settle();
    for (let turn = 0; turn < 50; turn += 1) {
      clock.advance(1);
      // oxlint-disable-next-line no-await-in-loop -- one timer per turn
      await settle();
    }
    expect(keeper.ended()).toBe(true);
    expect(ends()).toBe(1);
    const attempts = play.sent("refreshPlayToken").length;
    clock.advance(60_000);
    await settle();
    expect(play.sent("refreshPlayToken")).toHaveLength(attempts);
  });

  it("a refusal that does not end the session waits for the deadline", async () => {
    const { keeper, play, clock } = keep();
    play.answer("refreshPlayToken", problem(400, "INVALID_ARGUMENT"));
    clock.advance(refreshPoint(ISSUED_AT, FIRST_EXPIRES) - clock.now());
    await settle();
    expect(keeper.ended()).toBe(false);
    expect(keeper.authorization()).toBe("Bearer pt_first");
    clock.advance(ms(FIRST_EXPIRES) - clock.now());
    expect(keeper.ended()).toBe(true);
    expect(play.sent("refreshPlayToken")).toHaveLength(1);
  });
});

describe("the keeper", () => {
  it("prints nothing of the token", () => {
    const { keeper } = keep();
    expect(String(keeper)).toBe(REDACTED);
    expect(JSON.stringify(keeper)).toBe(`"${REDACTED}"`);
    expect(Object.keys(keeper)).toEqual(["authorization", "ended", "end"]);
  });

  it("ends once, and makes no call after", () => {
    const { keeper, clock, play, ends } = keep();
    keeper.end();
    keeper.end();
    expect(ends()).toBe(1);
    clock.advance(ms(FIRST_EXPIRES) - clock.now() + 1);
    expect(play.all()).toEqual([]);
  });
});
