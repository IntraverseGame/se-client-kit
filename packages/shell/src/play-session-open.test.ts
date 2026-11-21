// T-4a and T-17's shell half: the launch code is taken out of the URL before
// the first request, redeemed once and never repeated; a tab without the
// signer lock opens nothing and draws no key; the key is drawn at the open
// (W-9), and one that cannot be drawn opens nothing; and the public options
// carry no typedData encoder. Scripted Play API, manual clock, fake locks.

import { describe, expect, expectTypeOf, it } from "vitest";

import { createFakeLockManager } from "./fixtures/fake-locks.ts";
import { lost, problem, type Responder } from "./fixtures/fake-play.ts";
import {
  CODE,
  GAME,
  LAUNCH,
  NOW,
  open,
  redeemed,
  sessionOf,
} from "./fixtures/play-session.ts";
import { recordingRandom } from "./fixtures/seeded.ts";
import type { PlaySessionOptions, SessionParts } from "./session-options.ts";

describe("session open (W-1, W-1a, W-2)", () => {
  it("removes the fragment before the first request, then redeems the code once", async () => {
    const opened = await open();
    expect(opened.opening.kind).toBe("open");
    expect(opened.events).toEqual([
      `replace ${LAUNCH}`,
      "send /sessions:redeem",
    ]);
    expect(opened.play.sent("redeemLaunchCode")[0]?.body).toEqual({
      launchCode: CODE,
    });
  });

  it.each([
    ["no fragment", LAUNCH],
    ["an empty fragment", `${LAUNCH}#`],
    ["a code in the query only", `${LAUNCH}?launchCode=${CODE}`],
    ["129 characters", `${LAUNCH}#${"a".repeat(129)}`],
  ])("sends nothing with %s", async (_what, href) => {
    const opened = await open({ href });
    expect(opened.opening.kind).toBe("no-launch-code");
    expect(opened.play.all()).toEqual([]);
  });

  it.each([
    ["a lost answer", lost],
    ["a refused code", problem(401, "UNAUTHENTICATED")],
    ["a 503", problem(503, "UNAVAILABLE", false)],
  ])("does not repeat the redeem after %s", async (_what, redeem) => {
    const opened = await open({ redeem });
    expect(opened.opening.kind).toBe("redeem-failed");
    expect(opened.play.all()).toHaveLength(1);
    expect(opened.clock.dueTimes()).toEqual([]);
  });
});

/** The fixture's redeem answer without its `gameOrigin`. */
const withoutGameOrigin: Responder = async request => {
  const answer = await redeemed(() => NOW)(request);
  const { gameOrigin: _dropped, ...body } = answer.body as Record<
    string,
    unknown
  >;
  return { ...answer, body };
};

describe("the game origin D comes from the redeem answer (W-37)", () => {
  it("takes D from the redeem answer's gameOrigin", async () => {
    const session = sessionOf(await open({ gameOrigin: "https://d.example" }));
    expect(session.gameOrigin()).toBe("https://d.example");
  });

  it("has no option through which the Wrapper could give D", () => {
    expectTypeOf<PlaySessionOptions>().not.toHaveProperty("gameOrigin");
    expectTypeOf<SessionParts>().not.toHaveProperty("gameOrigin");
  });

  it.each([
    ["without a gameOrigin", withoutGameOrigin],
    ["with an empty gameOrigin", redeemed(() => NOW, "")],
    [
      "with a gameOrigin of 268 characters",
      redeemed(() => NOW, `https://${"a".repeat(260)}`),
    ],
  ])("opens no session for a redeem answer %s", async (_what, redeem) => {
    const opened = await open({ redeem });
    expect(opened.opening.kind).toBe("redeem-failed");
    expect(opened.play.all()).toHaveLength(1);
    expect(opened.clock.dueTimes()).toEqual([]);
  });

  it("answers GAME by default, the fixture's one allowed origin", async () => {
    expect(sessionOf(await open()).gameOrigin()).toBe(GAME);
  });
});

describe("the signer lock (W-14)", () => {
  it("a second tab of the session opens nothing: no read, no refresh", async () => {
    const locks = createFakeLockManager();
    const first = await open({ locks });
    const second = await open({ locks });
    expect(first.opening.kind).toBe("open");
    expect(second.opening.kind).toBe("other-tab");
    expect(second.play.all()).toHaveLength(1);
    expect(second.clock.dueTimes()).toEqual([]);
  });

  it("no Web Locks API signs nothing and opens nothing", async () => {
    const opened = await open({ locks: undefined });
    expect(opened.opening.kind).toBe("unsupported");
    expect(opened.clock.dueTimes()).toEqual([]);
  });

  it("a key that cannot be drawn at the open opens nothing, the lock released (W-9)", async () => {
    const locks = createFakeLockManager();
    const opened = await open({
      locks,
      random: (length: number): Uint8Array => new Uint8Array(length),
    });
    expect(opened.opening.kind).toBe("key-generation");
    // Only the redeem: nothing is read or refreshed.
    expect(opened.play.all()).toHaveLength(1);
    expect(opened.clock.dueTimes()).toEqual([]);
    // The lock is released: another page of the session may open.
    expect((await open({ locks })).opening.kind).toBe("open");
  });

  it("a tab without the lock draws no key (W-9, W-14)", async () => {
    const locks = createFakeLockManager();
    await open({ locks });
    const random = recordingRandom(5);
    const second = await open({ locks, random });
    expect(second.opening.kind).toBe("other-tab");
    expect(random.draws()).toHaveLength(0);
  });

  it("draws the key at the open, before any start (W-9)", async () => {
    const random = recordingRandom(5);
    const opened = await open({ random });
    expect(opened.opening.kind).toBe("open");
    expect(random.draws().map(draw => draw.length)).toEqual([32]);
    expect(opened.play.sent("startRound")).toHaveLength(0);
  });
});

describe("the public options", () => {
  it("carry no typedData encoder: production uses the canonical one", () => {
    expectTypeOf<PlaySessionOptions>().not.toHaveProperty("encodeTypedData");
    expectTypeOf<SessionParts>().not.toHaveProperty("encodeTypedData");
  });
});
