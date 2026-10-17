// The pick edge cases (W-23's pre-check, `busy`, `invalid`, the use case's
// outcome): a fake frame and listener, no DOM and no real window.

import { describe, expect, it } from "vitest";

import {
  action,
  createFakeGame,
  HELLO,
  mount,
  ready,
  reject,
} from "./fixtures/fake-game.ts";
import { flush } from "./fixtures/fake-locks.ts";
import { snapshot } from "./fixtures/vectors.ts";

describe("picks (W-23, the edge cases)", () => {
  it("hands a legal pick to the use case and sends nothing on acceptance", async () => {
    const game = ready();
    game.send(action("a", 1, 2));
    expect(game.picks).toEqual([{ step: 1, option: 2 }]);
    await game.settle({ accepted: true });
    expect(game.posted).toEqual([]);
  });

  it("rejects a pick for a step that is not current, or an option out of range", () => {
    const game = ready();
    game.send(action("past", 0, 0));
    game.send(action("future", 2, 0));
    game.send(action("missing", 9, 0));
    game.send(action("range", 1, 3));
    expect(game.picks).toEqual([]);
    expect(game.posted.map(p => p.message)).toEqual([
      reject("past", "not_legal"),
      reject("future", "not_legal"),
      reject("missing", "not_legal"),
      reject("range", "not_legal"),
    ]);
  });

  it("rejects a pick while the round is not active", () => {
    for (const status of [
      "idle",
      "starting",
      "resolving",
      "won",
      "lost",
      "canceled",
    ] as const) {
      const game = ready();
      // A later version, so the bridge keeps it whatever the vector's own.
      game.bridge.sendSnapshot({ ...snapshot(status), version: 100 });
      game.posted.length = 0;
      game.send(action("a", 1, 0));
      expect(game.picks).toEqual([]);
      expect(game.posted.map(p => p.message)).toEqual([
        reject("a", "not_active"),
      ]);
    }
  });

  it("rejects a pick before any Snapshot as not active", () => {
    const game = createFakeGame();
    mount(game);
    game.send(HELLO);
    game.send(action("a", 0, 0));
    expect(game.posted.map(p => p.message)).toEqual([
      reject("a", "not_active"),
    ]);
  });

  it("answers invalid to a well-formed action with a bad verb or args", () => {
    const game = ready();
    game.send({ ...action("v", 1, 0), verb: "cashOut" });
    game.send({ ...action("w", 1, 0), args: { step: 1 } });
    expect(game.picks).toEqual([]);
    expect(game.posted.map(p => p.message)).toEqual([
      reject("v", "invalid"),
      reject("w", "invalid"),
    ]);
  });

  it("answers busy to a second pick, the same id included, until the first settles", async () => {
    const game = ready();
    game.send(action("a", 1, 0));
    game.send(action("b", 1, 1));
    game.send(action("a", 1, 0));
    expect(game.picks).toHaveLength(1);
    expect(game.posted.map(p => p.message)).toEqual([
      reject("b", "busy"),
      reject("a", "busy"),
    ]);
    await game.settle({ accepted: true });
    game.posted.length = 0;
    // The step moved on: the same id is now decided by the legality check.
    game.bridge.sendSnapshot({
      ...snapshot("active", { step: 2 }),
      version: 9,
    });
    game.posted.length = 0;
    game.send(action("a", 1, 0));
    expect(game.posted.map(p => p.message)).toEqual([reject("a", "not_legal")]);
  });

  it("lets a second pick for the same step through once the first settles (the use case is the gate)", async () => {
    // The pre-check is an early filter: it reads only the latest Snapshot sent
    // to the game, and the slot is freed when the use case settles. Before the
    // Snapshot that answers the first pick arrives, a second pick for the same
    // step passes it and reaches the use case, which must refuse it (W-15,
    // W-23); that refusal is the use case's own test.
    const game = ready();
    game.send(action("first", 1, 0));
    await game.settle({ accepted: true });
    game.send(action("second", 1, 1));
    expect(game.picks).toEqual([
      { step: 1, option: 0 },
      { step: 1, option: 1 },
    ]);
    expect(game.posted).toEqual([]);
  });

  it("relays the use case's reject reason", async () => {
    const game = ready();
    game.send(action("a", 1, 0));
    await game.settle({ accepted: false, reason: "not_active" });
    expect(game.posted.map(p => p.message)).toEqual([
      reject("a", "not_active"),
    ]);
  });

  it("treats a use case that throws or rejects as not active, and frees the slot", async () => {
    const throwing = ready({
      pick: (): never => {
        throw new Error("down");
      },
    });
    throwing.send(action("a", 1, 0));
    throwing.send(action("b", 1, 0));
    expect(throwing.posted.map(p => p.message)).toEqual([
      reject("a", "not_active"),
      reject("b", "not_active"),
    ]);

    const rejecting = ready({
      pick: (): Promise<never> => Promise.reject(new Error("down")),
    });
    rejecting.send(action("a", 1, 0));
    await flush();
    expect(rejecting.posted.map(p => p.message)).toEqual([
      reject("a", "not_active"),
    ]);
  });

  it("sends no reject after close", async () => {
    const game = ready();
    game.send(action("a", 1, 0));
    game.bridge.close();
    await game.settle({ accepted: false, reason: "busy" });
    expect(game.posted).toEqual([]);
  });

  it("a frame that throws on postMessage does not break the bridge", () => {
    let calls = 0;
    const frame = {
      postMessage: (): never => {
        calls += 1;
        throw new Error("gone");
      },
    };
    const game = createFakeGame({ frame });
    const bridge = mount(game);
    game.send(HELLO);
    expect(() => {
      bridge.sendSnapshot(snapshot("active"));
      game.send(action("a", 0, 0));
    }).not.toThrow();
    expect(calls).toBe(2);
    expect(bridge.state()).toBe("ready");
  });
});
