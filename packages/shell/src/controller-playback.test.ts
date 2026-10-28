// T-23 (#146, W-38, RFC-003): forwarding a book round over the controller
// boundary. The bridge sends a `playback` Snapshot only to a game that
// declared `playback`, as its `playback` copy (playback-copy.test.ts); a copy
// that fails closes: nothing is forwarded, the game keeps its last copy, and
// the Wrapper is told (`onCopy`) until a later Snapshot's copy succeeds. A
// pick while the latest Snapshot sent is a book round's is `not_legal` before
// the status check, never `not_active`.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import type { GamePlaybackSnapshot } from "./controller-protocol.ts";
import { bookSnapshot, nested, wonWithData } from "./fixtures/book.ts";
import {
  action,
  createFakeGame,
  type FakeGame,
  HELLO,
  mount,
  reject,
} from "./fixtures/fake-game.ts";
import { snapshot } from "./fixtures/vectors.ts";
import { toPlaybackCopy } from "./playback-copy.ts";

const BOTH = { ...HELLO, presentations: ["steps", "playback"] };
const PLAYBACK = { ...HELLO, presentations: ["playback"] };

/** The copy of `value`, or a thrown error when it failed. */
const copyOf = (value: ValidSnapshot): GamePlaybackSnapshot => {
  const result = toPlaybackCopy(value);
  if (!result.ok) throw new Error("the copy failed");
  return result.copy;
};

/** A bridge past a hello declaring both presentations, recording `onCopy`. */
const readyBoth = (): FakeGame & {
  readonly bridge: ReturnType<typeof mount>;
  readonly copies: boolean[];
} => {
  const copies: boolean[] = [];
  const game = createFakeGame({ onCopy: built => copies.push(built) });
  const bridge = mount(game);
  game.send(BOTH);
  return { ...game, bridge, copies };
};

describe("forwarding a book round (W-38, RFC-003)", () => {
  it("sends the playback copy to a game that declared playback, and nothing else", () => {
    const game = readyBoth();
    game.bridge.sendSnapshot(bookSnapshot("won"));
    expect(game.posted).toHaveLength(1);
    expect(game.posted[0]?.message).toEqual({
      schema: "se.controller/1",
      type: "snapshot",
      snapshot: copyOf(bookSnapshot("won")),
    });
    expect(game.copies).toEqual([true]);
  });

  it("a game that declared playback only plays a book round", () => {
    const game = createFakeGame();
    const bridge = mount(game);
    bridge.sendSnapshot(bookSnapshot("idle"));
    game.send(PLAYBACK);
    expect(bridge.state()).toBe("ready");
    expect(game.posted.map(p => p.message)).toMatchObject([
      {
        type: "snapshot",
        snapshot: { presentation: "playback", status: "idle" },
      },
    ]);
  });

  it("a book round to a game that declared steps only ends in game not compatible", () => {
    const game = createFakeGame();
    const bridge = mount(game);
    game.send(HELLO);
    bridge.sendSnapshot(bookSnapshot("idle"));
    expect(bridge.state()).toBe("incompatible");
    expect(game.incompatible()).toBe(1);
    bridge.sendSnapshot(snapshot("active"));
    game.send(action("a", 1, 0));
    expect(game.posted).toEqual([]);
    expect(game.picks).toEqual([]);
  });

  it("a held book round sent when a steps-only hello arrives ends in game not compatible", () => {
    const game = createFakeGame();
    const bridge = mount(game);
    bridge.sendSnapshot(bookSnapshot("idle"));
    game.send(HELLO);
    expect(bridge.state()).toBe("incompatible");
    expect(game.posted).toEqual([]);
  });

  it("a copy that fails forwards nothing, keeps the game's last copy, and says so until one succeeds", () => {
    const game = readyBoth();
    game.bridge.sendSnapshot(bookSnapshot("starting"));
    game.bridge.sendSnapshot(wonWithData([nested(33)]));
    expect(game.posted.map(p => p.message)).toMatchObject([
      { snapshot: { status: "starting" } },
    ]);
    expect(game.copies).toEqual([true, false]);
    // A later Snapshot whose copy succeeds is forwarded, and the notice goes.
    game.bridge.sendSnapshot(wonWithData([{ side: "heads" }], 4));
    expect(game.posted.map(p => p.message)).toMatchObject([
      { snapshot: { status: "starting" } },
      { snapshot: { status: "won", version: 4 } },
    ]);
    expect(game.copies).toEqual([true, false, true]);
  });

  it("a failed copy before the hello is never sent; the last good one is", () => {
    const copies: boolean[] = [];
    const game = createFakeGame({ onCopy: built => copies.push(built) });
    const bridge = mount(game);
    bridge.sendSnapshot(bookSnapshot("starting"));
    bridge.sendSnapshot(wonWithData([nested(33)]));
    game.send(BOTH);
    expect(game.posted.map(p => p.message)).toMatchObject([
      { snapshot: { status: "starting" } },
    ]);
    expect(copies).toEqual([true, false]);
  });

  it("a lower version than one that failed its copy is still ignored (W-29)", () => {
    const game = readyBoth();
    game.bridge.sendSnapshot(wonWithData([nested(33)], 5));
    game.bridge.sendSnapshot(wonWithData([{}], 4));
    expect(game.posted).toEqual([]);
    expect(game.copies).toEqual([false]);
  });
});

describe("a pick on a book round (W-23's pre-check, RFC-003)", () => {
  it.each(["idle", "starting", "won", "lost"] as const)(
    "is not legal at %s, never not active, and never reaches the use case",
    status => {
      const game = readyBoth();
      game.bridge.sendSnapshot(bookSnapshot(status));
      game.posted.length = 0;
      game.send(action("p", 0, 0));
      expect(game.posted.map(p => p.message)).toEqual([
        reject("p", "not_legal"),
      ]);
      expect(game.picks).toEqual([]);
    },
  );

  it("a steps round after a book round is checked as before", () => {
    const game = readyBoth();
    game.bridge.sendSnapshot({
      ...bookSnapshot("won"),
      version: 1,
    } as ValidSnapshot);
    game.bridge.sendSnapshot({
      ...snapshot("resolving"),
      version: 2,
    } as ValidSnapshot);
    game.posted.length = 0;
    game.send(action("p", 0, 0));
    expect(game.posted.map(p => p.message)).toEqual([
      reject("p", "not_active"),
    ]);
  });
});
