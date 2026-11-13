// Test-only: the Wrapper's layout inside an operator's box, read inside its
// frame, and the checks T-27 holds it to (t27-filling-the-box.spec.ts).

import type { Frame, Page } from "@playwright/test";

import { expect } from "./fixtures.ts";
import { operatorReceived } from "./operator-page.ts";

/** An operator's box for the Wrapper, in CSS pixels. */
export type Box = { readonly width: number; readonly height: number };

export type Layout = {
  /** The document scrolls that way: a scroll moved it. */
  readonly scrollsX: boolean;
  readonly scrollsY: boolean;
  readonly clientHeight: number;
  /** The content's width, the scroll bar's gutter left out. */
  readonly clientWidth: number;
  readonly stage: readonly number[];
  readonly bar: number;
  readonly sticky: boolean;
  /** The centres of the menu, the status slot, and the start slot. */
  readonly centres: readonly number[];
  /** The primary controls and the round line fit their reserved rows. */
  readonly fits: boolean;
  /** The status slot shows all it holds, with no overflow. */
  readonly statusFits: boolean;
};

/**
 * The Wrapper's document and its stage, measured inside its iframe. Whether it
 * scrolls is tried, not read from `scrollWidth`, which counts the gutter that
 * `scrollbar-gutter: stable` keeps.
 */
export const measure = (): Layout => {
  const root = document.documentElement;
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in the page: `frame.evaluate` serializes only `measure`
  const rect = (selector: string): DOMRect =>
    document.querySelector(selector)?.getBoundingClientRect() ?? new DOMRect();
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in the page: `frame.evaluate` serializes only `measure`
  const scrolls = (left: number, top: number): boolean => {
    globalThis.scrollTo(left, top);
    const moved = globalThis.scrollX > 0 || globalThis.scrollY > 0;
    globalThis.scrollTo(0, 0);
    return moved;
  };
  const stage = rect(".se-stage");
  const slots = [".se-menu-slot", ".se-status-slot", ".se-start-slot"];
  return {
    scrollsX: scrolls(50, 0),
    scrollsY: scrolls(0, 50),
    clientHeight: root.clientHeight,
    clientWidth: root.clientWidth,
    stage: [stage.x, stage.y, stage.width, stage.height],
    bar: rect(".se-bar").height,
    sticky:
      document.querySelector<HTMLElement>(".se-bar")?.dataset["sticky"] !==
      undefined,
    centres: slots.map(selector => {
      const box = rect(selector);
      return Math.round(box.top + box.height / 2);
    }),
    statusFits: [".se-status-slot"].every(selector => {
      const slot = document.querySelector(selector);
      return (
        slot !== null &&
        slot.scrollHeight <= slot.clientHeight &&
        slot.scrollWidth <= slot.clientWidth
      );
    }),
    fits: [".se-controls", ".se-start-slot"].every(selector => {
      const slot = document.querySelector(selector);
      return slot !== null && slot.scrollHeight <= slot.clientHeight;
    }),
  };
};

export const layoutOf = (frame: Frame): Promise<Layout> =>
  frame.evaluate(measure);

/** The document is the box exactly, and the controls fit their rows. */
export const expectFills = (layout: Layout): void => {
  expect(layout.scrollsY).toBe(false);
  expect(layout.scrollsX).toBe(false);
  expect(layout.fits).toBe(true);
};

/** From 66rem (1056 CSS pixels): one line, one centre, 5.5rem (88) tall. */
export const expectOneLine = (box: Box, layout: Layout): void => {
  if (box.width < 1056) return;
  const [menu = 0, status = 0, start = 0] = layout.centres;
  expect([status, start]).toEqual([menu, menu]);
  expect(layout.bar).toBeLessThanOrEqual(90);
};

/** At 400 and 1280 CSS pixels a result's status slot fits, with no overflow. */
export const expectResultFits = (box: Box, layout: Layout): void => {
  if (box.width !== 400 && box.width !== 1280) return;
  expect(layout.statusFits).toBe(true);
};

/**
 * The alert sits in the status slot after the status line (W-57), its box
 * wholly inside the slot, scrolling (a tab stop) when its text overflows.
 */
export const alertInBar = (element: Element): boolean => {
  const slot = element.parentElement;
  const bar = document.querySelector(".se-bar")?.getBoundingClientRect();
  if (slot?.classList.contains("se-status-slot") !== true) return false;
  const own = slot.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  // Inside the bar, docked under the stage or floating over the band the
  // game left for it (RFC-005): never over the game's interface.
  return (
    bar !== undefined &&
    element.previousElementSibling?.classList.contains("se-status") === true &&
    own.top >= bar.top - 0.5 &&
    own.bottom <= bar.bottom + 0.5 &&
    box.top >= own.top - 0.5 &&
    box.bottom <= own.bottom + 0.5 &&
    box.left >= own.left - 0.5 &&
    box.right <= own.right + 0.5 &&
    (element.scrollHeight <= element.clientHeight ||
      element.getAttribute("tabindex") === "0")
  );
};

/** The `resize` heights the operator page received, in order. */
export const resizesOf = async (page: Page): Promise<number[]> =>
  (await operatorReceived(page))
    .filter(message => (message as { type?: unknown }).type === "resize")
    .map(message => (message as { height: number }).height);

/** The operator page sets the box's height, ignoring the minimum. */
export const shrinkBox = (height: number): void => {
  const box = document.querySelector<HTMLIFrameElement>(
    'iframe[name="wrapper"]',
  );
  box?.style.setProperty("min-height", "0");
  box?.style.setProperty("height", `${String(height)}px`);
};
