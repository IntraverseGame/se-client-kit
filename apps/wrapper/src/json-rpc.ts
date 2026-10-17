// The JSON-RPC transport of the tip check (W-26b): one JSON-RPC 2.0 request
// per call over the platform `fetch`, with no credentials, no cache, no
// referrer, and no redirect (as the Play API's requests, W-3). It resolves with
// the response's `result`, unread (the shell validates it), and rejects on no
// response, a status other than 200, a body that is not JSON-RPC, or an
// `error`. The endpoints come only from the environment configuration. It logs
// nothing.

import type { RpcTransport } from "@intraverse/se-client-shell";

/** The parts of the platform `fetch` the transport calls. */
export type RpcFetch = (
  url: string,
  init: {
    readonly method: "POST";
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly credentials: "omit";
    readonly cache: "no-store";
    readonly referrerPolicy: "no-referrer";
    readonly redirect: "error";
    readonly signal?: AbortSignal;
  },
) => Promise<{
  readonly status: number;
  readonly json: () => Promise<unknown>;
}>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** An answer that does not carry a `result`. Its message holds no value. */
export class RpcError extends Error {
  public constructor() {
    super("the JSON-RPC endpoint gave no result");
    this.name = "RpcError";
  }
}

export const createJsonRpcTransport =
  (fetch: RpcFetch): RpcTransport =>
  async (endpoint, call, signal) => {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: call.method,
        params: call.params,
      }),
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      redirect: "error",
      // The shell's signal is the platform `AbortSignal` (rpc-transport.ts).
      ...(signal === undefined ? {} : { signal: signal as AbortSignal }),
    });
    if (response.status !== 200) throw new RpcError();
    const body = await response.json();
    if (
      !isRecord(body) ||
      body["jsonrpc"] !== "2.0" ||
      Object.hasOwn(body, "error") ||
      !Object.hasOwn(body, "result")
    ) {
      throw new RpcError();
    }
    return body["result"];
  };
