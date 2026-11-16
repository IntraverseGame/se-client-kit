// RFC-005's `inset` capability (W-38): the `hello`'s optional `capabilities`,
// a closed list, and the `layout` message the bridge sends a game that
// declared `inset`: right after its `hello` is accepted (after the `snapshot`
// due then, if any), which acknowledges the capability, then on every change.

import { describe, expect, it } from "vitest";

import { CONTROLLER_SCHEMA } from "./controller-protocol.ts";
import {
  createFakeGame,
  GAME_ORIGIN,
  HELLO,
  mount,
} from "./fixtures/fake-game.ts";
import { snapshot } from "./fixtures/vectors.ts";
import { parseGameMessage } from "./game-message.ts";

const INSET_HELLO = Object.freeze({ ...HELLO, capabilities: ["inset"] });

const layout = (insetBottom: number): unknown => ({
  schema: CONTROLLER_SCHEMA,
  type: "layout",
  insetBottom,
});

const types = (posted: readonly { readonly message: unknown }[]): unknown[] =>
  posted.map(({ message }) => (message as { readonly type: unknown }).type);

describe("the hello's capabilities (RFC-005, W-38)", () => {
  it("accepts a hello with or without the inset capability", () => {
    expect(parseGameMessage(HELLO)).toEqual({ kind: "hello", message: HELLO });
    expect(parseGameMessage(INSET_HELLO)).toEqual({
      kind: "hello",
      message: INSET_HELLO,
    });
  });

  it("ignores an unknown, repeated, empty, or malformed list", () => {
    for (const capabilities of [
      ["inset", "apron"],
      ["Inset"],
      ["inset", "inset"],
      [],
      "inset",
      [1],
      null,
      { 0: "inset", length: 1 },
    ]) {
      expect(parseGameMessage({ ...HELLO, capabilities }).kind).toBe("ignored");
    }
    expect(parseGameMessage({ ...INSET_HELLO, colour: "#000000" }).kind).toBe(
      "ignored",
    );
  });

  it("reads the list through own data properties only", () => {
    const list = ["inset"];
    Object.defineProperty(list, 0, {
      get: () => "inset",
      enumerable: true,
    });
    expect(parseGameMessage({ ...HELLO, capabilities: list }).kind).toBe(
      "ignored",
    );
  });
});

describe("the layout message (RFC-005, W-38)", () => {
  it("acknowledges the capability right after the hello, after the snapshot", () => {
    const seen: unknown[] = [];
    const game = createFakeGame({
      insetBottom: () => 101.2,
      onCapabilities: capabilities => {
        seen.push(capabilities);
      },
    });
    const bridge = mount(game);
    bridge.sendSnapshot(snapshot("idle"));
    game.send(INSET_HELLO);
    expect(types(game.posted)).toEqual(["snapshot", "layout"]);
    expect(game.posted[1]).toEqual({
      message: layout(102),
      targetOrigin: GAME_ORIGIN,
    });
    expect(seen).toEqual([["inset"]]);
  });

  it("acknowledges it with no snapshot due, at 0 when no value is given", () => {
    const game = createFakeGame();
    mount(game);
    game.send(INSET_HELLO);
    expect(game.posted.map(({ message }) => message)).toEqual([layout(0)]);
  });

  it("sends a change only, and only to a game that declared inset", () => {
    const game = createFakeGame({ insetBottom: () => 100 });
    const bridge = mount(game);
    bridge.layout(50);
    expect(game.posted).toEqual([]);
    game.send(INSET_HELLO);
    bridge.layout(100);
    bridge.layout(99.5);
    bridge.layout(100);
    bridge.layout(0);
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      bridge.layout(bad);
    }
    expect(game.posted.map(({ message }) => message)).toEqual([
      layout(100),
      layout(0),
    ]);
    const plain = createFakeGame({ insetBottom: () => 100 });
    const other = mount(plain);
    const capabilities: unknown[] = [];
    const told = createFakeGame({
      onCapabilities: list => capabilities.push(list),
    });
    mount(told);
    told.send(HELLO);
    plain.send(HELLO);
    other.layout(10);
    expect(plain.posted).toEqual([]);
    expect(capabilities).toEqual([[]]);
  });

  it("sends nothing to an incompatible or closed bridge", () => {
    const game = createFakeGame({ insetBottom: () => 10 });
    const bridge = mount(game);
    game.send({ ...INSET_HELLO, statuses: ["idle"] });
    bridge.layout(20);
    expect(game.posted).toEqual([]);
    const closed = createFakeGame();
    const other = mount(closed);
    closed.send(INSET_HELLO);
    other.close();
    other.layout(30);
    expect(closed.posted.map(({ message }) => message)).toEqual([layout(0)]);
  });

  it("answers no layout when the snapshot due makes the game incompatible", () => {
    const game = createFakeGame();
    const bridge = mount(game);
    bridge.sendSnapshot(snapshot("idle"));
    game.send({ ...INSET_HELLO, presentations: ["playback"] });
    expect(game.posted).toEqual([]);
    expect(game.incompatible()).toBe(1);
  });
});
