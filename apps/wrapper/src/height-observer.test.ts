// T-9a, 8 (W-49d, W-57 "The height", ADR-010): `resize` reports `H_min`, the
// bar's reserved height rounded up plus the stage's minimum, never the
// viewport's or the body's box. It is measured once, then at most once per
// animation frame, and passed on only when it changed: a change of the
// iframe's height alone reports nothing; a width or text-size change, which
// changes the bar's reserved height, reports the new minimum; a `min-height`
// that does not parse is the default S, never 0. The bar is sticky only while
// it takes at most half the viewport, and the alert line takes a tab stop
// whenever its text overflows, a size change with no state change included.

import { describe, expect, it } from "vitest";

import {
  followBarLayout,
  minimumHeight,
  observeHeight,
  STAGE_MINIMUM_PX,
  stageMinimumOf,
} from "./height-observer.ts";

const ignore = (): void => {};

/** The stage's minimum at the default text size: 16.875rem. */
const S = 270;

type Layout = { bar: number; stageMinimum: number };

/** A document with the UI's bar and stage, sized from `layout`. */
const documentOf = (layout: Layout, rendered = true): Document => {
  const bar = { getBoundingClientRect: () => ({ height: layout.bar }) };
  const stage = { stage: true };
  return {
    querySelector: (selector: string) => {
      if (!rendered) return null;
      return selector === ".se-bar" ? bar : stage;
    },
  } as unknown as Document;
};

/** Observes `doc`; the frames and the observer's callback are the test's. */
const observed = (doc: Document, layout: Layout) => {
  const heights: number[] = [];
  const frames: (() => void)[] = [];
  const elements: unknown[] = [];
  let resize: () => void = ignore;
  observeHeight(
    {
      doc,
      createObserver: callback => {
        resize = callback;
        return { observe: element => elements.push(element) };
      },
      requestFrame: callback => frames.push(callback),
      minHeightOf: () => layout.stageMinimum,
    },
    next => heights.push(next),
  );
  return {
    heights,
    elements,
    frames,
    resize: (): void => {
      resize();
      frames.shift()?.();
    },
    resizeOnly: (): void => resize(),
  };
};

describe("minimumHeight (W-49d)", () => {
  it("is the bar's height rounded up plus the stage's minimum", () => {
    expect(minimumHeight(296, S)).toBe(566);
    expect(minimumHeight(296.2, S)).toBe(567);
    expect(minimumHeight(296.2, 270.4)).toBe(568);
  });
});

describe("stageMinimumOf (W-49d)", () => {
  it("reads the computed min-height in CSS pixels", () => {
    expect(stageMinimumOf("270px")).toBe(270);
    expect(stageMinimumOf("540px")).toBe(540);
  });

  it.each(["", "auto", "0px", "-5px", "NaNpx"])(
    "falls back to the default S for %j, so the minimum is never under-reported",
    value => {
      expect(stageMinimumOf(value)).toBe(STAGE_MINIMUM_PX);
    },
  );
});

describe("observeHeight (W-49d)", () => {
  it("reports H_min once, observing the bar and the stage", () => {
    const layout = { bar: 296, stageMinimum: S };
    const run = observed(documentOf(layout), layout);
    expect(run.heights).toEqual([566]);
    expect(run.elements).toHaveLength(2);
  });

  it("measures at most once per frame however many resizes", () => {
    const layout = { bar: 296, stageMinimum: S };
    const run = observed(documentOf(layout), layout);
    layout.bar = 320;
    run.resizeOnly();
    run.resizeOnly();
    expect(run.frames).toHaveLength(1);
    run.frames.shift()?.();
    expect(run.heights).toEqual([566, 590]);
  });

  it("reports nothing when only the iframe's height changes: the minimum is the same", () => {
    const layout = { bar: 296, stageMinimum: S };
    const run = observed(documentOf(layout), layout);
    // The stage grows and shrinks with the iframe; the bar keeps its height.
    run.resize();
    run.resize();
    expect(run.heights).toEqual([566]);
  });

  it("reports the new minimum on a text-size change, which scales the bar and the stage's minimum", () => {
    const layout = { bar: 296, stageMinimum: S };
    const run = observed(documentOf(layout), layout);
    layout.bar = 592;
    layout.stageMinimum = 540;
    run.resize();
    expect(run.heights).toEqual([566, 1132]);
  });

  it("reports nothing before the UI rendered its bar and stage", () => {
    const layout = { bar: 296, stageMinimum: S };
    const run = observed(documentOf(layout, false), layout);
    expect(run.heights).toEqual([]);
    expect(run.elements).toEqual([]);
  });
});

/** A bar `bar` tall in a viewport `viewport` tall; resizes are the test's. */
const stickiness = (sizes: {
  bar: number;
  viewport: number;
  alertText?: number;
}) => {
  const attributes = new Map<string, boolean>();
  let resize: () => void = ignore;
  let viewport: () => void = ignore;
  const bar = {
    getBoundingClientRect: () => ({ height: sizes.bar }),
    toggleAttribute: (name: string, on: boolean) => attributes.set(name, on),
  };
  const alertAttributes = new Map<string, string>();
  const alert = {
    get scrollHeight() {
      return sizes.alertText ?? 0;
    },
    clientHeight: 60,
    setAttribute: (name: string, value: string) =>
      alertAttributes.set(name, value),
    removeAttribute: (name: string) => alertAttributes.delete(name),
  };
  const doc = {
    querySelector: (selector: string) =>
      selector === ".se-alert" ? alert : bar,
    documentElement: {
      get clientHeight() {
        return sizes.viewport;
      },
    },
  } as unknown as Document;
  followBarLayout({
    doc,
    createObserver: callback => {
      resize = callback;
      return { observe: ignore };
    },
    onViewportResize: callback => {
      viewport = callback;
    },
  });
  return {
    sticky: () => attributes.get("data-sticky"),
    alertTabStop: () => alertAttributes.get("tabindex"),
    resize: () => resize(),
    viewportResize: () => viewport(),
  };
};

describe("followBarLayout (W-57)", () => {
  it("is sticky while the bar takes at most half the viewport", () => {
    const sizes = { bar: 250, viewport: 500 };
    const run = stickiness(sizes);
    expect(run.sticky()).toBe(true);
    // A high zoom: the bar now takes more than half; the page scrolls whole.
    sizes.bar = 500;
    run.resize();
    expect(run.sticky()).toBe(false);
    // The viewport grows (the window's `resize`).
    sizes.viewport = 1200;
    run.viewportResize();
    expect(run.sticky()).toBe(true);
  });

  it("gives the alert line a tab stop while its text overflows, on a size change too", () => {
    const sizes = { bar: 250, viewport: 500, alertText: 40 };
    const run = stickiness(sizes);
    expect(run.alertTabStop()).toBeUndefined();
    // A narrower width or a larger text size: the same error now overflows.
    sizes.alertText = 120;
    run.resize();
    expect(run.alertTabStop()).toBe("0");
    sizes.alertText = 40;
    run.viewportResize();
    expect(run.alertTabStop()).toBeUndefined();
  });
});
