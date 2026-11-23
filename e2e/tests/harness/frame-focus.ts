// Where the focus goes, per project, when a parent document calls `focus()` on
// one of its elements while one of its frames has the focus: the move W-46
// makes after a move in the game, from the game frame to the Wrapper's result
// or error heading. The Wrapper does not rely on that move: it blurs the
// focused frame element first (apps/wrapper/src/render.ts), so the move does
// not depend on the browser. This table pins each project's own outcome, so a
// browser that changes it shows here.
//
// - Chromium and WebKit move it to the element.
// - Playwright's Firefox build moves it too, from Playwright 1.65 (its
//   Firefox 159.0 build). In Playwright 1.64 (its Firefox 157.0 build) the
//   frame kept the focus unless the frame element was blurred first. Both
//   builds run every frame in its parent's process
//   (`fission.webContentIsolationStrategy` 0, in their `playwright.cfg`). A
//   release Firefox (159) moves it, the frame in or out of process (checked
//   by hand with pages of the same shape; not part of the suite).
//
// Proven in focus-from-frame.spec.ts, with the control the Wrapper relies on:
// with the frame element blurred first, the element takes the focus in every
// project.

import type { PlaywrightWorkerOptions } from "@playwright/test";

/** The outcomes focus-from-frame.spec.ts tells apart. */
export type FocusFromFrame = "moves to the element" | "stays in the frame";

export const FOCUS_FROM_FRAME: Readonly<
  Record<PlaywrightWorkerOptions["browserName"], FocusFromFrame>
> = {
  chromium: "moves to the element",
  firefox: "moves to the element",
  webkit: "moves to the element",
};
