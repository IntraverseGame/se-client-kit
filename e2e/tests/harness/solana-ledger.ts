import type { RpcAnswer } from "./fake-rpc.ts";
import { entropyVector } from "./vectors.ts";

export const SOLANA_CASES = [
  "produced-slot",
  "skipped-slot",
  "skipped-slots-long-term-storage",
  "skipped-slot-ledger-gap",
] as const;

export type SolanaCase = (typeof SOLANA_CASES)[number];

export type Exchange = {
  readonly method: string;
  readonly params: unknown;
  readonly answer: RpcAnswer;
};

export type SolanaLedger = {
  readonly name: SolanaCase;
  readonly slot: bigint;
  readonly finalizedSlot: bigint;
  readonly value: string | undefined;
  readonly snapshotVector: string | undefined;
  readonly exchanges: readonly Exchange[];
};

type Json = Readonly<Record<string, unknown>>;

const SNAPSHOT_PREFIX = "snapshot/valid/";

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fail = (name: string, what: string): never => {
  throw new Error(`entropy/v1/solana/${name}: ${what}`);
};

const slotOf = (name: string, value: unknown, what: string): bigint =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? BigInt(value)
    : fail(name, `${what} is not a slot`);

const answerOf = (name: string, response: unknown): RpcAnswer => {
  if (!isRecord(response)) return fail(name, "a response is not an object");
  const { error, result } = response;
  if (isRecord(error)) {
    const { code, message } = error;
    if (typeof code !== "number" || typeof message !== "string") {
      return fail(name, "an error has no code and message");
    }
    return { error: { code, message } };
  }
  return result === undefined
    ? fail(name, "a response has neither result nor error")
    : { result };
};

const exchangeOf = (name: string, item: unknown): Exchange => {
  if (!isRecord(item)) return fail(name, "an exchange is not an object");
  const { request, response } = item;
  if (!isRecord(request) || typeof request["method"] !== "string") {
    return fail(name, "a request has no method");
  }
  return {
    method: request["method"],
    params: request["params"],
    answer: answerOf(name, response),
  };
};

export const solanaLedger = (name: SolanaCase): SolanaLedger => {
  const file = entropyVector(name);
  const { rpc, snapshot, block } = file;
  if (!Array.isArray(rpc)) return fail(name, "no rpc exchanges");
  const snapshotName = typeof snapshot === "string" ? snapshot : undefined;
  const value = isRecord(block) ? block["blockValue"] : undefined;
  return {
    name,
    slot: slotOf(name, file["slot"], "slot"),
    finalizedSlot: slotOf(name, file["finalizedSlot"], "finalizedSlot"),
    value: typeof value === "string" ? value : undefined,
    snapshotVector: snapshotName?.startsWith(SNAPSHOT_PREFIX)
      ? snapshotName.slice(SNAPSHOT_PREFIX.length)
      : undefined,
    exchanges: rpc.map((item: unknown) => exchangeOf(name, item)),
  };
};

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(item => canonical(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .toSorted()
      .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
};

export const findExchange = (
  exchanges: readonly Exchange[],
  method: string,
  params: unknown,
): Exchange | undefined => {
  const wanted = canonical(params);
  return exchanges.find(
    exchange =>
      exchange.method === method && canonical(exchange.params) === wanted,
  );
};

const readOfN = (ledger: SolanaLedger): Exchange | undefined =>
  ledger.exchanges.find(
    exchange =>
      exchange.method === "getBlock" &&
      Array.isArray(exchange.params) &&
      exchange.params[0] === Number(ledger.slot),
  );

const blockOptionsOf = (ledger: SolanaLedger): unknown => {
  const params = readOfN(ledger)?.params;
  return Array.isArray(params) ? params[1] : undefined;
};

export const producedBlock = (ledger: SolanaLedger): Json | undefined => {
  const answer = readOfN(ledger)?.answer;
  return answer !== undefined && "result" in answer && isRecord(answer.result)
    ? answer.result
    : undefined;
};

export const SKIPPED_CODE = -32_007;

export const relocated = (
  ledger: SolanaLedger,
  moved: "skip" | "gap",
): readonly Exchange[] => {
  const block = producedBlock(ledger);
  if (block === undefined) {
    throw new Error(
      `${ledger.name}: slot ${ledger.slot.toString()} has no block to move`,
    );
  }
  const options = blockOptionsOf(ledger);
  const next = ledger.slot + (moved === "skip" ? 1n : 2n);
  const parent = moved === "skip" ? ledger.slot - 1n : ledger.slot + 1n;
  return [
    {
      method: "getBlock",
      params: [Number(ledger.slot), options],
      answer: {
        error: {
          code: SKIPPED_CODE,
          message: `Slot ${ledger.slot.toString()} was skipped, or missing due to ledger jump to recent snapshot`,
        },
      },
    },
    {
      method: "getBlocksWithLimit",
      params: [Number(ledger.slot), 1, { commitment: "finalized" }],
      answer: { result: [Number(next)] },
    },
    {
      method: "getBlock",
      params: [Number(next), options],
      answer: {
        result: { ...block, parentSlot: Number(parent) },
      },
    },
  ];
};
