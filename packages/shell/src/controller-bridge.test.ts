// T-9, the controller boundary (W-37, W-38): mounting, which messages are
// accepted, the hello, and Snapshot forwarding. A fake frame and listener, no
// DOM and no real window. The pick edge cases are in controller-picks.test.ts.

import { describe, expect, it } from "vitest";

import { createControllerBridge } from "./controller-bridge.ts";
import { CONTROLLER_SCHEMA } from "./controller-protocol.ts";
import {
  action,
  createFakeGame,
  GAME_ORIGIN,
  HELLO,
  mount,
  ready,
  SE_ORIGIN,
} from "./fixtures/fake-game.ts";
import { snapshot } from "./fixtures/vectors.ts";

/** Values a serialized origin (as `event.origin` gives it) never takes. */
const NOT_ORIGINS = [
  "*",
  "null",
  "",
  "https://game.example.net/",
  "https://game.example.net/path",
  "HTTPS://GAME.EXAMPLE.NET",
  "http://game.example.net",
  "https://user@game.example.net",
  "https://game..example.net",
  "https://.game.example.net",
  "https://game.example.net.",
  "https://-game.example.net",
  "https://game-.example.net",
  "https://game.-example.net",
  "https://game.example.net:443",
  "http://localhost:80",
  "https://game.example.net:65536",
  "https://game.example.net:99999",
  "https://game.example.net:0",
  "https://game.example.net:08443",
  "https://game.example.net:",
  `https://${"a".repeat(64)}.example.net`,
] as const;

/** Mounts with `gameOrigin` listed and `ownOrigin` as the Wrapper's. */
const mountWith = (
  gameOrigin: string,
  ownOrigin: string = SE_ORIGIN,
): ReturnType<typeof createControllerBridge> =>
  createControllerBridge(
    createFakeGame({ gameOrigin, gameOrigins: [gameOrigin], ownOrigin })
      .options,
  );

describe("mounting the game (W-37)", () => {
  it("mounts a listed game origin that is not the Wrapper's", () => {
    const game = createFakeGame();
    const bridge = mount(game);
    expect(bridge.state()).toBe("awaiting-hello");
    expect(game.listening()).toBe(true);
  });

  it("refuses an origin that is not on the allow-list", () => {
    const game = createFakeGame({ gameOrigin: "https://other.example.net" });
    expect(createControllerBridge(game.options)).toEqual({
      ok: false,
      refusal: "origin-not-allowed",
    });
    expect(game.listening()).toBe(false);
  });

  it("refuses the Wrapper's own origin, even when it is listed", () => {
    const game = createFakeGame({
      gameOrigin: SE_ORIGIN,
      gameOrigins: [SE_ORIGIN, GAME_ORIGIN],
    });
    expect(createControllerBridge(game.options)).toEqual({
      ok: false,
      refusal: "same-origin",
    });
  });

  it("refuses a game origin that is not a serialized origin", () => {
    for (const gameOrigin of NOT_ORIGINS) {
      expect(mountWith(gameOrigin)).toEqual({
        ok: false,
        refusal: "invalid-origin",
      });
    }
  });

  it("refuses a Wrapper origin that is not a serialized origin", () => {
    for (const ownOrigin of NOT_ORIGINS) {
      expect(mountWith(GAME_ORIGIN, ownOrigin)).toEqual({
        ok: false,
        refusal: "invalid-origin",
      });
    }
  });

  it("accepts well-formed origins, loopback http included", () => {
    for (const gameOrigin of [
      "https://game.example.net:8443",
      "https://a.b-c.example",
      "https://1.2.3.4",
      "https://game.example.net:65535",
      "http://127.0.0.1:5174",
      "http://[::1]:5174",
      "http://localhost",
    ]) {
      expect(mountWith(gameOrigin, "http://localhost:5173").ok).toBe(true);
    }
  });
});

