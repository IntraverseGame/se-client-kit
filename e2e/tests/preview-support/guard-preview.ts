// The preview project's network guard (RFC-002, "Lifting the hermetic blocks,
// only for allowed hosts"), `guardPreview`, which replaces the hermetic guard
// (`harness/hermetic.ts`) in the preview fixtures only. Deny by default, with
// one narrow allow-list, fixed when the config loads and matched exactly on
// serialized origin, with no pattern: a request to an allowed origin continues
// to the network, and any other is aborted and recorded. The WebSocket route
// does the same, connecting an allowed URL to its server and closing any other
// with the policy-violation code.
//
// A record holds the origin only, never the URL: the path or query of an RPC URL
// can hold a provider key, so neither the record, nor the failure message built
// from it, nor the report ever carries one. The origin of a refused request is
// still passed through the redaction of every known secret.

import type { BrowserContext } from "@playwright/test";

import { redactSecrets, type SecretSource } from "../harness/secret-needles.ts";

/** WebSocket close code 1008: policy violation. */
const POLICY_VIOLATION = 1008;

/** What a record says when a URL cannot be parsed: no part of it. */
const NOT_A_URL = "(not a URL)";

export type PreviewGuard = {
  /** The origins refused so far (HTTP, and `websocket <origin>`), redacted. */
  readonly refused: () => readonly string[];
  /** Returns the refused ones and forgets them, for tests that make them. */
  readonly takeRefused: () => readonly string[];
  /**
   * Every WebSocket URL a page opened, unredacted, for the secret scan only.
   * Never printed.
   */
  readonly webSocketUrls: () => readonly string[];
  /** Adds secrets to redact from the record. */
  readonly addSecretSource: (source: SecretSource) => void;
};

/** `url`'s origin as HTTP sees it (`wss:` is `https:`), or `undefined`. */
const httpOriginOf = (url: string): string | undefined => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "wss:") parsed.protocol = "https:";
    else if (parsed.protocol === "ws:") parsed.protocol = "http:";
    return parsed.origin === "null" ? undefined : parsed.origin;
  } catch {
    return undefined;
  }
};

/** Whether `url`'s origin is on `allowed` (exact match, no pattern). */
export const isAllowedUrl = (
  allowed: readonly string[],
  url: string,
): boolean => {
  const origin = httpOriginOf(url);
  return origin !== undefined && allowed.includes(origin);
};

/** A request the test itself made to an origin off the allow-list. */
export class OriginRefusedError extends Error {
  readonly origin: string;

  constructor(origin: string) {
    super(`refused an origin that is not on the allow-list: ${origin}`);
    this.name = "OriginRefusedError";
    this.origin = origin;
  }
}

/**
 * Fails, naming the origin only, unless `url` is on `allowed`. For the requests
 * the test makes itself (the verify API read, the environment document), which
 * do not pass through the browser's routes.
 */
export const assertAllowedUrl = (
  allowed: readonly string[],
  url: string,
): void => {
  if (isAllowedUrl(allowed, url)) return;
  throw new OriginRefusedError(httpOriginOf(url) ?? NOT_A_URL);
};

export const guardPreview = async (
  context: BrowserContext,
  allowed: readonly string[],
): Promise<PreviewGuard> => {
  const refused: string[] = [];
  const sockets: string[] = [];
  const sources: SecretSource[] = [];
  await context.route("**/*", async route => {
    const url = route.request().url();
    if (isAllowedUrl(allowed, url)) {
      await route.continue();
      return;
    }
    refused.push(httpOriginOf(url) ?? NOT_A_URL);
    await route.abort("blockedbyclient");
  });
  await context.routeWebSocket(/.*/u, async socket => {
    sockets.push(socket.url());
    if (isAllowedUrl(allowed, socket.url())) {
      socket.connectToServer();
      return;
    }
    refused.push(`websocket ${httpOriginOf(socket.url()) ?? NOT_A_URL}`);
    await socket.close({ code: POLICY_VIOLATION, reason: "hermetic e2e" });
  });
  const redacted = (items: readonly string[]): readonly string[] =>
    items.map(item => redactSecrets(item, sources));
  return {
    refused: () => redacted(refused),
    takeRefused: () => redacted(refused.splice(0)),
    webSocketUrls: () => [...sockets],
    addSecretSource: source => {
      sources.push(source);
    },
  };
};
