// T-4a and T-17's shell half: the launch code is taken out of the URL before
// the first request, redeemed once and never repeated; a tab without the
// signer lock opens nothing; and the public options carry no typedData
// encoder. Scripted Play API, manual clock, fake locks.

import { describe, expect, expectTypeOf, it } from "vitest";

import { createFakeLockManager } from "./fixtures/fake-locks.ts";
import { lost, problem } from "./fixtures/fake-play.ts";
import { CODE, LAUNCH, open } from "./fixtures/play-session.ts";
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
});

describe("the public options", () => {
  it("carry no typedData encoder: production uses the canonical one", () => {
    expectTypeOf<PlaySessionOptions>().not.toHaveProperty("encodeTypedData");
    expectTypeOf<SessionParts>().not.toHaveProperty("encodeTypedData");
  });
});