describe("which messages are accepted (W-38)", () => {
  it("ignores a message from another source, even from D", () => {
    const game = createFakeGame();
    const bridge = mount(game);
    game.send(HELLO, { source: {} });
    game.send(HELLO, { source: null });
    expect(bridge.state()).toBe("awaiting-hello");
  });

  it("ignores a message from another origin, even from the frame", () => {
    const game = createFakeGame();
    const bridge = mount(game);
    for (const origin of [SE_ORIGIN, "null", "https://game.example.net:443x"]) {
      game.send(HELLO, { origin });
    }
    expect(bridge.state()).toBe("awaiting-hello");
  });

  it("ignores a forged action from the wrong source or origin", () => {
    const game = ready();
    game.send(action("a", 1, 0), { source: {} });
    game.send(action("a", 1, 0), { origin: SE_ORIGIN });
    expect(game.picks).toEqual([]);
    expect(game.posted).toEqual([]);
  });

  it("ignores a bad schema, an unknown type, extra fields, and strings", () => {
    const game = ready();
    game.send(JSON.stringify(action("a", 1, 0)));
    game.send({ ...action("a", 1, 0), schema: "se.controller/2" });
    game.send({ schema: CONTROLLER_SCHEMA, type: "cashOut", id: "a" });
    game.send({ ...action("a", 1, 0), extra: true });
    expect(game.picks).toEqual([]);
    expect(game.posted).toEqual([]);
  });

  it("stops listening on close", () => {
    const game = ready();
    game.bridge.close();
    expect(game.listening()).toBe(false);
    game.bridge.sendSnapshot(snapshot("resolving"));
    expect(game.posted).toEqual([]);
    expect(game.bridge.state()).toBe("closed");
  });
});

describe("hello", () => {
  it("sends nothing before the hello, then the latest Snapshot", () => {
    const game = createFakeGame();
    const bridge = mount(game);
    bridge.sendSnapshot(snapshot("starting"));
    bridge.sendSnapshot(snapshot("active"));
    game.send(action("a", 1, 0));
    game.send({ ...action("b", 1, 0), verb: "x" });
    expect(game.posted).toEqual([]);
    game.send(HELLO);
    expect(bridge.state()).toBe("ready");
    expect(game.posted).toHaveLength(1);
    expect(game.posted[0]?.message).toMatchObject({
      schema: CONTROLLER_SCHEMA,
      type: "snapshot",
      snapshot: { status: "active" },
    });
  });

  it("posts only with targetOrigin D", () => {
    const game = ready();
    game.bridge.sendSnapshot(snapshot("resolving"));
    game.send(action("a", 0, 0));
    expect(game.posted.length).toBeGreaterThan(0);
    for (const { targetOrigin } of game.posted) {
      expect(targetOrigin).toBe(GAME_ORIGIN);
    }
  });

  it("counts only the first valid hello", () => {
    const game = createFakeGame();
    const bridge = mount(game);
    game.send({ ...HELLO, statuses: [] });
    expect(bridge.state()).toBe("awaiting-hello");
    game.send(HELLO);
    game.send({ ...HELLO, presentations: ["playback"] });
    expect(bridge.state()).toBe("ready");
    expect(game.incompatible()).toBe(0);
  });

  it("an incompatible hello ends the boundary: nothing is sent or accepted", () => {
    const game = createFakeGame();
    const bridge = mount(game);
    bridge.sendSnapshot(snapshot("active"));
    game.send({ ...HELLO, statuses: ["idle", "active", "won", "lost"] });
    expect(bridge.state()).toBe("incompatible");
    expect(game.incompatible()).toBe(1);
    game.send(HELLO);
    game.send(action("a", 1, 0));
    bridge.sendSnapshot(snapshot("resolving"));
    expect(game.posted).toEqual([]);
    expect(game.picks).toEqual([]);
    expect(game.incompatible()).toBe(1);
  });

  it("a game that does not declare steps is incompatible", () => {
    const game = createFakeGame();
    const bridge = mount(game);
    game.send({ ...HELLO, presentations: ["playback"] });
    expect(bridge.state()).toBe("incompatible");
  });
});

describe("snapshots", () => {
  it("forwards each accepted Snapshot and ignores a lower version (W-29)", () => {
    const game = ready();
    const resolving = snapshot("resolving");
    game.bridge.sendSnapshot(resolving);
    game.bridge.sendSnapshot({ ...snapshot("active"), version: 0 });
    expect(game.posted.map(p => p.message)).toMatchObject([
      { type: "snapshot", snapshot: { status: "resolving" } },
    ]);
  });
});
