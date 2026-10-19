// The guards around the redeem (W-49a, W-49c, W-43): an accepted
// configuration is read once, however often the browser comes back online
// while the gate waits for `hello` or while the session opens, so the launch
// code is redeemed once; a framing that is unknown refuses, opens nothing, and
// discards the launch code; and a framed page whose platform gave no parent
// window can only time out.

import { describe, expect, it } from "vitest";

import { snapshotRead } from "./fixtures/fake-session.ts";
import { flush, stepTimers } from "./fixtures/flush.ts";
import { bootFramed, HELLO, WELCOME_POST } from "./fixtures/framed-boot.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;

describe("one configuration read, one redeem (W-43, W-49c)", () => {
  it("online before hello and while the session opens reads nothing again", async () => {
    const framed = bootFramed({ holdOpening: true });
    framed.session.reads.push(snapshotRead("coinflip-idle"));
    await framed.releaseConfig();
    expect(framed.fetches()).toBe(1);
    // The gate waits for `hello`: the browser comes back online.
    await framed.goOnline();
    expect(framed.fetches()).toBe(1);
    framed.send(HELLO);
    await flush();
    expect(framed.opened()).toBe(1);
    // The session is opening (the redeem in flight): online again.
    await framed.goOnline();
    await framed.finishOpening();
    expect((await framed.result).kind).toBe("configured");
    expect(framed.fetches()).toBe(1);
    expect(framed.opened()).toBe(1);
    expect(framed.posted).toEqual([WELCOME_POST]);
  });
});

describe("an unknown framing and an unreachable parent (W-49a, W-49c)", () => {
  it("refuses an unknown framing: nothing opened, the reason logged, the launch code discarded", async () => {
    const framed = bootFramed({ embedding: null });
    framed.send(HELLO);
    await framed.releaseConfig();
    expect((await framed.result).kind).toBe("refused");
    expect(framed.host.textContent).toContain(m["state.configuration"]);
    expect(framed.opened()).toBe(0);
    expect(framed.discarded()).toBe(1);
    expect(framed.records).toEqual([
      { level: "warn", event: "embedding.refused", code: "ancestors-unknown" },
    ]);
  });

  it("a framed page with no parent window can only time out", async () => {
    const framed = bootFramed({ noParent: true });
    framed.send(HELLO);
    await framed.releaseConfig();
    framed.send(HELLO);
    await stepTimers(framed.timers, 10_000);
    expect((await framed.result).kind).toBe("refused");
    expect(framed.opened()).toBe(0);
    expect(framed.discarded()).toBe(1);
    expect(framed.posted).toEqual([]);
    expect(framed.records).toEqual([
      { level: "warn", event: "embedding.refused", code: "handshake-timeout" },
    ]);
  });
});
