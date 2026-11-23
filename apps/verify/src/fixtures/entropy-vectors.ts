import { entropyVectors } from "@intraverse/se-client-contracts/testing";

import type { Scripted, SolanaScript } from "./solana-rpc.ts";

type Json = Readonly<Record<string, unknown>>;

export type EntropyCase =
  | "produced-slot"
  | "skipped-slot"
  | "skipped-slots-long-term-storage"
  | "skipped-slot-ledger-gap";

export type EntropyCall = {
  readonly method: string;
  readonly params: unknown;
};

export type EntropyRead = {
  readonly slot: bigint;
  readonly script: SolanaScript;
  readonly calls: readonly EntropyCall[];
  readonly value: string | undefined;
  readonly valueSlot: bigint | undefined;
  readonly refusal: string | undefined;
};

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fail = (name: string, what: string): never => {
  throw new TypeError(`entropy/v1/solana/${name}: ${what}`);
};

const recordOf = (name: string, value: unknown, what: string): Json =>
  isRecord(value) ? value : fail(name, `${what} is not an object`);

const slotOf = (name: string, value: unknown, what: string): bigint =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? BigInt(value)
    : fail(name, `${what} is not a slot`);

const scriptedOf = (name: string, response: Json): Scripted => {
  const { error, result } = response;
  if (isRecord(error)) {
    const { code, message } = error;
    return typeof code === "number" && typeof message === "string"
      ? { error: code, message }
      : fail(name, "an error has no code and message");
  }
  return result === undefined
    ? fail(name, "a response has neither result nor error")
    : { result };
};

export const entropyRead = (name: EntropyCase): EntropyRead => {
  const file = recordOf(name, entropyVectors.solana[name], "the vector");
  const { rpc, block, valueSlot, refusal } = file;
  if (!Array.isArray(rpc)) return fail(name, "no rpc exchanges");
  const blocks: Record<string, Scripted> = {};
  const next: Record<string, Scripted> = {};
  const calls: EntropyCall[] = [];
  for (const item of rpc) {
    const exchange = recordOf(name, item, "an exchange");
    const request = recordOf(name, exchange["request"], "a request");
    const { method, params } = request;
    if (method === "getSlot") continue;
    if (typeof method !== "string" || !Array.isArray(params)) {
      return fail(name, "a request has no method and params");
    }
    calls.push({ method, params });
    const scripted = scriptedOf(
      name,
      recordOf(name, exchange["response"], "a response"),
    );
    const key = String(params[0]);
    if (method === "getBlock") blocks[key] = scripted;
    else if (method === "getBlocksWithLimit") next[key] = scripted;
  }
  const value = isRecord(block) ? block["blockValue"] : undefined;
  return {
    slot: slotOf(name, file["slot"], "slot"),
    script: { blocks, next },
    calls,
    value: typeof value === "string" ? value : undefined,
    valueSlot:
      valueSlot === undefined
        ? undefined
        : slotOf(name, valueSlot, "valueSlot"),
    refusal: typeof refusal === "string" ? refusal : undefined,
  };
};
