// A stand-in for the Wrapper's side of `se.delegation/1` (T-50's page states):
// a page at `PAGES_ORIGIN` that opens the signing page from a click, as the
// Wrapper does, records every message the window posts, and posts what the
// test gives it. It holds nothing secret: its request is the vendored
// accepted vector's.

import type { Page } from "@playwright/test";

import { PAGES_ORIGIN, SIGNER_ORIGIN } from "./origins.ts";
import { delegationVector } from "./replay-wallet.ts";

/** A message the window posted, as the opener received it. */
export type Received = { readonly data: unknown; readonly origin: string };

/** The request the Wrapper would send for the accepted vector. */
export const vectorRequest = (): Readonly<Record<string, unknown>> => {
  const vector = delegationVector();
  return {
    schema: "se.delegation/1",
    type: "request",
    actionKey: vector.actionKey,
    sessionId: vector.sessionId,
    expiry: vector.expiry,
    noticeId: vector.noticeId,
  };
};

/**
 * Loads the stand-in at `PAGES_ORIGIN`, clicks its opener, and returns the
 * signing window.
 */
export const openFromStandIn = async (page: Page): Promise<Page> => {
  await page.goto(`${PAGES_ORIGIN}/blank.html`);
  await page.evaluate(signer => {
    const received: unknown[] = [];
    const state: { handle: Window | null } = { handle: null };
    Object.defineProperty(globalThis, "seReceived", { value: received });
    Object.defineProperty(globalThis, "seSend", {
      value: (message: unknown) => {
        state.handle?.postMessage(message, signer);
      },
    });
    globalThis.addEventListener("message", event => {
      if (event.source === state.handle) {
        received.push({ data: event.data as unknown, origin: event.origin });
      }
    });
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Open the signing window";
    button.addEventListener("click", () => {
      state.handle = globalThis.open(
        `${signer}/`,
        "_blank",
        "popup,width=480,height=720",
      );
    });
    document.body.append(button);
  }, SIGNER_ORIGIN);
  const opened = page.context().waitForEvent("page");
  await page.getByRole("button", { name: "Open the signing window" }).click();
  const signing = await opened;
  await signing.waitForLoadState();
  return signing;
};

/** What the signing window posted to the stand-in so far. */
export const receivedBy = (page: Page): Promise<readonly Received[]> =>
  page.evaluate(
    () => (globalThis as { seReceived?: readonly Received[] }).seReceived ?? [],
  );

/** Posts `message` from the stand-in to the window, at the signer's origin. */
export const sendFrom = async (page: Page, message: unknown): Promise<void> => {
  await page.evaluate(data => {
    (globalThis as { seSend?: (value: unknown) => void }).seSend?.(data);
  }, message);
};
