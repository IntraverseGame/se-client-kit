// Where the focus goes, per project, when a parent document calls `focus()` on
// one of its elements while one of its frames has the focus: the move W-46
// makes after a move in the game, from the game frame to the Wrapper's result
// or error heading. The Wrapper does not rely on that move: it blurs the
// focused frame element first (apps/wrapper/src/render.ts), and this table is
// why.
//
// - Chromium and WebKit move it to the element.
// - Playwright's Firefox build does not: the frame keeps the focus, unless the
//   frame element is blurred first. That build runs every frame in its
//   parent's process (`fission.webContentIsolationStrategy` 0, in its
//   `playwright.cfg`); with the frame out of process (that preference at 1)
//   the same call moves the focus, but the suite's Firefox project does not
//   run with it (tried on 2026-10-19: clicks into the game frame then timed
//   out, among other failures). A release Firefox (159) moves it, the
//   frame in or out of process (checked by hand with pages of the same shape;
//   not part of the suite).
//
// Proven in focus-from-frame.spec.ts, with the control the Wrapper relies on:
// with the frame element blurred first, the element takes the focus in every
// project.

import type { PlaywrightWorkerOptions } from "@playwright/test";

export type FocusFromFrame = "moves to the element" | "stays in the frame";

export const FOCUS_FROM_FRAME: Readonly<
  Record<PlaywrightWorkerOptions["browserName"], FocusFromFrame>
> = {
  chromium: "moves to the element",
  firefox: "stays in the frame",
  webkit: "moves to the element",
};
