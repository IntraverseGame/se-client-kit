// T-47, the host on a real `window` (SP-9): dropping the opener sets
// `window.opener` to `null`, and closing the window calls the window's own
// `close()`; neither happens before the page asks for it.

import { describe, expect, it } from "vitest";

import { windowHost } from "./start-page.ts";

type FakeWindow = {
  opener: unknown;
  closes: number;
  readonly close: () => void;
  readonly location: { readonly origin: string };
};

const fakeWindow = (): FakeWindow => {
  const page: FakeWindow = {
    opener: { postMessage: () => null },
    closes: 0,
    close: () => {
      page.closes += 1;
    },
    location: { origin: "https://signer.example-signer.test" },
  };
  return page;
};

/** The host on the fake window; the root is never used here. */
const hostOn = (page: FakeWindow) =>
  windowHost(page as unknown as Window, {} as HTMLElement);

describe("windowHost (SP-9)", () => {
  it("reads the opener, and drops it only when asked", () => {
    const page = fakeWindow();
    const host = hostOn(page);
    expect(host.readOpener()).toBe(page.opener);
    expect(page.closes).toBe(0);
    host.dropOpener();
    expect(page.opener).toBeNull();
    expect(host.readOpener()).toBeNull();
    expect(page.closes).toBe(0);
  });

  it("closes the window through its own close()", () => {
    const page = fakeWindow();
    const host = hostOn(page);
    host.closeWindow();
    expect(page.closes).toBe(1);
  });
});
