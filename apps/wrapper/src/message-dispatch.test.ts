// T-9a, 11: the Wrapper's one `message` listener routes by `event.source`
// before anything parses: the parent to the operator route, the game frame to
// the game route, anything else dropped; with no parent (a standalone page) a
// message from the page's own window reaches neither. The height observer
// (W-49d) measures once, then at most once per animation frame.

import { describe, expect, it } from "vitest";

import { observeHeight } from "./height-observer.ts";
import {
  createMessageDispatch,
  type MessageTarget,
  type RoutedMessage,
} from "./message-dispatch.ts";

const ignore = (): void => {};

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

/** A document whose body is `content` tall inside a viewport of 800. */
const documentOf = (content: () => number, withBody = true): Document =>
  ({
    // Never below the viewport, as the platform's `scrollHeight` is.
    documentElement: {
      get scrollHeight() {
        return Math.max(800, content());
      },
    },
    body: withBody
      ? { getBoundingClientRect: () => ({ height: content() }) }
      : null,
  }) as unknown as Document;

/** Observes `doc`; the frames and the observer's callback are the test's. */
const observed = (doc: Document) => {
  const heights: number[] = [];
  const frames: (() => void)[] = [];
  const elements: Element[] = [];
  let resize: () => void = ignore;
  observeHeight(
    {
      doc,
      createObserver: callback => {
        resize = callback;
        return { observe: element => elements.push(element) };
      },
      requestFrame: callback => frames.push(callback),
    },
    next => heights.push(next),
  );
  return {
    heights,
    elements,
    resize: (): void => {
      resize();
      frames.shift()?.();
    },
    frames,
    resizeOnly: (): void => resize(),
  };
};

describe("observeHeight (W-49d)", () => {
  it("measures once, then once per frame however many resizes", () => {
    let height = 300;
    const doc = documentOf(() => height);
    const run = observed(doc);
    expect(run.heights).toEqual([300]);
    expect(run.elements).toEqual([doc.documentElement, doc.body]);
    height = 420;
    run.resizeOnly();
    run.resizeOnly();
    expect(run.frames).toHaveLength(1);
    run.frames.shift()?.();
    expect(run.heights).toEqual([300, 420]);
    run.resizeOnly();
    expect(run.frames).toHaveLength(1);
  });

  it("reports a smaller height when the content shrinks below the viewport", () => {
    let height = 1200;
    const run = observed(documentOf(() => height));
    height = 500;
    run.resize();
    height = 300;
    run.resize();
    // The document's scrollHeight would stay at 800 once below the viewport.
    expect(run.heights).toEqual([1200, 500, 300]);
  });

  it("falls back to the document element where there is no body", () => {
    const run = observed(documentOf(() => 300, false));
    expect(run.heights).toEqual([800]);
    expect(run.elements).toHaveLength(1);
  });
});
