// The height the operator page is told (W-49d, W-57 "The height", ADR-010):
// the least height the Wrapper's content needs at its current width and text
// size, `H_min = ceil(B) + S`: the control bar's reserved height `B`, measured
// and rounded up, plus the stage's minimum `S` (its computed `min-height`,
// 16.875rem, 270 CSS pixels at the default text size). Never the viewport's
// height or the `<body>`'s box: the Wrapper fills its iframe's viewport, so
// those would only echo the iframe's height and could loop with a page that
// sets the iframe's height from them. `B` changes only with the width or the
// text size (each slot of the bar reserves its height, so no state makes it
// grow), so neither a state change nor a change of the iframe's height alone
// changes the value. Measured once right after `welcome`, then whenever the
// bar's or the stage's size changes (observed with `ResizeObserver`), at most
// once per animation frame, and passed on only when it changed; the operator
// channel bounds it. The platform is injected, so tests drive the frames.

import { markOverflow } from "./bar-view.ts";

/** The bar's and the stage's elements, as render.ts builds them. */
const BAR = ".se-bar";
const STAGE = ".se-stage";
const STATUS_SLOT = ".se-status-slot";

/** The stage's minimum `S` at the default text size, in CSS pixels. */
export const STAGE_MINIMUM_PX = 270;

/**
 * A computed `min-height` (CSS pixels, as "270px") as a number; one that does
 * not parse to a positive length is the default `S`, so `resize` never
 * under-reports the minimum.
 */
export const stageMinimumOf = (minHeight: string): number => {
  const pixels = Number(minHeight.replace(/px$/u, ""));
  return Number.isFinite(pixels) && pixels > 0 ? pixels : STAGE_MINIMUM_PX;
};

/** The platform parts the observer uses. */
export type HeightPlatform = {
  readonly doc: Document;
  readonly createObserver: (onResize: () => void) => {
    readonly observe: (element: Element) => void;
  };
  readonly requestFrame: (callback: () => void) => void;
  /** An element's computed `min-height`, in CSS pixels. */
  readonly minHeightOf: (element: Element) => number;
};

/** `H_min = ceil(B) + S`, a whole number of CSS pixels. */
export const minimumHeight = (bar: number, stageMinimum: number): number =>
  Math.ceil(bar) + Math.ceil(stageMinimum);

/**
 * Measures now, then on every size change of the bar or the stage, coalesced
 * per frame; reports `H_min` when it changed. Nothing is reported before the UI
 * has rendered its bar and stage.
 */
export const observeHeight = (
  platform: HeightPlatform,
  onHeight: (height: number) => void,
): void => {
  const { doc } = platform;
  const bar = doc.querySelector(BAR);
  const stage = doc.querySelector(STAGE);
  if (bar === null || stage === null) return;
  let scheduled = false;
  let reported: number | undefined;
  const measure = (): void => {
    scheduled = false;
    const height = minimumHeight(
      bar.getBoundingClientRect().height,
      platform.minHeightOf(stage),
    );
    if (height === reported) return;
    reported = height;
    onHeight(height);
  };
  const observer = platform.createObserver(() => {
    if (scheduled) return;
    scheduled = true;
    platform.requestFrame(measure);
  });
  observer.observe(bar);
  observer.observe(stage);
  measure();
};

/**
 * Follows the bar's layout as the viewport, the width, or the text size change
 * (W-57 "The height"). The bar is sticky at the bottom of the viewport only
 * while it takes at most half of it: below the minimum the stage then scrolls
 * under it with the status line and the money controls in view; a taller bar (a
 * high zoom) is not sticky, and the page scrolls as a whole with nothing
 * hidden. It sets the bar's `data-sticky` attribute (the stylesheet makes it
 * sticky), never a style value; standalone and framed alike. The status slot,
 * which holds the alert line, takes a tab stop while its text overflows
 * (`markOverflow`).
 */
export const followBarLayout = (
  platform: Pick<HeightPlatform, "doc" | "createObserver"> & {
    /** Subscribes to the viewport's resizes (the window's `resize`). */
    readonly onViewportResize: (onResize: () => void) => void;
  },
): void => {
  const { doc } = platform;
  const bar = doc.querySelector(BAR);
  if (bar === null) return;
  const apply = (): void => {
    bar.toggleAttribute(
      "data-sticky",
      bar.getBoundingClientRect().height <=
        doc.documentElement.clientHeight / 2,
    );
    const slot = doc.querySelector(STATUS_SLOT);
    if (slot !== null) markOverflow(slot);
  };
  platform.createObserver(apply).observe(bar);
  platform.onViewportResize(apply);
  apply();
};
