import type { BrowserContext, Route } from "@playwright/test";

import type {
  RpcAnswer,
  RpcCallRecord,
  RpcEndpointConfig,
} from "./fake-rpc.ts";
import {
  type Exchange,
  findExchange,
  relocated,
  type SolanaLedger,
} from "./solana-ledger.ts";

export type SolanaBehavior =
  | "agree"
  | "other-cluster"
  | "error"
  | "lagging"
  | "skip"
  | "gap"
  | "pruned";

export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export const TESTNET_GENESIS = "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY";

export const PRUNED_CODE = -32_001;

export type SolanaScene = {
  readonly ledger: SolanaLedger;
  readonly lagMargin: bigint;
};

export type FakeSolanaRpcOptions = SolanaScene & {
  readonly endpoints: readonly RpcEndpointConfig[];
  readonly allowOrigin: string;
};

export type FakeSolanaRpc = {
  readonly behave: (provider: string, behavior: SolanaBehavior) => void;
  readonly calls: () => readonly RpcCallRecord[];
  readonly unexpected: () => readonly string[];
  readonly install: (context: BrowserContext) => Promise<void>;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFinalized = (params: unknown): boolean =>
  Array.isArray(params) &&
  params.length === 1 &&
  isRecord(params[0]) &&
  Object.keys(params[0]).length === 1 &&
  params[0]["commitment"] === "finalized";

const isEmpty = (params: unknown): boolean =>
  Array.isArray(params) && params.length === 0;

export const exchangesFor = (
  behavior: SolanaBehavior,
  ledger: SolanaLedger,
): readonly Exchange[] =>
  behavior === "skip" || behavior === "gap"
    ? relocated(ledger, behavior)
    : ledger.exchanges;

const recognisedAnswer = (
  behavior: SolanaBehavior,
  method: string,
  params: unknown,
  scene: SolanaScene,
  exchanges: readonly Exchange[],
): RpcAnswer | undefined => {
  if (method === "getGenesisHash") {
    return isEmpty(params)
      ? {
          result:
            behavior === "other-cluster" ? TESTNET_GENESIS : MAINNET_GENESIS,
        }
      : undefined;
  }
  if (method === "getSlot") {
    if (!isFinalized(params)) return undefined;
    const lag = behavior === "lagging" ? scene.lagMargin + 1n : 0n;
    return { result: Number(scene.ledger.finalizedSlot - lag) };
  }
  const found = findExchange(exchanges, method, params);
  if (found === undefined) return undefined;
  return behavior === "pruned" && method === "getBlock"
    ? {
        error: {
          code: PRUNED_CODE,
          message: "Block cleaned up, does not exist on node",
        },
      }
    : found.answer;
};

export const solanaAnswer = (
  behavior: SolanaBehavior,
  method: string,
  params: unknown,
  scene: SolanaScene,
  exchanges: readonly Exchange[],
): RpcAnswer | undefined => {
  const answer = recognisedAnswer(behavior, method, params, scene, exchanges);
  return behavior === "error" && answer !== undefined
    ? { error: { code: -32_000, message: "unavailable" } }
    : answer;
};

export const createFakeSolanaRpc = (
  options: FakeSolanaRpcOptions,
): FakeSolanaRpc => {
  const behaviors = new Map<string, SolanaBehavior>();
  const exchanges = new Map<SolanaBehavior, readonly Exchange[]>();
  const exchangesOf = (behavior: SolanaBehavior): readonly Exchange[] =>
    exchanges.get(behavior) ?? options.ledger.exchanges;
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
      const behavior = behaviors.get(provider) ?? "agree";
      const method = isRecord(body) ? body["method"] : undefined;
      const params = isRecord(body) ? body["params"] : undefined;
      const answer =
        request.method() === "POST" &&
        isRecord(body) &&
        body["jsonrpc"] === "2.0" &&
        typeof method === "string"
          ? solanaAnswer(
              behavior,
              method,
              params,
              options,
              exchangesOf(behavior),
            )
          : undefined;
      if (answer === undefined) {
        unexpected.push(
          `${provider}: ${request.method()} ${String(method ?? "no method")} ${JSON.stringify(params)}`,
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
      if (!exchanges.has(behavior)) {
        exchanges.set(behavior, exchangesFor(behavior, options.ledger));
      }
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
