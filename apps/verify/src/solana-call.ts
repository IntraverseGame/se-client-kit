// One JSON-RPC call to a Solana endpoint for check 6 (RFC-007 section 4). It
// keeps the JSON-RPC error's `code`, which the skipped-slot path needs, and is
// sent as the Wrapper's tip-check calls are: no credentials, no cache, no
// referrer, and no redirect; only an HTTP 200 is an answer. Never the error's
// message: nothing of an answer but its result or its code is kept.

import {
  type ChainReadDeps,
  RPC_TIMEOUT_MS,
  throwIfAborted,
} from "./chain-read.ts";

/** What one call gave: a result, a JSON-RPC error's code, or no answer. */
export type SolanaReply =
  | { readonly kind: "result"; readonly result: unknown }
  | { readonly kind: "error"; readonly code: number }
  | { readonly kind: "none" };

const NONE: SolanaReply = { kind: "none" };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A JSON-RPC 2.0 response's result, or its error's integer code. */
const replyOf = (body: unknown): SolanaReply => {
  if (!isRecord(body) || body["jsonrpc"] !== "2.0") return NONE;
  if (Object.hasOwn(body, "error")) {
    const error = body["error"];
    const code = isRecord(error) ? error["code"] : undefined;
    return typeof code === "number" && Number.isSafeInteger(code)
      ? { kind: "error", code }
      : NONE;
  }
  return Object.hasOwn(body, "result")
    ? { kind: "result", result: body["result"] }
    : NONE;
};

/**
 * One call, with its own 15 s timeout on the injected clock: a timeout, a
 * network failure, a status other than 200, a redirect, or a body that is not a
 * JSON-RPC 2.0 response is no answer (`none`). The caller's `signal` is
 * different: when it aborts, the request ends and the call rejects with an
 * `AbortError`, so an abort is never mistaken for a silent endpoint.
 */
export const solanaCall = async (
  deps: ChainReadDeps,
  url: string,
  method: string,
  params: readonly unknown[],
  signal?: AbortSignal,
): Promise<SolanaReply> => {
  throwIfAborted(signal);
  const { fetch: doFetch, clock } = deps;
  // The timer and the caller's signal both end the request through this one.
  const controller = new AbortController();
  const onAbort = (): void => {
    controller.abort();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  const handle = clock.setTimeout(() => {
    controller.abort();
  }, RPC_TIMEOUT_MS);
  let reply: SolanaReply;
  try {
    const response = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      redirect: "error",
    });
    reply = response.status === 200 ? replyOf(await response.json()) : NONE;
  } catch {
    reply = NONE;
  } finally {
    clock.clearTimeout(handle);
    signal?.removeEventListener("abort", onAbort);
  }
  throwIfAborted(signal);
  return reply;
};
