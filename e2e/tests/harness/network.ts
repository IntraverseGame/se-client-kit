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
//
// `sent` is every Play API call the page sent, read from the browser context's
// `request` event rather than from a route: offline, Playwright's Firefox
// fails a request before any route sees it, so the fake records none of them
// there (`OFFLINE_ROUTED`, proven in network.spec.ts). Like the fake's own
// records, it is kept in memory for the test and never logged.

import type { BrowserContext, PlaywrightWorkerOptions } from "@playwright/test";

import { playApiPrefix } from "./fake-play-api.ts";
import type { FakePlayApi } from "./fake-play-types.ts";
import { decodeBody, routeOf } from "./fake-play-wire.ts";
import type { PlayOperationId } from "./play-api-document.ts";

export type NetworkControl = {
  readonly goOffline: () => Promise<void>;
  readonly goOnline: () => Promise<void>;
  readonly cutPlayApi: () => void;
  readonly restorePlayApi: () => void;
  /**
   * The decoded body of every call to `id` the page sent, in order, whether a
   * route saw it or not.
   */
  readonly sent: (id: PlayOperationId) => readonly unknown[];
};

/**
 * Whether the fake's route sees a request the page makes while the browser is
 * offline (`context.setOffline(true)`), per project: Chromium and WebKit route
 * it (the fake records it and fails it, as cut); Playwright's Firefox fails it
 * with `NS_ERROR_OFFLINE` before any route, so the fake records nothing. The
 * context's `request` event sees it in every project. Proven in
 * network.spec.ts.
 */
export const OFFLINE_ROUTED: Readonly<
  Record<PlaywrightWorkerOptions["browserName"], boolean>
> = {
  chromium: true,
  firefox: false,
  webkit: true,
};

type SentCall = {
  readonly operationId: PlayOperationId;
  readonly body: unknown;
};

export const networkControl = (
  context: BrowserContext,
  fake: FakePlayApi,
): NetworkControl => {
  const base = new URL(fake.playApiBaseUrl);
  const prefix = playApiPrefix(fake.playApiBaseUrl);
  const sent: SentCall[] = [];
  context.on("request", request => {
    const url = new URL(request.url());
    if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) return;
    const operationId = routeOf(
      url.pathname.slice(prefix.length),
      request.method().toLowerCase(),
    );
    if (operationId === undefined) return;
    sent.push({ operationId, body: decodeBody(request.postData()) });
  });
  return {
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
    sent: id =>
      sent.filter(call => call.operationId === id).map(call => call.body),
  };
};
