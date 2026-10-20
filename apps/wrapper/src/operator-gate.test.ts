// T-9a's component cases (W-49a to W-49d): the Wrapper booted framed, with a
// fake parent and a fake page window. The gate (4): before `welcome` nothing
// is redeemed, mounted, or offered, on the path with `location.ancestorOrigins`
// and the one without it, and 10 s on the injected clock with no valid `hello`
// is the configuration-error state, finally. Record, then check (5). Framing
// (6). `resize` (8). Channel separation (11). The refusal log (12).

import { CONTROLLER_SCHEMA } from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import type { EmbeddingContext } from "./embedding.ts";
import { linkNamed } from "./fixtures/app.ts";
import { environmentDocument } from "./fixtures/environment.ts";
import { snapshotRead } from "./fixtures/fake-session.ts";
import { flush, stepTimers } from "./fixtures/flush.ts";
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
const NO_LIST: EmbeddingContext = {
  framed: true,
  nested: false,
  ancestorOrigins: undefined,
};

/** Boots framed with an idle session ready to read, the config released. */
const configured = async (
  embedding: EmbeddingContext = DIRECT,
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

const nothingOpened = (framed: FramedBoot): void => {
  expect(framed.opened()).toBe(0);
  expect(framed.session.mounts).toEqual([]);
  expect(framed.host.querySelector("iframe")).toBeNull();
  expect(framed.host.querySelectorAll("a")).toHaveLength(0);
};

const refusedWith = async (framed: FramedBoot, code: string): Promise<void> => {
  expect((await framed.result).kind).toBe("refused");
  expect(framed.host.textContent).toContain(m["state.configuration"]);
  expect(framed.records).toEqual([
    { level: "warn", event: "embedding.refused", code },
  ]);
  nothingOpened(framed);
};

describe("the gate (T-9a, 4)", () => {
  it.each<[string, EmbeddingContext]>([
    ["with location.ancestorOrigins", DIRECT],
    ["without it", NO_LIST],
  ])(
    "%s: nothing before welcome, the session after it",
    async (_path, embedding) => {
      const framed = await configured(embedding);
      expect(framed.host.textContent).toContain(m["status.loading"]);
      nothingOpened(framed);
      framed.send(HELLO);
      expect((await framed.result).kind).toBe("configured");
      expect(framed.posted).toEqual([WELCOME_POST]);
      expect(framed.opened()).toBe(1);
      expect(framed.session.mounts).toHaveLength(1);
    },
  );

  it.each<[string, EmbeddingContext]>([
    ["with location.ancestorOrigins", DIRECT],
    ["without it", NO_LIST],
  ])("%s: 10 s with no valid hello is final", async (_path, embedding) => {
    const framed = await configured(embedding);
    framed.send(HELLO, { origin: OTHER });
    await stepTimers(framed.timers, 9_900);
    nothingOpened(framed);
    await stepTimers(framed.timers, 100);
    await refusedWith(framed, "handshake-timeout");
    framed.send(HELLO);
    await flush();
    expect(framed.posted).toEqual([]);
    nothingOpened(framed);
  });

  it("an unlisted framer's perfect hello unlocks nothing where the list is missing", async () => {
    const framed = await configured(NO_LIST);
    framed.send(HELLO, { origin: OTHER });
    framed.send(HELLO, { origin: OTHER });
    expect(framed.posted).toEqual([]);
    await stepTimers(framed.timers, 10_000);
    await refusedWith(framed, "handshake-timeout");
  });
});

describe("record, then check (T-9a, 5)", () => {
  it("records a hello before the configuration, answers nothing, and completes once validated", async () => {
    const framed = bootFramed();
    framed.session.reads.push(snapshotRead("coinflip-idle"));
    framed.send(HELLO);
    await flush();
    expect(framed.posted).toEqual([]);
    // A configuration read longer than any repeat window.
    framed.timers.advance(60_000);
    await framed.releaseConfig();
    expect((await framed.result).kind).toBe("configured");
    expect(framed.posted).toEqual([WELCOME_POST]);
    expect(framed.opened()).toBe(1);
  });

  it("refuses an unlisted recorded origin at once", async () => {
    const framed = bootFramed({ embedding: NO_LIST });
    framed.send(HELLO, { origin: OTHER });
    framed.send(HELLO);
    await framed.releaseConfig();
    await refusedWith(framed, "operator-not-allowed");
    expect(framed.posted).toEqual([]);
  });

  it("counts the timeout from the validation, not from boot", async () => {
    const framed = bootFramed();
    framed.timers.advance(30_000);
    await framed.releaseConfig();
    expect(framed.timers.pendingDelays()).toEqual([10_000]);
  });
});

describe("framing (T-9a, 6)", () => {
  it.each<[string, EmbeddingContext, string]>([
    [
      "an unlisted entry",
      { ...DIRECT, ancestorOrigins: [OTHER] },
      "ancestor-not-allowed",
    ],
    [
      "a masked entry",
      { ...DIRECT, ancestorOrigins: ["null"] },
      "ancestor-masked",
    ],
    ["an empty list", { ...DIRECT, ancestorOrigins: [] }, "ancestors-unknown"],
    [
      "two entries",
      { ...DIRECT, ancestorOrigins: [OPERATOR, OPERATOR] },
      "nested",
    ],
    ["parent !== top", { ...DIRECT, nested: true }, "nested"],
    [
      "parent !== top, without the list",
      { ...NO_LIST, nested: true },
      "nested",
    ],
  ])(
    "refuses %s before any handshake, a perfect hello included",
    async (_what, embedding, code) => {
      const framed = bootFramed({ embedding });
      framed.send(HELLO);
      await framed.releaseConfig();
      await refusedWith(framed, code);
      expect(framed.posted).toEqual([]);
    },
  );

  it("a standalone launch needs no handshake and never posts to the parent", async () => {
    const framed = bootFramed({
      embedding: { framed: false, nested: false, ancestorOrigins: [] },
    });
    framed.session.reads.push(snapshotRead("coinflip-idle"));
    framed.send(HELLO);
    await framed.releaseConfig();
    expect((await framed.result).kind).toBe("configured");
    expect(framed.opened()).toBe(1);
    expect(framed.posted).toEqual([]);
  });

  it("refuses a configuration that lists no operator", async () => {
    const framed = bootFramed({
      document: environmentDocument({ operatorOrigins: [] }),
    });
    framed.send(HELLO);
    await framed.releaseConfig();
    await refusedWith(framed, "ancestor-not-allowed");
    expect(framed.posted).toEqual([]);
  });
});

describe("resize (T-9a, 8) and the controls after welcome", () => {
  it("sends the observed heights only after welcome, to the fixed origin", async () => {
    let report: (height: number) => void = ignore;
    const framed = await configured(DIRECT, next => {
      report = next;
      next(480);
    });
    report(500);
    expect(framed.posted).toEqual([]);
    framed.send(HELLO);
    await framed.result;
    report(480);
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

  it("offers the lobby to the top-level window once the gate opened", async () => {
    const framed = bootFramed({
      document: environmentDocument({
        operatorOrigins: ["https://luckybet.example.com"],
      }),
      embedding: {
        ...DIRECT,
        ancestorOrigins: ["https://luckybet.example.com"],
      },
    });
    framed.session.reads.push(snapshotRead("coinflip-idle"));
    framed.send(HELLO, { origin: "https://luckybet.example.com" });
    await framed.releaseConfig();
    await framed.result;
    await flush();
    const lobby = linkNamed(framed.host, m["action.lobby"]);
    expect(lobby?.getAttribute("target")).toBe("_top");
    expect(linkNamed(framed.host, m["action.deposit"])).toBeDefined();
  });
});

describe("channel separation (T-9a, 11) and the log (T-9a, 12)", () => {
  it("routes the game frame's messages to the bridge only, and the parent's to the channel only", async () => {
    const framed = await configured();
    framed.send(HELLO);
    await framed.result;
    const [mount] = framed.session.mounts;
    const game: unknown[] = [];
    mount?.listen(event => game.push(event.data));
    // An `se.controller/1` message from the parent never reaches the bridge.
    framed.send({ schema: CONTROLLER_SCHEMA, type: "hello" });
    // A valid `se.operator/1` hello from the game frame never reaches the
    // operator channel: no welcome is posted for it (the bridge drops it).
    framed.send(HELLO, { source: mount?.frame });
    framed.send(HELLO, { source: null });
    expect(framed.posted).toEqual([WELCOME_POST]);
    expect(game).toEqual([HELLO]);
  });

  it("logs nothing for an ignored message", async () => {
    const framed = await configured();
    for (const data of ["hello", [HELLO], { ...HELLO, extra: 1 }]) {
      framed.send(data);
    }
    framed.send(HELLO, { origin: OTHER });
    framed.send(HELLO, { source: {} });
    await flush();
    expect(framed.records).toEqual([]);
    expect(framed.posted).toEqual([]);
  });
});
