// The tip check's JSON-RPC transport (W-26b): one JSON-RPC 2.0 POST per call,
// with W-3's request options, and only a `result` resolves.

import { describe, expect, it } from "vitest";

import { createJsonRpcTransport, type RpcFetch, RpcError } from "./json-rpc.ts";

const ENDPOINT = { provider: "p1", url: "https://rpc.example.net/base" };
const CHAIN_ID = { method: "eth_chainId", params: [] } as const;

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

describe("the JSON-RPC transport", () => {
  it("posts one JSON-RPC 2.0 request with no credentials, cache, referrer, or redirect", async () => {
    const sent: Sent[] = [];
    const rpc = createJsonRpcTransport(
      answering(200, { jsonrpc: "2.0", id: 1, result: "0x1" }, sent),
    );
    await expect(rpc(ENDPOINT, CHAIN_ID)).resolves.toBe("0x1");
    expect(sent).toEqual([
      {
        url: ENDPOINT.url,
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_chainId",
            params: [],
          }),
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          redirect: "error",
        },
      },
    ]);
  });

  it("passes the call's abort signal", async () => {
    const sent: Sent[] = [];
    const rpc = createJsonRpcTransport(
      answering(200, { jsonrpc: "2.0", id: 1, result: "0x1" }, sent),
    );
    const controller = new AbortController();
    await rpc(ENDPOINT, CHAIN_ID, controller.signal);
    expect(sent[0]?.init.signal).toBe(controller.signal);
  });

  it.each([
    ["an error", 200, { jsonrpc: "2.0", id: 1, error: { code: -1 } }],
    ["no result", 200, { jsonrpc: "2.0", id: 1 }],
    ["not JSON-RPC 2.0", 200, { id: 1, result: "0x1" }],
    ["not an object", 200, ["0x1"]],
    ["another status", 503, { jsonrpc: "2.0", id: 1, result: "0x1" }],
  ])("rejects %s", async (_what, status, body) => {
    const rpc = createJsonRpcTransport(answering(status, body));
    await expect(rpc(ENDPOINT, CHAIN_ID)).rejects.toBeInstanceOf(RpcError);
  });

  it("rejects when fetch gets no response", async () => {
    const rpc = createJsonRpcTransport(() =>
      Promise.reject(new TypeError("offline")),
    );
    await expect(rpc(ENDPOINT, CHAIN_ID)).rejects.toThrow("offline");
  });
});
