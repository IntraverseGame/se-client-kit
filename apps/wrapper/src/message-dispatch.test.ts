// T-9a, 11: the Wrapper's one `message` listener routes by `event.source`
// before anything parses: the parent to the operator route, the game frame to
// the game route, anything else dropped; with no parent (a standalone page) a
// message from the page's own window reaches neither.

import { describe, expect, it } from "vitest";

import {
  createMessageDispatch,
  type MessageTarget,
  type RoutedMessage,
} from "./message-dispatch.ts";

const target = (): MessageTarget & {
  readonly fire: (source: unknown, data: unknown) => void;
  readonly count: () => number;
} => {
  const listeners = new Set<(event: MessageEvent) => void>();
  return {
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    fire: (source, data) => {
      const event = { source, origin: "https://a.example", data };
      for (const listener of listeners) listener(event as MessageEvent);
    },
    count: () => listeners.size,
  };
};

describe("createMessageDispatch (W-49b)", () => {
  it("routes the parent to the operator and the frame to the game, nothing else", () => {
    const page = target();
    const parent = {};
    const frame = {};
    const dispatch = createMessageDispatch(page, parent);
    const operator: RoutedMessage[] = [];
    const game: RoutedMessage[] = [];
    dispatch.onOperator(message => operator.push(message));
    const stop = dispatch.onGame(frame, message => game.push(message));
    page.fire(parent, "a");
    page.fire(frame, "b");
    page.fire({}, "c");
    page.fire(null, "d");
    expect(operator.map(message => message.data)).toEqual(["a"]);
    expect(game.map(message => message.data)).toEqual(["b"]);
    expect(operator[0]).toEqual({
      source: parent,
      origin: "https://a.example",
      data: "a",
    });
    stop();
    page.fire(frame, "e");
    expect(game).toHaveLength(1);
    expect(page.count()).toBe(1);
    dispatch.close();
    expect(page.count()).toBe(0);
  });

  it("has no operator route on a standalone page", () => {
    const page = target();
    const self = {};
    const dispatch = createMessageDispatch(page);
    const operator: unknown[] = [];
    dispatch.onOperator(message => operator.push(message));
    page.fire(self, "x");
    page.fire(undefined, "y");
    expect(operator).toEqual([]);
  });
});
