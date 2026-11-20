// VT-14, the requests of the Solana chain read (RFC-007 section 4): sent as the
// Wrapper's are (no credentials, no cache, no referrer, no redirect), only an
// HTTP 200 is an answer, and a JSON-RPC error keeps its code, never its
// message.

import { describe, expect, it } from "vitest";

import type { ChainReadDeps } from "./chain-read.ts";
import { solanaCall } from "./solana-call.ts";

const URL_A = "https://sol-a.example/";

const idleClock = {
  setTimeout: () => 0,
  clearTimeout: (): void => {
    // Nothing was scheduled.
  },
};

/** A fetch answering `status` and `body` once, keeping what it was sent. */
const answering = (status: number, body: unknown) => {
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const deps: ChainReadDeps = {
    fetch: ((input: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(input), init });
      return Promise.resolve({
        status,
        json: () => Promise.resolve(body),
      } as Response);
    }) as typeof fetch,
    clock: idleClock,
  };
  return { deps, sent };
};

/** A fetch that throws, as the platform's does, when called with a `this`. */
const unboundOnly = function (this: unknown) {
  if (this !== undefined) throw new TypeError("Illegal invocation");
  return Promise.resolve({
    status: 200,
    json: () => Promise.resolve({ jsonrpc: "2.0", id: 1, result: 7 }),
  } as Response);
} as typeof fetch;

const call = (deps: ChainReadDeps) =>
  solanaCall(deps, URL_A, "getSlot", [{ commitment: "finalized" }]);

describe("solanaCall", () => {
  it("posts one JSON-RPC 2.0 call with no credentials, cache, referrer, or redirect", async () => {
    const { deps, sent } = answering(200, {
      jsonrpc: "2.0",
      id: 1,
      result: 7,
    });
    expect(await call(deps)).toEqual({ kind: "result", result: 7 });
    expect(sent).toHaveLength(1);
    const [{ url, init } = { url: "", init: undefined }] = sent;
    expect(url).toBe(URL_A);
    expect(init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      redirect: "error",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "getSlot",
      params: [{ commitment: "finalized" }],
    });
  });

  it("keeps a JSON-RPC error's code, and nothing of its message", async () => {
    const { deps } = answering(200, {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32_007, message: "Slot 1 was skipped" },
    });
    expect(await call(deps)).toEqual({ kind: "error", code: -32_007 });
  });

  it.each([201, 204, 301, 404, 429, 500])(
    "is no answer for HTTP %i, even with a result",
    async status => {
      const { deps } = answering(status, {
        jsonrpc: "2.0",
        id: 1,
        result: 7,
      });
      expect(await call(deps)).toEqual({ kind: "none" });
    },
  );

  it.each<[string, unknown]>([
    ["no jsonrpc", { id: 1, result: 7 }],
    ["another jsonrpc", { jsonrpc: "1.0", id: 1, result: 7 }],
    ["no result and no error", { jsonrpc: "2.0", id: 1 }],
    ["an error without a code", { jsonrpc: "2.0", id: 1, error: {} }],
    [
      "an error code that is text",
      { jsonrpc: "2.0", error: { code: "-32007" } },
    ],
    [
      "an error code that is a fraction",
      { jsonrpc: "2.0", error: { code: -1.5 } },
    ],
    ["an array", [{ jsonrpc: "2.0", id: 1, result: 7 }]],
    ["null", null],
  ])("is no answer for a body with %s", async (_name, body) => {
    const { deps } = answering(200, body);
    expect(await call(deps)).toEqual({ kind: "none" });
  });

  it("is no answer when the fetch fails, as on a redirect", async () => {
    const deps: ChainReadDeps = {
      fetch: (() =>
        Promise.reject(
          new TypeError("redirect mode is error"),
        )) as typeof fetch,
      clock: idleClock,
    };
    expect(await call(deps)).toEqual({ kind: "none" });
  });

  it("calls fetch unbound, as the platform's requires", async () => {
    const deps: ChainReadDeps = { fetch: unboundOnly, clock: idleClock };
    expect(await call(deps)).toEqual({ kind: "result", result: 7 });
  });
});
