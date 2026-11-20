// T-41 (RFC-007 section 3): the tip check's JSON-RPC transport carries a
// Solana call as it carries an EVM one, with no change of code: the call's
// `params` as given (an object inside the array), a JSON number `result`
// resolved unread, and every answer that is not a `result` refused (a JSON-RPC
// error answered with HTTP 200, another status, a redirect).

import type { RpcCall } from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import { createJsonRpcTransport, type RpcFetch, RpcError } from "./json-rpc.ts";

// A tokenless endpoint on a reserved example host: no key, nothing resolves.
const ENDPOINT = { provider: "s1", url: "https://solana1.example" };
const GET_SLOT: RpcCall = {
  method: "getSlot",
  params: [{ commitment: "finalized" }],
};
const GET_GENESIS_HASH: RpcCall = { method: "getGenesisHash", params: [] };

type Sent = { readonly url: string; readonly init: Parameters<RpcFetch>[1] };

const answering = (
  status: number,
  body: unknown,
  sent: Sent[] = [],
): RpcFetch => {
  return (url, init) => {
    sent.push({ url, init });
    return Promise.resolve({ status, json: () => Promise.resolve(body) });
  };
};

describe("the JSON-RPC transport with a Solana call", () => {
  it("posts getSlot's params as given, an object inside the array, with W-3's options", async () => {
    const sent: Sent[] = [];
    const rpc = createJsonRpcTransport(
      answering(200, { jsonrpc: "2.0", id: 1, result: 312_000_000 }, sent),
    );
    await expect(rpc(ENDPOINT, GET_SLOT)).resolves.toBe(312_000_000);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(ENDPOINT.url);
    expect(sent[0]?.init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      redirect: "error",
    });
    expect(sent[0]?.init.body).toBe(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSlot",
        params: [{ commitment: "finalized" }],
      }),
    );
  });

  it("posts getGenesisHash with no params and resolves its string unread", async () => {
    const sent: Sent[] = [];
    const hash = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
    const rpc = createJsonRpcTransport(
      answering(200, { jsonrpc: "2.0", id: 1, result: hash }, sent),
    );
    await expect(rpc(ENDPOINT, GET_GENESIS_HASH)).resolves.toBe(hash);
    expect(sent[0]?.init.body).toBe(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getGenesisHash",
        params: [],
      }),
    );
  });

  it("resolves a result the shell refuses, unread (the shell validates it)", async () => {
    const rpc = createJsonRpcTransport(
      answering(200, { jsonrpc: "2.0", id: 1, result: -1.5 }),
    );
    await expect(rpc(ENDPOINT, GET_SLOT)).resolves.toBe(-1.5);
  });

  it.each([
    [
      "a JSON-RPC error answered with HTTP 200",
      200,
      {
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32_004, message: "Block not available" },
      },
    ],
    ["another status", 429, { jsonrpc: "2.0", id: 1, result: 312_000_000 }],
    ["a redirect status", 302, { jsonrpc: "2.0", id: 1, result: 312_000_000 }],
  ])("rejects %s", async (_what, status, body) => {
    const rpc = createJsonRpcTransport(answering(status, body));
    await expect(rpc(ENDPOINT, GET_SLOT)).rejects.toBeInstanceOf(RpcError);
  });

  it("rejects a redirect the platform refuses (redirect: error)", async () => {
    // With `redirect: "error"`, the platform `fetch` rejects on a redirect.
    const asked: string[] = [];
    const rpc = createJsonRpcTransport((_url, init) => {
      asked.push(init.redirect);
      return Promise.reject(new TypeError("redirect refused"));
    });
    await expect(rpc(ENDPOINT, GET_SLOT)).rejects.toThrow("redirect refused");
    expect(asked).toEqual(["error"]);
  });

  it("passes the call's abort signal", async () => {
    const sent: Sent[] = [];
    const rpc = createJsonRpcTransport(
      answering(200, { jsonrpc: "2.0", id: 1, result: 1 }, sent),
    );
    const controller = new AbortController();
    await rpc(ENDPOINT, GET_SLOT, controller.signal);
    expect(sent[0]?.init.signal).toBe(controller.signal);
  });
});
