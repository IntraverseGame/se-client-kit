// The e2e suite's fake JSON-RPC endpoints, for the shell's tip check (W-26b):
// a Playwright route on each endpoint the round configuration lists, so no
// request leaves the browser process. Each endpoint is one provider, and
// answers as scripted (`behave`):
// - `agree`: the chain id the configuration pins, a `finalized` block at the
//   round's `N`, and one hash for every block, the same as every agreeing
//   provider's: the tip check passes (with the `tip` bind, `N` is the tip);
// - `other-hash`: as `agree`, but another hash for every block: the endpoints
//   disagree at `h_low` (`hash-mismatch`, "this round failed verification");
// - `other-chain`: another chain id (`chain-id-mismatch`, also "failed
//   verification");
// - `error`: a JSON-RPC `error` for every call, so the endpoint gives no answer
//   (`too-few-answered` with a quorum of 2, "could not verify the chain").
// The Wrapper's origin differs from the endpoints', so every answer carries the
// CORS headers, and a preflight is answered. A call the fake does not know is
// recorded as unexpected (the round fixture fails the test). Nothing here logs.

import type { BrowserContext, Route } from "@playwright/test";

export type ProviderBehavior = "agree" | "other-hash" | "other-chain" | "error";

export type RpcEndpointConfig = {
  readonly provider: string;
  readonly url: string;
};

export type FakeRpcOptions = {
  readonly endpoints: readonly RpcEndpointConfig[];
  /** The chain id the configuration pins for the round's source. */
  readonly chainId: bigint;
  /** The round's `proofs.randomnessProof.blockNumber` (`N`). */
  readonly blockNumber: bigint;
  /** The origin the Wrapper calls from, for CORS. */
  readonly allowOrigin: string;
};

/** One call the fake answered. */
export type RpcCallRecord = {
  readonly provider: string;
  readonly method: string;
  readonly params: unknown;
};

export type FakeRpc = {
  /** How `provider` answers from now on (`agree` by default). */
  readonly behave: (provider: string, behavior: ProviderBehavior) => void;
  readonly calls: () => readonly RpcCallRecord[];
  readonly unexpected: () => readonly string[];
  readonly install: (context: BrowserContext) => Promise<void>;
};

/** A JSON-RPC answer: its `result`, or an `error`. */
export type RpcAnswer =
  | { readonly result: unknown }
  | { readonly error: { readonly code: number; readonly message: string } };

const quantity = (value: bigint): string => `0x${value.toString(16)}`;

/** A block hash per height: `fork` tells the agreeing chain from another. */
export const blockHash = (height: bigint, fork: "a" | "b"): string =>
  `0x${fork === "a" ? "aa" : "bb"}${height.toString(16).padStart(62, "0")}`;

const isQuantity = (value: unknown): value is string =>
  typeof value === "string" && /^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(value);

/**
 * What a provider that behaves as `behavior` answers to `method` with `params`,
 * or `undefined` for a call the fake does not know.
 */
export const rpcAnswer = (
  behavior: ProviderBehavior,
  method: string,
  params: unknown,
  chain: { readonly chainId: bigint; readonly blockNumber: bigint },
): RpcAnswer | undefined => {
  if (behavior === "error") {
    return { error: { code: -32_000, message: "unavailable" } };
  }
  if (method === "eth_chainId") {
    return {
      result: quantity(
        behavior === "other-chain" ? chain.chainId + 1n : chain.chainId,
      ),
    };
  }
  if (method !== "eth_getBlockByNumber" || !Array.isArray(params)) {
    return undefined;
  }
  const [tag, full] = params as readonly unknown[];
  if (full !== false) return undefined;
  const height =
    tag === "finalized"
      ? chain.blockNumber
      : isQuantity(tag)
        ? BigInt(tag)
        : undefined;
  if (height === undefined) return undefined;
  const fork = behavior === "other-hash" ? "b" : "a";
  return {
    result: {
      number: quantity(height),
      hash: blockHash(height, fork),
      parentHash: blockHash(height - 1n, fork),
    },
  };
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const createFakeRpc = (options: FakeRpcOptions): FakeRpc => {
  const behaviors = new Map<string, ProviderBehavior>();
  const calls: RpcCallRecord[] = [];
  const unexpected: string[] = [];
  const cors = {
    "access-control-allow-origin": options.allowOrigin,
    "access-control-allow-methods": "POST",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  };

  const handle =
    (provider: string) =>
    async (route: Route): Promise<void> => {
      const request = route.request();
      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      let body: unknown;
      try {
        body = JSON.parse(request.postData() ?? "");
      } catch {
        body = undefined;
      }
      const method = isRecord(body) ? body["method"] : undefined;
      const params = isRecord(body) ? body["params"] : undefined;
      const answer =
        request.method() === "POST" &&
        isRecord(body) &&
        body["jsonrpc"] === "2.0" &&
        typeof method === "string"
          ? rpcAnswer(behaviors.get(provider) ?? "agree", method, params, {
              chainId: options.chainId,
              blockNumber: options.blockNumber,
            })
          : undefined;
      if (answer === undefined) {
        unexpected.push(
          `${provider}: ${request.method()} ${String(method ?? "no method")}`,
        );
        await route.fulfill({ status: 400, headers: cors, body: "" });
        return;
      }
      calls.push({ provider, method: String(method), params });
      await route.fulfill({
        status: 200,
        headers: { ...cors, "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: isRecord(body) ? (body["id"] ?? null) : null,
          ...answer,
        }),
      });
    };

  return {
    behave: (provider, behavior) => {
      behaviors.set(provider, behavior);
    },
    calls: () => [...calls],
    unexpected: () => [...unexpected],
    install: async context => {
      for (const endpoint of options.endpoints) {
        // oxlint-disable-next-line no-await-in-loop -- one route per endpoint, in order
        await context.route(endpoint.url, handle(endpoint.provider));
      }
    },
  };
};
