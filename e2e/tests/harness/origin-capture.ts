// Records each frame's origin before any page code runs, so the secret scan's
// one excuse (a `SecurityError` in a frame whose origin is "null") reads the
// origin the browser gave the frame, not one the page wrote over
// `self.origin`. The value is a non-writable, non-configurable global the page
// cannot replace.

import type { BrowserContext } from "@playwright/test";

/** The global the origin is recorded under; secret-scan-page.ts reads it. */
export const ORIGIN_AT_START = "__seE2eOriginAtStart";

// Runs in the page: no reference to anything outside its own body.
const recordOrigin = (name: string): void => {
  Object.defineProperty(globalThis, name, {
    value: globalThis.origin,
    writable: false,
    configurable: false,
    enumerable: false,
  });
};

export const captureOrigins = async (
  context: BrowserContext,
): Promise<void> => {
  await context.addInitScript(recordOrigin, ORIGIN_AT_START);
};
