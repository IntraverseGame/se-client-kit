// The offline and network-failure harness of T-15. Two levers, which a test
// combines as the case needs:
//
// - `goOffline` / `goOnline`: the browser's own offline emulation
//   (`navigator.onLine`, the `offline` and `online` events, and failed
//   requests), plus the fake Play API cut, so a request fails the same way in
//   every browser;
// - `cutPlayApi` / `restorePlayApi`: only the Play API fails, as a network
//   failure, while the page stays online (a lost connection to the backend).
//
// A single failing or never-answering call is scripted on the fake instead
// (`network-failure` and `hang` answers).

import type { BrowserContext } from "@playwright/test";

import type { FakePlayApi } from "./fake-play-types.ts";

export type NetworkControl = {
  readonly goOffline: () => Promise<void>;
  readonly goOnline: () => Promise<void>;
  readonly cutPlayApi: () => void;
  readonly restorePlayApi: () => void;
};

export const networkControl = (
  context: BrowserContext,
  fake: FakePlayApi,
): NetworkControl => ({
  goOffline: async () => {
    fake.cut();
    await context.setOffline(true);
  },
  goOnline: async () => {
    await context.setOffline(false);
    fake.restore();
  },
  cutPlayApi: () => {
    fake.cut();
  },
  restorePlayApi: () => {
    fake.restore();
  },
});
