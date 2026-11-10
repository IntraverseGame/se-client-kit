// T-9a's component cases for the proven path (W-49a, W-49c, W-49d; ADR-011):
// a direct frame whose `location.ancestorOrigins` holds one entry on
// `operatorOrigins`. The session opens with no `hello`, `welcome` is posted
// once to that entry and no handshake timer runs (4); a later `hello` from the
// parent and that origin is answered, any other ignored (4); a recorded
// `hello` is still checked first (5); `welcome` comes before the heights (8).

import { describe, expect, it } from "vitest";

import { environmentDocument } from "./fixtures/environment.ts";
import { snapshotRead } from "./fixtures/fake-session.ts";
import { flush } from "./fixtures/flush.ts";
import {
  bootFramed,
  DIRECT,
  type FramedBoot,
  HELLO,
  OPERATOR,
  WELCOME_POST,
} from "./fixtures/framed-boot.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;
const ignore = (): void => {};
const OTHER = "https://evil.example";
/** A second listed origin (the operator's lobby, say). */
const LOBBY = "https://lobby.operator.example";

/** Boots on the proven path with an idle session ready, the config released. */
const configured = async (
  embedding = DIRECT,
  heights?: (report: (height: number) => void) => void,
): Promise<FramedBoot> => {
  const framed = bootFramed({
    embedding,
    ...(heights === undefined ? {} : { heights }),
  });
  framed.session.reads.push(snapshotRead("coinflip-idle"));
  await framed.releaseConfig();
  return framed;
};

const refusedWith = async (framed: FramedBoot, code: string): Promise<void> => {
  expect((await framed.result).kind).toBe("refused");
  expect(framed.host.textContent).toContain(m["state.configuration"]);
  expect(framed.records).toEqual([
    { level: "warn", event: "embedding.refused", code },
  ]);
  expect(framed.opened()).toBe(0);
};

describe("the proven path: the gate (T-9a, 4)", () => {
  it("the proven path: the session opens with no hello, and welcome is posted once", async () => {
    const framed = await configured(DIRECT);
    expect((await framed.result).kind).toBe("configured");
    expect(framed.posted).toEqual([WELCOME_POST]);
    expect(framed.opened()).toBe(1);
    expect(framed.session.mounts).toHaveLength(1);
    // No handshake timer runs on the proven path.
    expect(framed.timers.pendingDelays()).toEqual([]);
    expect(framed.records).toEqual([]);
  });

  it("the proven path: a late hello from the parent is answered, any other ignored", async () => {
    const framed = await configured(DIRECT);
    await framed.result;
    framed.send(HELLO);
    framed.send(HELLO, { origin: OTHER });
    framed.send(HELLO, { source: {} });
    await flush();
    expect(framed.posted).toEqual([WELCOME_POST, WELCOME_POST]);
    expect(framed.opened()).toBe(1);
  });
});

describe("the proven path: record, then check (T-9a, 5)", () => {
  it("the proven path: a recorded hello from the entry is welcomed once", async () => {
    const framed = bootFramed({ embedding: DIRECT });
    framed.session.reads.push(snapshotRead("coinflip-idle"));
    framed.send(HELLO);
    await framed.releaseConfig();
    expect((await framed.result).kind).toBe("configured");
    expect(framed.posted).toEqual([WELCOME_POST]);
  });

  it.each<[string, string]>([
    ["an unlisted origin", OTHER],
    ["a listed origin other than the entry", LOBBY],
  ])(
    "the proven path: a recorded hello from %s refuses, finally",
    async (_what, origin) => {
      const framed = bootFramed({
        embedding: DIRECT,
        document: environmentDocument({ operatorOrigins: [OPERATOR, LOBBY] }),
      });
      framed.send(HELLO, { origin });
      await framed.releaseConfig();
      await refusedWith(framed, "operator-not-allowed");
      expect(framed.posted).toEqual([]);
    },
  );
});

describe("the proven path: resize (T-9a, 8)", () => {
  it("the proven path: welcome, then the heights, with no hello", async () => {
    let report: (height: number) => void = ignore;
    const framed = await configured(DIRECT, next => {
      report = next;
      next(480);
    });
    await framed.result;
    report(640);
    expect(framed.posted).toEqual([
      WELCOME_POST,
      {
        message: { schema: "se.operator/1", type: "resize", height: 480 },
        targetOrigin: OPERATOR,
      },
      {
        message: { schema: "se.operator/1", type: "resize", height: 640 },
        targetOrigin: OPERATOR,
      },
    ]);
  });
});
