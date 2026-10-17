// Keeps every test off the real network, in two layers. Here, the routes: a
// catch-all route, registered before any other, refuses every HTTP request that
// no fake origin answers, and a catch-all WebSocket route closes every
// WebSocket a page or frame opens before it connects (no origin the suite
// serves takes one). Both are recorded, and the fixture fails the test when any
// was made. Routes do not see everything: a WebSocket opened by a dedicated or
// service worker, WebRTC, and other traffic outside a route pass them
// unrecorded. Those are stopped by the second layer, the browser-level block
// (browser-flags.ts: no host name resolves), which records nothing; the
// worker sockets' tests prove they reach no host. Playwright runs the most recently registered
// matching route first, so the fake origins and the fake Play API, registered
// after, take their own requests.
//
// A recorded URL has every form of every known secret, and anything shaped like
// one, replaced by `[redacted]`.

import type { BrowserContext } from "@playwright/test";

import { redactSecrets, type SecretSource } from "./secret-needles.ts";

export type HermeticGuard = {
  /** The requests and WebSockets refused so far, redacted. */
  readonly refused: () => readonly string[];
  /** Returns the refused ones and forgets them, for tests that make them. */
  readonly takeRefused: () => readonly string[];
  /**
   * Every WebSocket URL a page opened, unredacted, for the secret scan only (a
   * mocked socket raises no page event). Never printed.
   */
  readonly webSocketUrls: () => readonly string[];
  /** Adds secrets to redact from the record. */
  readonly addSecretSource: (source: SecretSource) => void;
};

/** WebSocket close code 1008: policy violation. */
const POLICY_VIOLATION = 1008;

export const guardNetwork = async (
  context: BrowserContext,
): Promise<HermeticGuard> => {
  const refused: string[] = [];
  const sockets: string[] = [];
  const sources: SecretSource[] = [];
  await context.route("**/*", async route => {
    refused.push(route.request().url());
    await route.abort("blockedbyclient");
  });
  await context.routeWebSocket(/.*/u, async socket => {
    sockets.push(socket.url());
    refused.push(`websocket ${socket.url()}`);
    await socket.close({ code: POLICY_VIOLATION, reason: "hermetic e2e" });
  });
  const redacted = (urls: readonly string[]): readonly string[] =>
    urls.map(url => redactSecrets(url, sources));
  return {
    refused: () => redacted(refused),
    takeRefused: () => redacted(refused.splice(0)),
    webSocketUrls: () => [...sockets],
    addSecretSource: source => {
      sources.push(source);
    },
  };
};
